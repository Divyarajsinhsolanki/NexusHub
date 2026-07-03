import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  format, startOfDay, endOfDay, addDays, isSameDay, getDay, startOfWeek, endOfWeek, parse,
  differenceInMinutes, addMinutes, isBefore, isAfter, eachDayOfInterval, startOfMonth,
  endOfMonth, eachWeekOfInterval, isSameMonth, isSameWeek
} from 'date-fns';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClockIcon,
  CalendarIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ChartPieIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  PlayIcon,
  SparklesIcon,
  StopIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
  DocumentTextIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  TagIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/solid';
import {
  fetchWorkPriorities,
  fetchWorkCategories,
  fetchWorkTags,
  getWorkLogs,
  createWorkLog,
  updateWorkLog,
  deleteWorkLog,
  getWorkNote,
  createWorkNote,
  updateWorkNote
} from '../components/api';

const POMODORO_DURATION = 30; // minutes
const SHORT_BREAK_DURATION = 15; // minutes
const LONG_BREAK_DURATION = 30; // minutes
const POMODOROS_FOR_LONG_BREAK = 4;

// --- Helpers ---
const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return '';
  const sanitized = hex.replace('#', '');
  const bigint = parseInt(sanitized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const calculateTaskDuration = (task) => {
  if (!task?.startTime || !task?.endTime) return 0;
  const start = parse(task.startTime, 'HH:mm', new Date());
  const end = parse(task.endTime, 'HH:mm', new Date());
  let duration = differenceInMinutes(end, start);
  if (duration < 0) duration += 24 * 60;
  return Math.max(duration, 0);
};

// --- Reusable Components ---
const Modal = ({ children, isOpen, onClose }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="shell-panel shell-panel-strong max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-[30px] shadow-[0_34px_90px_rgb(15_23_42_/_0.22)]"
        >
          {children}
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

// --- Main WorkLog Component ---
const WorkLog = () => {
  // --- State Management ---
  const [priorities, setPriorities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [dailyNote, setDailyNote] = useState('');
  const [noteId, setNoteId] = useState(null);
  const [activeTimer, setActiveTimer] = useState(null);
  const [pomodoroState, setPomodoroState] = useState({
    mode: 'work',
    count: 0,
    timeLeft: POMODORO_DURATION * 60,
    isActive: false
  });
  const [isExpandedView, setIsExpandedView] = useState(false);
  const [tags, setTags] = useState([]);
  const [productivityScore, setProductivityScore] = useState(0);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [viewMode, setViewMode] = useState('daily'); // 'daily' or 'weekly'
  const [filter, setFilter] = useState({
    categories: [],
    priorities: [],
    tags: []
  });
  const [goalMinutes, setGoalMinutes] = useState({});

  const timerRef = useRef(null);
  const pomodoroRef = useRef(null);

  const formatLog = (log) => ({
    id: log.id,
    title: log.title,
    description: log.description,
    startTime: log.start_time,
    endTime: log.end_time,
    category: log.category?.id,
    priority: log.priority?.id,
    date: new Date(log.log_date),
    createdAt: new Date(log.created_at),
    updatedAt: new Date(log.updated_at),
    actualMinutes: log.actual_minutes || 0,
    tags: (log.tags || []).map(t => t.name)
  });

  // --- Data Fetching ---
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [{ data: priorityData }, { data: categoryData }, { data: tagData }] = await Promise.all([
          fetchWorkPriorities(),
          fetchWorkCategories(),
          fetchWorkTags()
        ]);

        setPriorities(priorityData.sort((a, b) => a.id - b.id));
        setCategories(categoryData.sort((a, b) => a.id - b.id));
        setTags(tagData.map(t => t.name));
      } catch { }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const params = viewMode === 'weekly'
        ? {
          from: format(startOfWeek(selectedDate), 'yyyy-MM-dd'),
          to: format(endOfWeek(selectedDate), 'yyyy-MM-dd')
        }
        : { date: format(selectedDate, 'yyyy-MM-dd') };
      const selectedDateKey = format(selectedDate, 'yyyy-MM-dd');

      try {
        const [{ data: logsData }, { data: noteData }] = await Promise.all([
          getWorkLogs(params),
          getWorkNote(selectedDateKey)
        ]);

        setTasks(logsData.map(formatLog));
        setDailyNote(noteData.content || '');
        setNoteId(noteData.id || null);
      } catch {
        setTasks([]);
        setDailyNote('');
        setNoteId(null);
      }
    };
    fetchData();
  }, [selectedDate, viewMode]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const payload = { note_date: format(selectedDate, 'yyyy-MM-dd'), content: dailyNote };
      if (noteId) {
        try {
          await updateWorkNote(noteId, payload);
        } catch { }
      } else if (dailyNote.trim() !== '') {
        try {
          const { data } = await createWorkNote(payload);
          setNoteId(data.id);
        } catch { }
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [dailyNote, selectedDate]);

  useEffect(() => {
    if (!categories.length) return;

    const defaultGoalFor = (category) =>
      category.name?.toLowerCase().includes('break') ? 60 : 120;

    let storedGoals = {};
    if (typeof window !== 'undefined') {
      try {
        storedGoals = JSON.parse(window.localStorage.getItem('worklog-goals') || '{}');
      } catch {
        storedGoals = {};
      }
    }

    setGoalMinutes(prev => {
      const next = {};
      let changed = false;

      const validIds = new Set(categories.map(cat => cat.id));
      Object.keys(prev).forEach(key => {
        if (!validIds.has(Number(key))) {
          changed = true;
        }
      });

      categories.forEach(cat => {
        const storedValue = storedGoals[cat.id];
        const currentValue = prev[cat.id];
        const resolved = storedValue ?? currentValue ?? defaultGoalFor(cat);
        next[cat.id] = resolved;
        if (resolved !== currentValue) {
          changed = true;
        }
      });

      if (changed || Object.keys(prev).length !== Object.keys(next).length) {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('worklog-goals', JSON.stringify(next));
        }
        return next;
      }

      return prev;
    });
  }, [categories]);

  // --- Timer Effects ---
  useEffect(() => {
    if (activeTimer) {
      timerRef.current = setInterval(() => {
        setTasks(prev => prev.map(task => {
          if (task.id === activeTimer.taskId) {
            const updated = { ...task, actualMinutes: task.actualMinutes + 1 };
            updateWorkLog(task.id, { actual_minutes: updated.actualMinutes });
            return updated;
          }
          return task;
        }));
      }, 60000); // Update every minute
    }

    return () => clearInterval(timerRef.current);
  }, [activeTimer]);

  useEffect(() => {
    if (pomodoroState.isActive) {
      pomodoroRef.current = setInterval(() => {
        setPomodoroState(prev => {
          if (prev.timeLeft <= 0) {
            clearInterval(pomodoroRef.current);
            handlePomodoroComplete();
            return { ...prev, isActive: false };
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }

    return () => clearInterval(pomodoroRef.current);
  }, [pomodoroState.isActive]);

  // --- Memoized Calculations ---
  const priorityOrder = useMemo(() => (
    priorities.reduce((acc, p, index) => {
      acc[p.id] = index + 1;
      return acc;
    }, {})
  ), [priorities]);
  const filteredTasks = useMemo(() => {
    return tasks.filter(task =>
      (filter.categories.length === 0 || filter.categories.includes(task.category)) &&
      (filter.priorities.length === 0 || filter.priorities.includes(task.priority)) &&
      (filter.tags.length === 0 || filter.tags.some(tag => task.tags?.includes(tag)))
    );
  }, [tasks, filter]);

  const currentTasks = useMemo(() => {
    let filtered = viewMode === 'weekly'
      ? filteredTasks
      : filteredTasks.filter(task => isSameDay(task.date, selectedDate));

    return filtered.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }

      // Then by start time
      return a.startTime.localeCompare(b.startTime);
    });
  }, [filteredTasks, viewMode, selectedDate, priorityOrder]);

  const timeSummary = useMemo(() => {
    const summary = {
      totalMinutes: 0,
      byCategory: {},
      byPriority: {},
      productiveMinutes: 0
    };

    const breakCategory = categories.find(c => c.name === 'Break');
    const breakCategoryId = breakCategory ? breakCategory.id : null;

    categories.forEach(cat => summary.byCategory[cat.id] = 0);
    priorities.forEach(pri => summary.byPriority[pri.id] = 0);

    currentTasks.forEach(task => {
      const start = parse(task.startTime, 'HH:mm', new Date());
      const end = parse(task.endTime, 'HH:mm', new Date());
      let duration = differenceInMinutes(end, start);

      if (duration < 0) duration += 24 * 60; // Handle overnight tasks

      if (duration > 0) {
        summary.totalMinutes += duration;
        summary.byCategory[task.category] = (summary.byCategory[task.category] || 0) + duration;
        summary.byPriority[task.priority] = (summary.byPriority[task.priority] || 0) + duration;

        // Only count non-break tasks as productive
        if (task.category !== breakCategoryId) {
          summary.productiveMinutes += duration;
        }
      }
    });

    // Calculate productivity score (0-100)
    const maxPossible = 8 * 60; // 8 hours
    const score = Math.min(100, Math.round((summary.productiveMinutes / maxPossible) * 100));
    setProductivityScore(score);

    return summary;
  }, [currentTasks, categories, priorities]);

  const weeklySummary = useMemo(() => {
    const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const weekDays = eachDayOfInterval({
      start: weekStart,
      end: addDays(weekStart, 6)
    });

    return weekDays.map(day => {
      const dayTasks = filteredTasks.filter(task => isSameDay(task.date, day));
      const minutes = dayTasks.reduce((total, task) => {
        const start = parse(task.startTime, 'HH:mm', new Date());
        const end = parse(task.endTime, 'HH:mm', new Date());
        let duration = differenceInMinutes(end, start);
        if (duration < 0) duration += 24 * 60;
        return total + duration;
      }, 0);

      return {
        date: day,
        minutes,
        dayName: format(day, 'EEE')
      };
    });
  }, [filteredTasks, selectedDate]);

  const insights = useMemo(() => {
    if (!categories.length) return null;

    const breakCategory = categories.find(cat => cat.name?.toLowerCase().includes('break'));
    const breakCategoryId = breakCategory?.id;
    const breakMinutes = breakCategoryId ? (timeSummary.byCategory[breakCategoryId] || 0) : 0;

    const workSessions = currentTasks.filter(task => task.category !== breakCategoryId);
    const sessionDurations = workSessions.map(task => calculateTaskDuration(task));
    const totalWorkMinutes = sessionDurations.reduce((sum, minutes) => sum + minutes, 0);
    const averageSession = sessionDurations.length ? totalWorkMinutes / sessionDurations.length : 0;

    let breakMessage = 'Log a focus session to receive cadence tips.';
    let breakDetail = 'Once you track a few tasks we will analyze your focus and break rhythm.';
    let recommendedEvery = 0;

    if (totalWorkMinutes > 0) {
      recommendedEvery = Math.round(Math.min(Math.max(averageSession || 45, 45), 90));

      if (averageSession >= 90) {
        breakMessage = 'Long focus streaks detected';
        breakDetail = `Average focus block is ${Math.round(averageSession)} minutes. Consider inserting a restorative break roughly every 60–75 minutes.`;
      } else if (averageSession >= 60) {
        breakMessage = 'Strong focus cadence';
        breakDetail = `Average focus block is ${Math.round(averageSession)} minutes. Keeping breaks near every ${recommendedEvery} minutes will help maintain energy.`;
      } else if (averageSession >= 35) {
        breakMessage = 'Frequent context shifts';
        breakDetail = `Average focus block is ${Math.round(averageSession)} minutes. Experiment with 45–60 minute sessions before pausing.`;
      } else {
        breakMessage = 'Micro tasking detected';
        breakDetail = `Average focus block is ${Math.max(20, Math.round(averageSession || 0))} minutes. Try batching similar work for longer focus intervals.`;
      }
    }

    const totalTracked = totalWorkMinutes + breakMinutes;
    const breakShare = totalTracked ? Math.round((breakMinutes / totalTracked) * 100) : 0;
    const workShare = totalTracked ? Math.round((totalWorkMinutes / totalTracked) * 100) : 0;

    const goalProgress = categories.map(cat => {
      const actual = timeSummary.byCategory[cat.id] || 0;
      const goal = goalMinutes[cat.id] || 0;
      const rawProgress = goal > 0 ? Math.round((actual / goal) * 100) : 0;
      const progress = goal > 0 ? Math.min(rawProgress, 999) : rawProgress;
      let status = 'neutral';

      if (goal > 0) {
        if (progress >= 120) {
          status = 'over';
        } else if (progress <= 80) {
          status = 'under';
        } else {
          status = 'onTrack';
        }
      } else if (actual > 0) {
        status = 'tracked';
      }

      return {
        category: cat,
        actualMinutes: actual,
        goalMinutes: goal,
        progress,
        status
      };
    });

    const overbookedCategories = goalProgress
      .filter(item => item.actualMinutes > 0 && (
        (item.goalMinutes > 0 && item.actualMinutes > item.goalMinutes * 1.1) ||
        (timeSummary.totalMinutes > 0 && item.actualMinutes / timeSummary.totalMinutes > 0.4)
      ))
      .map(item => ({
        ...item,
        difference: item.actualMinutes - (item.goalMinutes || 0)
      }))
      .sort((a, b) => b.difference - a.difference);

    const trimmedNote = dailyNote.trim();
    const noteBullets = trimmedNote
      ? trimmedNote.split(/\n+/).map(line => line.trim()).filter(Boolean)
      : [];

    let summaryBullets = [];
    if (noteBullets.length) {
      summaryBullets = noteBullets.slice(0, 3);
    } else if (trimmedNote) {
      const sentences = trimmedNote
        .replace(/\n+/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .map(sentence => sentence.trim())
        .filter(Boolean);
      summaryBullets = sentences.slice(0, 3);
    }

    const topCategory = goalProgress
      .filter(item => item.actualMinutes > 0 && item.category)
      .sort((a, b) => b.actualMinutes - a.actualMinutes)[0];

    if (topCategory) {
      const hours = Math.floor(topCategory.actualMinutes / 60);
      const minutes = topCategory.actualMinutes % 60;
      const label = hours ? `${hours}h ${minutes}m` : `${minutes}m`;
      summaryBullets.push(`Most time spent on ${topCategory.category.name} (${label}).`);
    }

    if (breakCategory && totalTracked > 0) {
      if (breakShare < 15 && totalWorkMinutes > 90) {
        summaryBullets.push('Break time is under 15% of your schedule—schedule more pauses to recharge.');
      } else if (breakShare > 35) {
        summaryBullets.push('Breaks account for over a third of tracked time—ensure focus blocks stay protected.');
      }
    }

    summaryBullets = summaryBullets.filter(Boolean).slice(0, 4);

    const headline = totalTracked > 0
      ? `${viewMode === 'weekly' ? 'This week' : 'Today'} logged ${Math.floor(timeSummary.totalMinutes / 60)}h ${timeSummary.totalMinutes % 60}m across ${currentTasks.length} entries.`
      : 'Add tasks or notes to unlock personalized insights.';

    return {
      scopeLabel: viewMode === 'weekly' ? 'Weekly' : 'Daily',
      breakAdvice: {
        message: breakMessage,
        detail: breakDetail,
        averageSession: Math.round(averageSession || 0),
        recommendedEvery,
        breakMinutes,
        totalWorkMinutes,
        breakShare,
        workShare
      },
      overbookedCategories,
      goalProgress,
      aiSummary: {
        headline,
        bullets: summaryBullets
      }
    };
  }, [categories, currentTasks, timeSummary, dailyNote, goalMinutes, viewMode]);

  const trackedTimeLabel = `${Math.floor(timeSummary.totalMinutes / 60)}h ${timeSummary.totalMinutes % 60}m`;
  const focusTimeLabel = `${Math.floor(timeSummary.productiveMinutes / 60)}h ${timeSummary.productiveMinutes % 60}m`;
  const activeTimerTask = currentTasks.find(task => task.id === activeTaskId) || null;
  const selectedRangeLabel = viewMode === 'weekly'
    ? `${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d')} - ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d, yyyy')}`
    : format(selectedDate, 'EEEE, MMM d, yyyy');

  // --- Handlers ---
  const handleDateChange = useCallback((days) => {
    setSelectedDate(current => addDays(current, days));
  }, []);

  const openForm = useCallback((task = null) => {
    setEditingTask(task);
    setShowForm(true);
  }, []);

  const closeForm = () => {
    setShowForm(false);
    setEditingTask(null);
  };

  const handleSaveTask = async (taskData) => {
    const payload = {
      title: taskData.title,
      description: taskData.description,
      log_date: format(selectedDate, 'yyyy-MM-dd'),
      start_time: taskData.startTime,
      end_time: taskData.endTime,
      category_id: taskData.category,
      priority_id: taskData.priority,
      tags: taskData.tags || []
    };

    if (editingTask) {
      try {
        const { data } = await updateWorkLog(editingTask.id, payload);
        setTasks(tasks.map(t => t.id === data.id ? formatLog(data) : t));
      } catch { }
    } else {
      try {
        const { data } = await createWorkLog(payload);
        setTasks([...tasks, formatLog(data)]);
      } catch { }
    }
    closeForm();
  };

  const handleDelete = async (taskId) => {
    await deleteWorkLog(taskId);
    setTasks(tasks.filter(task => task.id !== taskId));
    if (activeTimer?.taskId === taskId) {
      stopTimer();
    }
  };

  const startTimer = (taskId) => {
    setActiveTimer({ taskId, startTime: new Date() });
    setActiveTaskId(taskId);
  };

  const stopTimer = () => {
    if (activeTimer) {
      const task = tasks.find(t => t.id === activeTimer.taskId);
      if (task) {
        updateWorkLog(task.id, { actual_minutes: task.actualMinutes });
      }
    }
    setActiveTimer(null);
    setActiveTaskId(null);
  };

  const startPomodoro = () => {
    setPomodoroState(prev => ({
      ...prev,
      isActive: true,
      timeLeft: prev.mode === 'work'
        ? POMODORO_DURATION * 60
        : prev.mode === 'shortBreak'
          ? SHORT_BREAK_DURATION * 60
          : LONG_BREAK_DURATION * 60
    }));
  };

  const pausePomodoro = () => {
    setPomodoroState(prev => ({ ...prev, isActive: false }));
  };

  const resetPomodoro = () => {
    setPomodoroState({
      mode: 'work',
      count: 0,
      timeLeft: POMODORO_DURATION * 60,
      isActive: false
    });
  };

  const handlePomodoroComplete = () => {
    if (pomodoroState.mode === 'work') {
      const newCount = pomodoroState.count + 1;
      const nextMode = newCount % POMODOROS_FOR_LONG_BREAK === 0
        ? 'longBreak'
        : 'shortBreak';

      setPomodoroState({
        mode: nextMode,
        count: newCount,
        timeLeft: nextMode === 'shortBreak'
          ? SHORT_BREAK_DURATION * 60
          : LONG_BREAK_DURATION * 60,
        isActive: false
      });

      // Add a break task automatically
      const breakDuration = nextMode === 'shortBreak'
        ? SHORT_BREAK_DURATION
        : LONG_BREAK_DURATION;

      const now = new Date();
      const startTime = format(now, 'HH:mm');
      const endTime = format(addMinutes(now, breakDuration), 'HH:mm');

      const breakCat = categories.find(c => c.name === 'Break');
      const lowPriority = priorities.find(p => p.name === 'Low');
      handleSaveTask({
        title: `${nextMode === 'shortBreak' ? 'Short' : 'Long'} Break`,
        description: `Pomodoro break after ${newCount} work sessions`,
        startTime,
        endTime,
        category: breakCat?.id,
        priority: lowPriority?.id
      });
    } else {
      setPomodoroState({
        mode: 'work',
        count: pomodoroState.count,
        timeLeft: POMODORO_DURATION * 60,
        isActive: false
      });
    }
  };

  const getTasksForDate = (date) => filteredTasks.filter(task => isSameDay(task.date, date));

  const toggleFilter = (type, value) => {
    setFilter(prev => {
      const currentValues = prev[type] || [];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];

      return { ...prev, [type]: newValues };
    });
  };

  const clearFilters = () => {
    setFilter({ categories: [], priorities: [], tags: [] });
  };

  const handleGoalChange = useCallback((categoryId, minutes) => {
    const sanitized = Math.max(0, Math.round(Number(minutes) || 0));
    setGoalMinutes(prev => {
      const updated = { ...prev, [categoryId]: sanitized };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('worklog-goals', JSON.stringify(updated));
      }
      return updated;
    });
  }, []);

  return (
    <div className={`min-h-screen pb-10 text-slate-900 ${isExpandedView ? 'fixed inset-0 z-50 overflow-y-auto bg-[linear-gradient(180deg,#f8fbff_0%,var(--shell-bg)_48%,#edf2fa_100%)]' : ''}`}>
      <div className="mx-auto max-w-[98%] space-y-6">

        {/* Header */}
        <header className="shell-panel shell-panel-strong landing-hero-3d overflow-hidden rounded-[36px]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.18),transparent_24%),radial-gradient(circle_at_left,rgba(52,109,255,0.14),transparent_28%)]" />
          <div className="relative space-y-6 p-5 sm:p-6 lg:p-7">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)] xl:items-start">
              <div>
                <span className="shell-eyebrow">Focus Command Deck</span>
                <h1 className="mt-3 flex items-center gap-3 text-3xl font-semibold tracking-[-0.05em] text-slate-950 sm:text-4xl">
                  <SparklesIcon className="h-8 w-8 text-[var(--theme-color)]" />
                  Work Log
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
                  Track deep work, map your time by category, and keep your daily execution system in the same control-room language as the rest of the app.
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="shell-chip">
                    <span className="shell-chip-dot" />
                    {selectedRangeLabel}
                  </span>
                  <span className="shell-chip">
                    <span className="shell-chip-dot" />
                    {currentTasks.length} entries
                  </span>
                  {activeTimerTask ? (
                    <span className="shell-chip">
                      <span className="shell-chip-dot" />
                      Tracking {activeTimerTask.title}
                    </span>
                  ) : null}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setIsExpandedView(!isExpandedView)}
                    className="shell-button-secondary"
                    title={isExpandedView ? "Exit fullscreen" : "Enter fullscreen"}
                  >
                    {isExpandedView ? (
                      <ArrowsPointingInIcon className="h-5 w-5" />
                    ) : (
                      <ArrowsPointingOutIcon className="h-5 w-5" />
                    )}
                    {isExpandedView ? 'Exit Fullscreen' : 'Fullscreen'}
                  </button>

                  <div className="shell-segmented">
                    <button
                      onClick={() => setViewMode('daily')}
                      className={`shell-segmented-button min-w-[5.5rem] ${viewMode === 'daily' ? 'shell-segmented-button-active' : ''}`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setViewMode('weekly')}
                      className={`shell-segmented-button min-w-[5.5rem] ${viewMode === 'weekly' ? 'shell-segmented-button-active' : ''}`}
                    >
                      Weekly
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="shell-kpi-card">
                  <span className="shell-kpi-label">Productivity</span>
                  <span className="shell-kpi-value">{productivityScore}%</span>
                  <span className="shell-kpi-meta">{focusTimeLabel} of focused work logged.</span>
                </div>
                <div className="shell-kpi-card">
                  <span className="shell-kpi-label">Tracked Time</span>
                  <span className="shell-kpi-value">{trackedTimeLabel}</span>
                  <span className="shell-kpi-meta">Across {currentTasks.length} scheduled entries.</span>
                </div>
                <div className="shell-kpi-card">
                  <span className="shell-kpi-label">Pomodoro State</span>
                  <span className="shell-kpi-value">{pomodoroState.mode === 'work' ? 'Focus' : pomodoroState.mode === 'shortBreak' ? 'Short Break' : 'Long Break'}</span>
                  <span className="shell-kpi-meta">Session {pomodoroState.count + (pomodoroState.mode === 'work' ? 1 : 0)} • {pomodoroState.isActive ? 'Running' : 'Idle'}</span>
                </div>
                <div className="overflow-hidden rounded-[24px] border border-white/12 bg-[linear-gradient(135deg,rgba(7,17,32,0.96),rgba(30,41,59,0.92))] p-5 text-white shadow-[0_24px_48px_rgb(15_23_42_/_0.2)]">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-white/45">Focus Snapshot</p>
                  <p className="mt-3 text-2xl font-semibold tracking-[-0.04em]">{activeTimerTask ? activeTimerTask.title : 'Ready to focus'}</p>
                  <p className="mt-2 text-sm leading-6 text-white/68">
                    {activeTimerTask
                      ? `Your live timer is attached to ${activeTimerTask.title}.`
                      : 'Start a timer or log a task to anchor the next focus block.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          {/* Left Column - Calendar & Summary */}
          <aside className="lg:col-span-1 space-y-8">
            <CalendarWidget
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              handleDateChange={handleDateChange}
              getTasksForDate={getTasksForDate}
              viewMode={viewMode}
            />

            <PomodoroWidget
              pomodoroState={pomodoroState}
              onStart={startPomodoro}
              onPause={pausePomodoro}
              onReset={resetPomodoro}
            />

            <TimeSummaryWidget
              timeSummary={timeSummary}
              categories={categories}
              priorities={priorities}
              weeklySummary={weeklySummary}
              viewMode={viewMode}
            />

            {viewMode === 'daily' && (
              <DailyNotes
                note={dailyNote}
                onChange={setDailyNote}
              />
            )}

            <InsightsSidebar
              insights={insights}
              onGoalChange={handleGoalChange}
            />
          </aside>

          {/* Right Column - Timeline */}
          <section className="lg:col-span-2">
            <FilterWidget
              categories={categories}
              priorities={priorities}
              tags={tags}
              filter={filter}
              onToggleFilter={toggleFilter}
              onClearFilters={clearFilters}
            />

            <TimelineView
              tasks={currentTasks}
              selectedDate={selectedDate}
              categories={categories}
              priorities={priorities}
              onAddTask={() => openForm()}
              onEditTask={openForm}
              onDeleteTask={handleDelete}
              onStartTimer={startTimer}
              onStopTimer={stopTimer}
              activeTaskId={activeTaskId}
              viewMode={viewMode}
              weeklySummary={weeklySummary}
              timeSummary={timeSummary}
            />
          </section>
        </main>

        <TaskFormModal
          isOpen={showForm}
          onClose={closeForm}
          onSave={handleSaveTask}
          task={editingTask}
          categories={categories}
          priorities={priorities}
          lastTaskEnd={currentTasks[currentTasks.length - 1]?.endTime}
          tags={tags}
          setTags={setTags}
        />
      </div>
    </div>
  );
};

