import React, { useContext, useState, useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SchedulerAPI, fetchProjects, updateProject } from '../components/api';
import { CalendarDaysIcon, ChevronDownIcon, ChevronUpIcon, CubeTransparentIcon } from '@heroicons/react/24/outline';
import SprintOverview from './SprintOverview';
import Scheduler from '../components/Scheduler/Scheduler';
import TodoBoard from '../components/TodoBoard/TodoBoard';
import SprintManager from '../components/Scheduler/SprintManager';
import Sheet from './Sheet';
import ProjectStatistics from './ProjectStatistics';
import IssueTracker from './IssueTracker';
import ProjectVault from './ProjectVault';
import PageLoader from '../components/ui/PageLoader';
import { ProjectRouteContext } from '../components/ProjectMemberRoute';

const VIEW_MODES = ['dev', 'qa', 'combined'];

const calculateWorkingDays = (start, end, workingDaysMask = 62) => {
  let count = 0;
  const current = new Date(start);
  const last = new Date(end);
  while (current <= last) {
    const day = current.getDay();
    if ((Number(workingDaysMask) & (1 << day)) !== 0) count += 1;
    current.setDate(current.getDate() + 1);
  }
  return count;
};

const formatDateRange = (start, end) => {
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} - ${fmt(end)}`;
};

const numberOrZero = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatHours = (hours) => {
  const rounded = Math.round(numberOrZero(hours) * 10) / 10;
  return `${rounded.toFixed(1).replace(/\.0$/, '')}h`;
};

const buildMemberLookup = (members = []) => {
  const lookup = new Map();
  members.forEach((member) => {
    lookup.set(String(member.id), {
      id: member.id,
      name: member.name || member.email || `User ${member.id}`,
      role: member.role,
    });
  });
  return lookup;
};

const buildWorkloadRows = (tasks = [], members = []) => {
  const memberLookup = buildMemberLookup(members);
  const rows = new Map();

  const ensureRow = (key, fallbackName, role) => {
    if (!key) return null;
    const normalizedKey = String(key);
    const member = memberLookup.get(normalizedKey);
    const rowKey = member ? `user:${normalizedKey}` : normalizedKey;

    if (!rows.has(rowKey)) {
      rows.set(rowKey, {
        key: rowKey,
        name: member?.name || fallbackName || 'Unassigned',
        role: member?.role || role || 'member',
        hours: 0,
        tasks: new Set(),
      });
    }

    return rows.get(rowKey);
  };

  const addHours = (key, fallbackName, role, hours, taskId) => {
    const safeHours = numberOrZero(hours);
    if (safeHours <= 0) return;

    const row = ensureRow(key, fallbackName, role);
    if (!row) return;

    row.hours += safeHours;
    if (taskId) row.tasks.add(taskId);
  };

  tasks.forEach((task) => {
    if (!['Code', 'qa'].includes(task?.type)) return;

    const taskId = task.id || task.task_id || task.title;
    const devHours = numberOrZero(task.dev_hours);
    const handoffHours = numberOrZero(task.dev_to_qa_hours);
    const reviewHours = numberOrZero(task.code_review_hours);
    const qaHours = numberOrZero(task.qa_hours) + numberOrZero(task.automation_qa_hours);
    const hasBreakdown = devHours + handoffHours + reviewHours + qaHours > 0;
    const estimateFallback = hasBreakdown ? 0 : numberOrZero(task.estimated_hours);
    const developerId = task.developer_id || task.developer?.id;
    const reviewerId = task.assigned_to_user || task.assigned_user?.id;
    const qaAssignee = task.qa_assigned;

    addHours(
      developerId,
      task.developer?.name || task.developer?.first_name,
      'dev',
      devHours + handoffHours + (task.type === 'Code' ? estimateFallback : 0),
      taskId
    );
    addHours(
      reviewerId,
      task.assigned_user?.name || task.assigned_user?.first_name,
      'review',
      reviewHours,
      taskId
    );
    addHours(
      qaAssignee ? `qa:${qaAssignee}` : null,
      qaAssignee,
      'qa',
      qaHours + (task.type === 'qa' ? estimateFallback : 0),
      taskId
    );
  });

  return Array.from(rows.values())
    .map((row) => ({ ...row, tasks: row.tasks.size }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
};

export default function SprintDashboard() {
  const { projectId } = useParams();
  const projectRoute = useContext(ProjectRouteContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'overview';
  const dateParam = searchParams.get('date');
  const selectedDate = React.useMemo(() =>
    dateParam ? new Date(dateParam) : new Date(),
    [dateParam]);
  const [activeTab, setActiveTabState] = useState(initialTab);

  // Custom setter that also updates URL
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    setSearchParams(prev => {
      const newParams = new URLSearchParams(prev);
      newParams.set('tab', tab);
      return newParams;
    }, { replace: true });
  };
  const [sprintId, setSprintId] = useState(null);
  const [sprint, setSprint] = useState(null);
  const [sprints, setSprints] = useState([]);
  const [project, setProject] = useState(null);
  const [isProjectLoaded, setIsProjectLoaded] = useState(false);
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);
  const [viewMode, setViewMode] = useState(() => {
    const mode = searchParams.get('mode');
    return VIEW_MODES.includes(mode) ? mode : 'combined';
  });

  const changeViewMode = (mode) => {
    setViewMode(mode);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('mode', mode);
      return next;
    }, { replace: true });
  };

  useEffect(() => {
    const requestedTab = searchParams.get('tab') || 'overview';
    if (requestedTab !== activeTab) setActiveTabState(requestedTab);
    const requestedMode = searchParams.get('mode');
    if (VIEW_MODES.includes(requestedMode) && requestedMode !== viewMode) setViewMode(requestedMode);
  }, [activeTab, searchParams, viewMode]);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  const [workloadTasks, setWorkloadTasks] = useState([]);
  const [isLoadingWorkload, setIsLoadingWorkload] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [projectSettings, setProjectSettings] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    qa_mode_enabled: false,
    sheet_integration_enabled: false,
    sheet_id: '',
    issue_sheet_id: '',
    issue_sheet_name: 'Issue Tracker',
  });
  const sheetEnabled = !!(project?.sheet_integration_enabled && project?.sheet_id);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setIsProjectLoaded(true);
      return;
    }

    let mounted = true;
    setIsProjectLoaded(false);

    if (projectRoute?.project && Number(projectRoute.project.id) === Number(projectId)) {
      setProject(projectRoute.project);
      setIsProjectLoaded(true);
      return undefined;
    }

    fetchProjects()
      .then(({ data }) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        const found = list.find(p => p.id === Number(projectId));
        setProject(found || null);
      })
      .catch(() => {
        if (mounted) setProject(null);
      })
      .finally(() => {
        if (mounted) setIsProjectLoaded(true);
      });

    return () => {
      mounted = false;
    };
  }, [projectId, projectRoute?.project]);

  useEffect(() => {
    if (!project) return;
    setProjectSettings({
      name: project.name || '',
      description: project.description || '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      qa_mode_enabled: !!project.qa_mode_enabled,
      sheet_integration_enabled: !!project.sheet_integration_enabled,
      sheet_id: project.sheet_id || '',
      issue_sheet_id: project.issue_sheet_id || '',
      issue_sheet_name: project.issue_sheet_name || 'Issue Tracker',
    });
  }, [project]);

  // If sheet tab is active but integration is off, bounce back to overview.
  useEffect(() => {
    if (isProjectLoaded && activeTab === 'sheet' && !sheetEnabled) {
      setActiveTab('overview');
    }
  }, [activeTab, isProjectLoaded, sheetEnabled]);

  // Fall back to dev-only when the project does not support QA mode.
  useEffect(() => {
    if (!project?.qa_mode_enabled && viewMode !== 'dev') {
      changeViewMode('dev');
    }
  }, [project?.qa_mode_enabled, viewMode]);

  // Load sprints when project changes and select the active one
  useEffect(() => {
    setSprint(null);
    setSprints([]);
    setIsLoadingDashboard(true);

    const query = projectId ? `?project_id=${projectId}` : '';
    fetch(`/api/sprints.json${query}`)
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        const sorted = [...list].sort((a, b) => new Date(a.end_date) - new Date(b.end_date));

        setSprints(sorted);

        if (sorted.length) {
          const reference = selectedDate;
          const current = sorted.find(s => {
            const start = new Date(s.start_date);
            const end = new Date(s.end_date);
            return reference >= start && reference <= end;
          });

          const mostRecentPast = sorted
            .filter(s => new Date(s.end_date) < reference)
            .sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0];

          const sprintToSelect = current || mostRecentPast || sorted[0];

          setSprint(sprintToSelect || null);
          setSprintId(sprintToSelect ? sprintToSelect.id : null);
        } else {
          setSprintId(null);
        }
      })
      .catch(() => {
        setSprint(null);
        setSprintId(null);
        setSprints([]);
      })
      .finally(() => setIsLoadingDashboard(false));
  }, [projectId, selectedDate]);

  useEffect(() => {
    if (sprintId !== null && sprints.length) {
      const found = sprints.find(sp => sp.id === sprintId);
      if (found) setSprint(found);
    }
  }, [sprintId, sprints]);

  useEffect(() => {
    if (!projectId || !sprintId) {
      setWorkloadTasks([]);
      setIsLoadingWorkload(false);
      return;
    }

    let mounted = true;
    const params = { project_id: projectId, sprint_id: sprintId };
    if (viewMode === 'dev') params.type = 'Code';
    if (viewMode === 'qa') params.type = 'qa';

    setIsLoadingWorkload(true);
    SchedulerAPI.getTasks(params)
      .then(({ data }) => {
        if (!mounted) return;
        const list = Array.isArray(data) ? data : [];
        setWorkloadTasks(list.filter((task) => String(task.sprint_id) === String(sprintId)));
      })
      .catch(() => {
        if (mounted) setWorkloadTasks([]);
      })
      .finally(() => {
        if (mounted) setIsLoadingWorkload(false);
      });

    return () => {
      mounted = false;
    };
  }, [projectId, sprintId, viewMode]);

  const workloadRows = useMemo(
    () => buildWorkloadRows(workloadTasks, project?.users || []),
    [workloadTasks, project?.users]
  );

  const visibleWorkloadRows = workloadRows.slice(0, 4);
  const hiddenWorkloadCount = Math.max(workloadRows.length - visibleWorkloadRows.length, 0);
  const totalWorkloadHours = workloadRows.reduce((sum, row) => sum + row.hours, 0);

  if (isLoadingDashboard) {
    return <PageLoader title="Project dashboard" message="Loading sprint board, tasks, and project data…" />;
  }

  const isCurrentSprint = (s) => {
    if (!s) return false;
    const today = new Date();
    const start = new Date(s.start_date);
    const end = new Date(s.end_date);
    return today >= start && today <= end;
  };

  const handleSprintChange = (s) => {
    if (typeof s === 'number' || typeof s === 'string') {
      const found = sprints.find(sp => sp.id === Number(s));
      if (found) setSprint(found);
      setSprintId(Number(s));
    } else {
      setSprint(s);
      setSprintId(s?.id || null);
    }
    setIsHeaderExpanded(false);
  };

  const handleProjectSettingsChange = (event) => {
    const { name, value, type, checked } = event.target;
    setProjectSettings((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleProjectSettingsSubmit = async (event) => {
    event.preventDefault();
    if (!project?.id) return;

    setIsSavingSettings(true);
    setSettingsMessage('');
    try {
      const payload = {
        ...projectSettings,
        issue_sheet_name: projectSettings.issue_sheet_name || 'Issue Tracker',
      };
      const { data } = await updateProject(project.id, payload);
      setProject(data);
      setSettingsMessage('Project settings updated successfully.');
    } catch (error) {
      setSettingsMessage(error?.response?.data?.errors?.join(', ') || 'Failed to update project settings.');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const viewModeLabel = viewMode === 'qa' ? 'QA' : viewMode === 'combined' ? 'Combined' : 'Dev';
  const sprintRangeLabel = sprint ? formatDateRange(sprint.start_date, sprint.end_date) : 'No sprint selected';
  const workingDaysCount = sprint
    ? calculateWorkingDays(
      sprint.start_date,
      sprint.end_date,
      typeof sprint.working_days_mask === 'number' ? sprint.working_days_mask : 62
    )
    : 0;
  const dashboardTabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'scheduler', label: 'Scheduler' },
    { key: 'todo', label: 'Todo' },
    { key: 'statistics', label: 'Statistics' },
    { key: 'issues', label: 'Issue Tracker' },
    sheetEnabled ? { key: 'sheet', label: 'Sheet' } : null,
    { key: 'vault', label: 'Vault' },
    { key: 'settings', label: 'Settings' },
  ].filter(Boolean);
  const emptyState = (
    <div className="shell-panel shell-panel-strong mt-6 rounded-[30px] px-6 py-12 text-center">
      <p className="text-lg font-semibold text-slate-900">No sprint selected</p>
      <p className="mt-2 text-sm text-slate-500">Pick a sprint from the command deck to load this workspace.</p>
    </div>
  );


  return (
    <div className="nexus-project-command-center space-y-3 pb-4">
      <header className="shell-panel shell-panel-strong dashboard-command-deck landing-hero-3d overflow-hidden rounded-[30px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(103,232,249,0.16),transparent_24%),radial-gradient(circle_at_left,rgba(52,109,255,0.12),transparent_26%)]" />
        <div className="relative space-y-3 p-3.5 sm:p-4 lg:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <span className="shell-eyebrow">Project Command Deck</span>
              <h1 className="mt-1.5 text-[clamp(1.65rem,2.35vw,2.35rem)] font-semibold tracking-[-0.045em] text-slate-950">
                {project?.name || 'Project Dashboard'}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">
                {project?.description || 'Plan sprint delivery, review project health, and move between execution surfaces from one shared control room.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 xl:justify-end">
              <span className="shell-chip">
                <span className="shell-chip-dot" />
                {activeTab}
              </span>
              <span className="shell-chip">
                <span className="shell-chip-dot" />
                {viewModeLabel} mode
              </span>
              {sheetEnabled ? (
                <span className="shell-chip">
                  <span className="shell-chip-dot" />
                  Sheet linked
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.88fr)]">
            <div className="grid gap-2.5">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="shell-kpi-card shell-kpi-card-compact">
                  <span className="shell-kpi-label">Sprint Window</span>
                  <span className="shell-kpi-value">{sprint ? sprint.name : 'Awaiting sprint'}</span>
                  <span className="shell-kpi-meta">{sprintRangeLabel}</span>
                </div>

                <div className="shell-kpi-card shell-kpi-card-compact">
                  <span className="shell-kpi-label">Working Days</span>
                  <span className="shell-kpi-value">{workingDaysCount}</span>
                  <span className="shell-kpi-meta">Configured against this sprint schedule.</span>
                </div>

                <div className="shell-kpi-card shell-kpi-card-compact">
                  <span className="shell-kpi-label">Project Crew</span>
                  <span className="shell-kpi-value">{project?.users?.length || 0}</span>
                  <span className="shell-kpi-meta">{project?.qa_mode_enabled ? 'Dev and QA lanes enabled.' : 'Dev-only workflow active.'}</span>
                </div>
              </div>

              <div className="dashboard-workload-strip">
                <div className="dashboard-workload-summary">
                  <span className="dashboard-workload-label">Workload</span>
                  <span className="dashboard-workload-total">{isLoadingWorkload ? '...' : formatHours(totalWorkloadHours)}</span>
                </div>

                <div className="dashboard-workload-list scrollbar-hide">
                  {isLoadingWorkload ? (
                    <span className="dashboard-workload-empty">Calculating...</span>
                  ) : visibleWorkloadRows.length ? (
                    <>
                      {visibleWorkloadRows.map((row) => (
                        <span key={row.key} className="dashboard-workload-pill" title={`${row.name}: ${formatHours(row.hours)} across ${row.tasks} task${row.tasks === 1 ? '' : 's'}`}>
                          <span className="dashboard-workload-name">{row.name}</span>
                          <span className="dashboard-workload-hours">{formatHours(row.hours)}</span>
                        </span>
                      ))}
                      {hiddenWorkloadCount > 0 ? (
                        <span className="dashboard-workload-pill dashboard-workload-pill-muted">+{hiddenWorkloadCount} more</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="dashboard-workload-empty">No sprint hours assigned.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/12 bg-[linear-gradient(135deg,rgba(7,17,32,0.96),rgba(30,41,59,0.92))] p-3.5 text-white shadow-[0_22px_42px_rgb(15_23_42_/_0.18)] sm:p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-white/45">
                {sprint && isCurrentSprint(sprint) ? 'Current Sprint' : 'Sprint Status'}
              </p>
              <div className="mt-2 flex items-end justify-between gap-2.5">
                <div>
                  <p className="text-[1.45rem] font-semibold tracking-[-0.04em]">
                    {sprint ? sprint.name : 'No sprint selected'}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-white/66">
                    Use the sprint manager to swap windows, review dates, and shift this dashboard into the correct execution lane.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsHeaderExpanded((value) => !value)}
                  className="shell-button-secondary shrink-0 bg-white/10 px-3.5 py-2 text-white shadow-none hover:bg-white/16"
                >
                  {isHeaderExpanded ? <ChevronUpIcon className="h-5 w-5" /> : <ChevronDownIcon className="h-5 w-5" />}
                  {isHeaderExpanded ? 'Hide' : 'Manage'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto]">
            <div className="shell-segmented scrollbar-hide overflow-x-auto">
              {dashboardTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`shell-segmented-button whitespace-nowrap ${activeTab === tab.key ? 'shell-segmented-button-active' : ''}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 xl:justify-end">
              {project?.qa_mode_enabled ? (
                <div className="shell-segmented">
                  {VIEW_MODES.map((mode) => {
                    const active = viewMode === mode;
                    const label = mode === 'qa' ? 'QA' : mode === 'combined' ? 'Combined' : 'Dev';

                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => changeViewMode(mode)}
                        className={`shell-segmented-button min-w-[5rem] ${active ? 'shell-segmented-button-active' : ''}`}
                        aria-pressed={active}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <span className="sr-only">Current view mode: {viewModeLabel}</span>
                </div>
              ) : null}

              <Link
                to={`/projects/${projectId}/metaverse?tab=${activeTab}`}
                className="shell-button-secondary px-4 py-2.5"
              >
                <CubeTransparentIcon className="h-5 w-5" />
                3D Mode
              </Link>

              <button
                type="button"
                onClick={() => setIsHeaderExpanded((value) => !value)}
                className="shell-button-secondary px-4 py-2.5"
              >
                <CalendarDaysIcon className="h-5 w-5" />
                {isHeaderExpanded ? 'Hide Sprint Manager' : 'Open Sprint Manager'}
              </button>
            </div>
          </div>

          {isHeaderExpanded ? (
            <div className="shell-panel shell-panel-strong rounded-[30px] px-4 py-5 sm:px-5">
              <SprintManager
                onSprintChange={handleSprintChange}
                projectId={projectId}
                projectName={project?.name}
                selectedDate={selectedDate}
                sprintId={sprintId}
                isVisible={isHeaderExpanded}
              />
            </div>
          ) : null}
        </div>
      </header>
      {activeTab === 'overview' && (
        <SprintOverview
          projectId={projectId}
          sprintId={sprintId}
          availableSprints={sprints}
          onSprintChange={handleSprintChange}
          sheetIntegrationEnabled={project?.sheet_integration_enabled}
          projectMembers={project?.users}
          viewMode={viewMode}
        />
      )}
      {activeTab === 'scheduler' && (
        sprintId ? (
          <Scheduler
            sprintId={sprintId}
            projectId={projectId}
            sheetIntegrationEnabled={project?.sheet_integration_enabled}
            projectMembers={project?.users}
            viewMode={viewMode}
          />
        ) : (
          emptyState
        )
      )}
      {activeTab === 'todo' && (
        sprintId
          ? <TodoBoard sprintId={sprintId} projectId={projectId} viewMode={viewMode} onSprintChange={handleSprintChange} availableSprints={sprints} />
          : emptyState
      )}
      {activeTab === 'sheet' && sheetEnabled && (
        <Sheet sheetName={sprint?.name} projectId={projectId} sheetId={project?.sheet_id} />
      )}
      {activeTab === 'statistics' && (
        <ProjectStatistics projectId={projectId} />
      )}
      {activeTab === 'issues' && (
        <IssueTracker projectId={projectId} sprint={sprint} />
      )}
      {activeTab === 'vault' && (
        <ProjectVault projectId={projectId} />
      )}
      {activeTab === 'settings' && (
        <div className="shell-panel shell-panel-strong mx-auto mt-2 w-full max-w-5xl rounded-[32px] p-6 shadow-[0_24px_54px_rgb(15_23_42_/_0.08)] sm:p-7">
          <h2 className="text-2xl font-bold text-slate-900">Project Settings</h2>
          <p className="mt-1 text-sm text-slate-500">
            Update the same project settings available in the Projects edit page.
          </p>

          <form onSubmit={handleProjectSettingsSubmit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
              <input id="name" name="name" value={projectSettings.name} onChange={handleProjectSettingsChange} required className="shell-input p-3" />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea id="description" name="description" value={projectSettings.description} onChange={handleProjectSettingsChange} className="shell-input h-28 resize-y p-3" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="start_date" className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input type="date" id="start_date" name="start_date" value={projectSettings.start_date} onChange={handleProjectSettingsChange} className="shell-input p-3" />
              </div>
              <div>
                <label htmlFor="end_date" className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input type="date" id="end_date" name="end_date" value={projectSettings.end_date} onChange={handleProjectSettingsChange} className="shell-input p-3" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" name="qa_mode_enabled" checked={projectSettings.qa_mode_enabled} onChange={handleProjectSettingsChange} className="h-4 w-4" />
              Enable QA Mode
            </label>

            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" name="sheet_integration_enabled" checked={projectSettings.sheet_integration_enabled} onChange={handleProjectSettingsChange} className="h-4 w-4" />
              Enable Sheet Integration
            </label>

            {projectSettings.sheet_integration_enabled && (
              <div className="space-y-4 rounded-[24px] border border-white/70 bg-white/64 p-4">
                <div>
                  <label htmlFor="sheet_id" className="block text-sm font-medium text-gray-700 mb-1">Task Sheet ID</label>
                  <input id="sheet_id" name="sheet_id" value={projectSettings.sheet_id} onChange={handleProjectSettingsChange} className="shell-input p-3" />
                </div>
                <div>
                  <label htmlFor="issue_sheet_id" className="block text-sm font-medium text-gray-700 mb-1">Issue Tracker Sheet ID</label>
                  <input id="issue_sheet_id" name="issue_sheet_id" value={projectSettings.issue_sheet_id} onChange={handleProjectSettingsChange} className="shell-input p-3" />
                </div>
                <div>
                  <label htmlFor="issue_sheet_name" className="block text-sm font-medium text-gray-700 mb-1">Issue Tracker Sheet Name</label>
                  <input id="issue_sheet_name" name="issue_sheet_name" value={projectSettings.issue_sheet_name} onChange={handleProjectSettingsChange} className="shell-input p-3" />
                </div>
              </div>
            )}

            {settingsMessage && (
              <p className={`text-sm font-medium ${settingsMessage.includes('successfully') ? 'text-emerald-600' : 'text-rose-600'}`}>
                {settingsMessage}
              </p>
            )}

            <div className="flex justify-end">
              <button type="submit" disabled={isSavingSettings} className="shell-button-primary disabled:opacity-60">
                {isSavingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