// --- Child Components ---

const CalendarWidget = ({ selectedDate, setSelectedDate, handleDateChange, getTasksForDate, viewMode }) => {
  const weekStartsOn = 1; // Monday
  const firstDayOfMonth = startOfMonth(selectedDate);
  const lastDayOfMonth = endOfMonth(selectedDate);

  // For weekly view
  const weekStart = startOfWeek(selectedDate, { weekStartsOn });
  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: addDays(weekStart, 6)
  });

  // For monthly view
  const monthWeeks = eachWeekOfInterval(
    { start: firstDayOfMonth, end: lastDayOfMonth },
    { weekStartsOn }
  );

  return (
    <motion.div layout className="shell-panel shell-panel-strong rounded-[28px] p-6 shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">
          {viewMode === 'daily'
            ? format(selectedDate, 'MMMM yyyy')
            : `Week of ${format(weekStart, 'MMM d')}`}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDateChange(-1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/72 text-slate-600 transition hover:-translate-y-0.5 hover:bg-white"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => setSelectedDate(new Date())}
            className="shell-button-secondary min-h-0 px-4 py-2 text-sm"
          >
            Today
          </button>
          <button
            onClick={() => handleDateChange(1)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/72 text-slate-600 transition hover:-translate-y-0.5 hover:bg-white"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {viewMode === 'daily' ? (
        <>
          <div className="grid grid-cols-7 gap-1 text-center text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(day => <div key={day}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 mt-2">
            {monthWeeks.flatMap(weekStart =>
              eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }).map((date, i) => {
                const isSelected = isSameDay(date, selectedDate);
                const hasTasks = getTasksForDate(date).length > 0;
                const isCurrentMonth = isSameMonth(date, selectedDate);

                return (
                  <button
                    key={`${weekStart}-${i}`}
                    onClick={() => setSelectedDate(date)}
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium transition-all
                      ${isSelected ? 'bg-[linear-gradient(135deg,rgb(var(--theme-color-rgb)/0.96),rgb(var(--theme-secondary-rgb)/0.88))] text-white shadow-[0_14px_28px_rgb(var(--theme-color-rgb)/0.24)]' : 'text-slate-700 hover:-translate-y-0.5 hover:bg-white/84'}
                      ${!isCurrentMonth ? 'text-slate-300' : ''}
                    `}
                  >
                    {format(date, 'd')}
                    {hasTasks && <span className={`absolute bottom-1.5 h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-[var(--theme-color)]'}`}></span>}
                  </button>
                );
              })
            )}
          </div>
        </>
      ) : (
        <div className="grid grid-cols-7 gap-1 mt-4">
          {weekDays.map((date, i) => {
            const isSelected = isSameDay(date, selectedDate);
            const hasTasks = getTasksForDate(date).length > 0;

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(date)}
                className={`flex flex-col items-center rounded-[20px] border px-2 py-3 transition-all
                  ${isSelected ? 'border-[rgb(var(--theme-color-rgb)/0.28)] bg-[linear-gradient(135deg,rgba(52,109,255,0.12),rgba(129,91,255,0.14))] shadow-[0_14px_28px_rgb(var(--theme-color-rgb)/0.12)]' : 'border-white/65 bg-white/55 hover:-translate-y-0.5 hover:bg-white/78'}
                `}
              >
                <div className="text-sm text-slate-500">{format(date, 'EEE')}</div>
                <div className="mt-1 font-semibold text-slate-900">{format(date, 'd')}</div>
                {hasTasks && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[var(--theme-color)]"></span>}
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};

const PomodoroWidget = ({ pomodoroState, onStart, onPause, onReset }) => {
  const minutes = Math.floor(pomodoroState.timeLeft / 60);
  const seconds = pomodoroState.timeLeft % 60;
  const progress = (pomodoroState.timeLeft /
    (pomodoroState.mode === 'work'
      ? POMODORO_DURATION * 60
      : pomodoroState.mode === 'shortBreak'
        ? SHORT_BREAK_DURATION * 60
        : LONG_BREAK_DURATION * 60)
  ) * 100;

  return (
    <motion.div layout className="shell-panel shell-panel-strong rounded-[28px] p-6 shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">Pomodoro Timer</h2>
        <div className="shell-chip px-3 py-2 text-[0.65rem]">
          <span className={`h-2 w-2 rounded-full ${pomodoroState.mode === 'work' ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
          <span className="font-medium">
            {pomodoroState.mode === 'work'
              ? 'Work'
              : pomodoroState.mode === 'shortBreak'
                ? 'Short Break'
                : 'Long Break'}
          </span>
        </div>
      </div>

      <div className="relative">
        <div className="mb-6 h-3 w-full overflow-hidden rounded-full bg-slate-200/80">
          <div
            className={`h-full ${pomodoroState.mode === 'work' ? 'bg-[linear-gradient(90deg,#f43f5e,#fb7185)]' : 'bg-[linear-gradient(90deg,#10b981,#34d399)]'}`}
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="text-center mb-6">
          <div className="text-4xl font-bold tracking-tighter text-slate-950">
            {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
          </div>
          <div className="mt-1 text-sm text-slate-500">
            {pomodoroState.mode === 'work'
              ? `Session ${pomodoroState.count + 1}`
              : 'Take a break!'}
          </div>
        </div>

        <div className="flex justify-center gap-3">
          {pomodoroState.isActive ? (
            <button onClick={onPause} className="shell-button-dark px-5 py-3">
              <StopIcon className="h-5 w-5 inline mr-2" />
              Pause
            </button>
          ) : (
            <button onClick={onStart} className="shell-button-primary px-5 py-3">
              <PlayIcon className="h-5 w-5 inline mr-2" />
              Start
            </button>
          )}
          <button onClick={onReset} className="shell-button-secondary px-4 py-3">
            Reset
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const TimeSummaryWidget = ({ timeSummary, categories, priorities, weeklySummary, viewMode }) => {
  const totalHours = (timeSummary.totalMinutes / 60).toFixed(1);
  const themeColor = getComputedStyle(document.documentElement).getPropertyValue('--theme-color').trim();

  // Weekly chart data - formatted for recharts
  const weeklyChartData = useMemo(() => 
    weeklySummary.map(day => ({
      name: day.dayName,
      minutes: day.minutes
    }))
  , [weeklySummary]);

  return (
    <motion.div layout className="shell-panel shell-panel-strong rounded-[28px] p-6 shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
          <ChartPieIcon className="h-5 w-5" />
          {viewMode === 'daily' ? 'Daily Summary' : 'Weekly Overview'}
        </h2>
        <span className="shell-chip text-[0.68rem]">{totalHours} hrs</span>
      </div>

      {viewMode === 'daily' ? (
        timeSummary.totalMinutes > 0 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {categories.map(cat => {
                const minutes = timeSummary.byCategory[cat.id];
                if (!minutes) return null;
                const percentage = (minutes / timeSummary.totalMinutes * 100).toFixed(0);
                return (
                  <div key={cat.id} className="flex items-center justify-between rounded-[18px] border border-white/60 bg-white/62 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.hex }}></span>
                      <span className="font-medium text-slate-900">{cat.name}</span>
                    </div>
                    <span className="text-slate-500">
                      {Math.floor(minutes / 60)}h {minutes % 60}m ({percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-white/70 pt-4">
              <h3 className="mb-2 text-sm font-medium text-slate-700">By Priority</h3>
              <div className="space-y-2">
                {priorities.map(pri => {
                  const minutes = timeSummary.byPriority[pri.id];
                  if (!minutes) return null;
                  return (
                    <div key={pri.id} className="flex items-center justify-between rounded-[18px] border border-white/60 bg-white/62 px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: pri.hex }}></span>
                        <span className="font-medium text-slate-900">{pri.name}</span>
                      </div>
                      <span className="text-slate-500">
                        {Math.floor(minutes / 60)}h {minutes % 60}m
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-white/70 bg-white/42 py-8 text-center text-slate-500">
            <ClockIcon className="mx-auto h-12 w-12 text-slate-300" />
            <p className="mt-2 text-sm">Log a task to see your time breakdown.</p>
          </div>
        )
      ) : (
        <div className="h-64 rounded-[24px] border border-white/60 bg-white/56 p-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="name" stroke="rgb(100,116,139)" />
              <YAxis stroke="rgb(100,116,139)" label={{ value: 'Minutes', angle: -90, position: 'insideLeft' }} />
              <Tooltip formatter={(value) => `${value}m`} contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.92)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px' }} />
              <Bar dataKey="minutes" fill={themeColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
};

const DailyNotes = ({ note, onChange }) => {
  return (
    <motion.div layout className="shell-panel shell-panel-strong rounded-[28px] p-6 shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
          <DocumentTextIcon className="h-5 w-5" />
          Daily Notes
        </h2>
      </div>

      <textarea
        value={note}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Reflect on your day, note important insights, or plan for tomorrow..."
        className="shell-input min-h-[140px] resize-y p-4"
      />

      <div className="mt-3 flex items-center text-xs text-slate-500">
        <LightBulbIcon className="h-4 w-4 mr-1" />
        Tip: These notes are saved automatically
      </div>
    </motion.div>
  );
};

const InsightsSidebar = ({ insights, onGoalChange }) => {
  if (!insights) return null;

  const { breakAdvice, overbookedCategories, goalProgress, aiSummary, scopeLabel } = insights;

  const formatMinutes = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const statusCopy = {
    over: 'Above goal',
    under: 'Below goal',
    onTrack: 'On track',
    tracked: 'Tracked',
    neutral: 'No goal set'
  };

  const statusColor = {
    over: 'text-red-600',
    under: 'text-amber-600',
    onTrack: 'text-emerald-600',
    tracked: 'text-slate-600',
    neutral: 'text-slate-500'
  };

  const actionableGoalProgress = goalProgress.filter(item => item.goalMinutes > 0 || item.actualMinutes > 0);

  return (
    <motion.div layout className="shell-panel shell-panel-strong space-y-6 rounded-[28px] p-6 shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
          <LightBulbIcon className="h-5 w-5" />
          Productivity Insights
        </h2>
        <span className="shell-chip text-[0.65rem]">{scopeLabel}</span>
      </div>

      <div className="space-y-3 rounded-[24px] border border-[rgb(var(--theme-color-rgb)/0.18)] bg-[linear-gradient(135deg,rgba(52,109,255,0.09),rgba(129,91,255,0.08))] p-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">{breakAdvice.message}</p>
          <p className="mt-1 text-sm text-slate-600">{breakAdvice.detail}</p>
        </div>
        {breakAdvice.totalWorkMinutes > 0 && (
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full border border-white/70 bg-white/72 px-2 py-1">{breakAdvice.averageSession}m avg focus</span>
            <span className="rounded-full border border-white/70 bg-white/72 px-2 py-1">{breakAdvice.workShare}% focus</span>
            <span className="rounded-full border border-white/70 bg-white/72 px-2 py-1">{breakAdvice.breakShare}% breaks</span>
            {breakAdvice.recommendedEvery > 0 && (
              <span className="rounded-full border border-white/70 bg-white/72 px-2 py-1">Break every ~{breakAdvice.recommendedEvery}m</span>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Goals vs logged time</h3>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Minutes</span>
        </div>
        {actionableGoalProgress.length === 0 ? (
          <p className="text-sm text-slate-500">Set a goal for any category to start tracking progress.</p>
        ) : (
          <div className="space-y-4">
            {actionableGoalProgress.map(item => (
              <div key={item.category.id} className="space-y-2 rounded-[22px] border border-white/60 bg-white/58 p-4">
                <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.category.hex }}></span>
                    <span>{item.category.name}</span>
                  </div>
                  <span>{formatMinutes(item.actualMinutes)} / {formatMinutes(item.goalMinutes)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(item.goalMinutes > 0 ? (item.actualMinutes / item.goalMinutes) * 100 : 0, 100)}%`,
                      backgroundColor: item.category.hex || 'var(--theme-color)'
                    }}
                  ></div>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className={`flex items-center gap-1 ${statusColor[item.status]}`}>
                    {statusCopy[item.status]}
                    {item.goalMinutes > 0 && (
                      <>
                        <span>·</span>
                        <span>{Math.min(999, Math.round((item.actualMinutes / item.goalMinutes) * 100))}% of goal</span>
                      </>
                    )}
                  </span>
                  <label className="flex items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">Goal</span>
                    <input
                      type="number"
                      min="0"
                      value={item.goalMinutes}
                      onChange={(e) => onGoalChange(item.category.id, e.target.value)}
                      className="shell-input w-20 px-2 py-1 text-xs"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Overbooked categories</h3>
          <ArrowUpIcon className="h-4 w-4 text-slate-400" />
        </div>
        {overbookedCategories.length === 0 ? (
          <p className="text-sm text-slate-500">No categories are exceeding their targets.</p>
        ) : (
          <div className="space-y-3">
            {overbookedCategories.map(item => (
              <div key={item.category.id} className="rounded-[20px] border border-rose-200/70 bg-rose-50/72 p-3">
                <div className="flex items-center justify-between text-xs font-medium text-red-600">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.category.hex }}></span>
                    <span>{item.category.name}</span>
                  </div>
                  <span>+{formatMinutes(Math.max(0, item.difference))}</span>
                </div>
                <p className="text-xs text-red-700 mt-1">
                  Logged {formatMinutes(item.actualMinutes)}{item.goalMinutes > 0 ? ` of ${formatMinutes(item.goalMinutes)} planned` : ''}.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Daily reflection summary</h3>
          <SparklesIcon className="h-4 w-4 text-[var(--theme-color)]" />
        </div>
        <p className="mb-2 text-sm text-slate-600">{aiSummary.headline}</p>
        {aiSummary.bullets.length === 0 ? (
          <p className="text-xs text-slate-500">Add a note or log more work to receive AI-style highlights.</p>
        ) : (
          <ul className="list-disc list-inside space-y-1 text-xs text-slate-600">
            {aiSummary.bullets.map((bullet, index) => (
              <li key={index}>{bullet}</li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  );
};

const FilterWidget = ({ categories, priorities, tags, filter, onToggleFilter, onClearFilters }) => {
  const hasFilters = filter.categories.length > 0 || filter.priorities.length > 0 || filter.tags.length > 0;

  return (
    <div className="shell-panel shell-panel-strong mb-6 rounded-[28px] p-5 shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="shell-eyebrow">Filter Stack</p>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">Refine the timeline</h3>
        </div>
        {hasFilters ? (
          <button
            onClick={onClearFilters}
            className="shell-button-dark px-4 py-2 text-sm"
          >
            Clear Filters
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-4">
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Category</h3>
          <div className="flex flex-wrap gap-1">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => onToggleFilter('categories', cat.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${filter.categories.includes(cat.id)
                    ? 'text-white shadow-[0_14px_30px_rgb(var(--theme-color-rgb)/0.18)]'
                    : 'border-white/70 bg-white/68 text-slate-700 hover:-translate-y-0.5 hover:bg-white'
                  }`}
                style={filter.categories.includes(cat.id) ? { backgroundColor: cat.hex } : {}}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Priority</h3>
          <div className="flex flex-wrap gap-1">
            {priorities.map(pri => (
              <button
                key={pri.id}
                onClick={() => onToggleFilter('priorities', pri.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${filter.priorities.includes(pri.id)
                    ? 'text-white shadow-[0_14px_30px_rgb(var(--theme-color-rgb)/0.18)]'
                    : 'border-white/70 bg-white/68 text-slate-700 hover:-translate-y-0.5 hover:bg-white'
                  }`}
                style={filter.priorities.includes(pri.id) ? { backgroundColor: pri.hex } : {}}
              >
                {pri.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Tags</h3>
          <div className="flex flex-wrap gap-1">
            {tags.map(tag => (
              <button
                key={tag}
                onClick={() => onToggleFilter('tags', tag)}
                className={`flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${filter.tags.includes(tag)
                    ? 'border-[rgb(var(--theme-color-rgb)/0.2)] bg-[rgb(var(--theme-color-rgb)/0.12)] text-[var(--theme-color)]'
                    : 'border-white/70 bg-white/68 text-slate-700 hover:-translate-y-0.5 hover:bg-white'
                  }`}
              >
                <TagIcon className="h-3 w-3 mr-1" />
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const TimelineView = ({
  tasks,
  selectedDate,
  categories,
  priorities,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onStartTimer,
  onStopTimer,
  activeTaskId,
  viewMode,
  weeklySummary,
  timeSummary
}) => {
  const hours = Array.from({ length: 18 }, (_, i) => i + 5); // 5 AM to 10 PM

  const timeToPosition = (time) => {
    const [h, m] = time.split(':').map(Number);
    const totalMinutes = (h * 60 + m) - (5 * 60); // Minutes from 5 AM
    return (totalMinutes / (18 * 60)) * 100; // As a percentage of the total height
  };

  const getDuration = (task) => calculateTaskDuration(task);

  if (viewMode === 'weekly') {
    return (
      <div className="shell-panel shell-panel-strong overflow-hidden rounded-[28px] shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]">
        <div className="flex items-center justify-between border-b border-white/70 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Weekly Overview</h2>
            <p className="text-sm text-slate-500">
              {format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'MMM d')} -
              {format(addDays(startOfWeek(selectedDate, { weekStartsOn: 1 }), 6), 'MMM d')}
            </p>
          </div>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-7">
            {weeklySummary.map((day, index) => (
              <div key={index} className="rounded-[22px] border border-white/65 bg-white/58 p-3 text-center shadow-[0_14px_30px_rgb(15_23_42_/_0.05)]">
                <div className="text-sm font-medium text-slate-700">{day.dayName}</div>
                <div className="mt-1 text-lg font-bold text-slate-950">{Math.floor(day.minutes / 60)}h {day.minutes % 60}m</div>

                <div className="mt-4 space-y-2">
                  {tasks.filter(task => isSameDay(task.date, day.date)).map(task => {
                    const category = categories.find(c => c.id === task.category);
                    const priority = priorities.find(p => p.id === task.priority);

                    return (
                      <div
                        key={task.id}
                        className="rounded-[16px] border-l-4 bg-white/74 p-2 text-left text-xs"
                        style={{
                          borderLeftColor: priority?.hex,
                          backgroundColor: category ? hexToRgba(category.hex, 0.1) : undefined,
                        }}
                      >
                        <div className="truncate font-medium text-slate-900">{task.title}</div>
                        <div className="truncate text-slate-500">{task.startTime} - {task.endTime}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell-panel shell-panel-strong overflow-hidden rounded-[28px] shadow-[0_20px_44px_rgb(15_23_42_/_0.08)]">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/70 p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Timeline for {format(selectedDate, 'MMMM d')}</h2>
          <p className="text-sm text-slate-500">
            {tasks.length} tasks scheduled · Total: {Math.floor(timeSummary.totalMinutes / 60)}h {timeSummary.totalMinutes % 60}m
          </p>
        </div>
        <button onClick={onAddTask} className="shell-button-primary px-5 py-3">
          <PlusIcon className="h-5 w-5" />
          <span>Add Task</span>
        </button>
      </div>

      <div className="p-6">
        {tasks.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-white/70 bg-white/42 py-20 text-center">
            <h3 className="mb-1 text-lg font-medium text-slate-900">It&apos;s a blank canvas</h3>
            <p className="mb-4 text-slate-500">Add your first task to start building your day.</p>
            <button onClick={onAddTask} className="shell-button-primary px-5 py-3 text-sm">
              Log First Task
            </button>
          </div>
        ) : (
          <div className="relative rounded-[24px] border border-white/65 bg-white/54 p-4">
            {/* Hour Markers */}
            <div className="absolute left-0 top-0 bottom-0 w-12">
              {hours.map(hour => (
                <div key={hour} className="flex h-[calc(100%/18)] items-center justify-end border-t border-white/70 pr-2 text-right text-xs text-slate-400">
                  {hour % 12 === 0 ? 12 : hour % 12} {hour < 12 || hour === 24 ? 'am' : 'pm'}
                </div>
              ))}
            </div>

            {/* Timeline Grid */}
            <div className="ml-12">
              {hours.map(hour => <div key={hour} className="h-14 border-t border-white/70"></div>)}
            </div>

            {/* Task Items */}
            <div className="absolute top-0 bottom-0 left-12 right-0">
              <AnimatePresence>
                {tasks.map(task => {
                  const category = categories.find(c => c.id === task.category);
                  const priority = priorities.find(p => p.id === task.priority);
                  const top = timeToPosition(task.startTime);
                  const duration = getDuration(task);
                  const height = (duration / (18 * 60)) * 100;

                  return (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className="absolute w-full p-2 group"
                      style={{ top: `${top}%`, height: `${height}%` }}
                    >
                      <div
                        className="relative flex h-full flex-col justify-between overflow-hidden rounded-[20px] border border-white/18 p-3 text-white shadow-[0_22px_42px_rgb(15_23_42_/_0.16)]"
                        style={{ backgroundColor: category?.hex }}
                      >
                        <div className="absolute left-0 top-0 h-1 w-full bg-white/30"></div>
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.14),rgba(15,23,42,0.08))]" />

                        <div className="relative">
                          <div className="flex justify-between items-start">
                            <h3 className="font-bold text-sm truncate">{task.title}</h3>
                            {priority && (
                              <span
                                className="ml-2 px-2 py-0.5 text-xs rounded-full text-white"
                                style={{ backgroundColor: priority.hex }}
                              >
                                {priority.name}
                              </span>
                            )}
                          </div>
                          <p className="text-xs opacity-80 truncate">{task.startTime} - {task.endTime}</p>
                          {task.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {task.tags.map(tag => (
                                <span key={tag} className="rounded-full bg-black/18 px-2 py-0.5 text-[11px]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="relative mt-2 flex items-center justify-between">
                          {activeTaskId === task.id ? (
                            <button
                              onClick={() => onStopTimer()}
                              className="flex items-center rounded-full bg-rose-500 px-3 py-1 text-xs font-medium hover:bg-rose-600"
                            >
                              <StopIcon className="h-3 w-3 mr-1" />
                              Stop Timer
                            </button>
                          ) : (
                            <button
                              onClick={() => onStartTimer(task.id)}
                              className="flex items-center rounded-full bg-white/18 px-3 py-1 text-xs font-medium hover:bg-white/28"
                            >
                              <PlayIcon className="h-3 w-3 mr-1" />
                              Start Timer
                            </button>
                          )}

                          <div className="absolute right-2 top-2 flex items-center space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button onClick={() => onEditTask(task)} className="rounded-full bg-black/20 p-1.5 hover:bg-black/40">
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button onClick={() => onDeleteTask(task.id)} className="rounded-full bg-black/20 p-1.5 hover:bg-black/40">
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const TaskFormModal = ({
  isOpen,
  onClose,
  onSave,
  task,
  categories,
  priorities,
  lastTaskEnd,
  tags,
  setTags
}) => {
  const [formState, setFormState] = useState({});
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (isOpen) {
      const defaultStartTime = lastTaskEnd || '09:00';
      const parsedTime = parse(defaultStartTime, 'HH:mm', new Date());
      const defaultEndTime = format(addMinutes(parsedTime, 60), 'HH:mm');

      setFormState(task || {
        title: '',
        description: '',
        startTime: defaultStartTime,
        endTime: defaultEndTime,
        category: categories[0]?.id,
        priority: priorities[0]?.id,
        tags: []
      });
    }
  }, [task, isOpen, lastTaskEnd]);

  const handleChange = e => setFormState({ ...formState, [e.target.name]: e.target.value });

  const handleTagChange = (tag) => {
    const currentTags = formState.tags || [];
    const newTags = currentTags.includes(tag)
      ? currentTags.filter(t => t !== tag)
      : [...currentTags, tag];

    setFormState({ ...formState, tags: newTags });
  };

  const handleAddTag = () => {
    if (newTag.trim() && !tags.includes(newTag.trim())) {
      setTags([...tags, newTag.trim()]);
      handleTagChange(newTag.trim());
    }
    setNewTag('');
  };

  const handleStartTimer = () => {
    const now = new Date();
    setFormState({
      ...formState,
      title: formState.title || 'New Timed Task',
      startTime: format(now, 'HH:mm'),
      endTime: format(addMinutes(now, 60), 'HH:mm'),
    });
  };

  const handleSubmit = e => {
    e.preventDefault();
    onSave(formState);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between border-b border-white/70 p-6">
          <div>
            <p className="shell-eyebrow">Task Composer</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">{task ? 'Edit Task' : 'Add New Task'}</h2>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/72 text-slate-600 transition hover:-translate-y-0.5 hover:bg-white">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-full">
              <label className="mb-1 block text-sm font-medium text-slate-700 required-label">Title</label>
              <input
                type="text"
                name="title"
                value={formState.title || ''}
                onChange={handleChange}
                placeholder="What are you working on?"
                className="shell-input p-3"
                required
              />
            </div>
            <button
              type="button"
              onClick={handleStartTimer}
              title="Start Timer"
              className="shell-button-dark shrink-0 px-4 py-3"
            >
              <PlayIcon className="h-5 w-5" />
            </button>
          </div>

          <textarea
            name="description"
            value={formState.description || ''}
            onChange={handleChange}
            placeholder="Add a description..."
            rows="3"
            className="shell-input min-h-[110px] p-3"
          ></textarea>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
              <select
                name="category"
                value={formState.category || categories[0]?.id}
                onChange={handleChange}
                className="shell-input p-3"
              >
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Priority</label>
              <select
                name="priority"
                value={formState.priority || priorities[0]?.id}
                onChange={handleChange}
                className="shell-input p-3"
              >
                {priorities.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 required-label">Start Time</label>
              <input
                type="time"
                name="startTime"
                value={formState.startTime || ''}
                onChange={handleChange}
                className="shell-input p-3"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 required-label">End Time</label>
              <input
                type="time"
                name="endTime"
                value={formState.endTime || ''}
                onChange={handleChange}
                className="shell-input p-3"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Tags</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(formState.tags || []).map(tag => (
                <span
                  key={tag}
                  className="flex items-center rounded-full border border-[rgb(var(--theme-color-rgb)/0.16)] bg-[rgb(var(--theme-color-rgb)/0.1)] px-3 py-1 text-sm text-[var(--theme-color)]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleTagChange(tag)}
                    className="ml-1 text-[var(--theme-color)] hover:brightness-110"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add new tag"
                className="shell-input flex-grow p-2"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="shell-button-dark px-4 py-2 text-sm"
              >
                Add
              </button>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {tags.filter(tag => !(formState.tags || []).includes(tag)).map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagChange(tag)}
                  className="rounded-full border border-white/70 bg-white/68 px-3 py-1 text-sm text-slate-700 transition hover:-translate-y-0.5 hover:bg-white"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-[30px] border-t border-white/70 bg-white/44 p-6">
          <button type="button" onClick={onClose} className="shell-button-secondary px-4 py-2">Cancel</button>
          <button type="submit" className="shell-button-primary px-6 py-2">{task ? 'Update Task' : 'Save Task'}</button>
        </div>
      </form>
    </Modal>
  );
};

// --- Helper Functions ---
export default WorkLog;
