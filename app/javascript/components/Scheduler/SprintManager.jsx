import PageLoader from '../ui/PageLoader';
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FiEdit2, FiTrash2, FiPlus, FiX, FiCalendar, FiChevronLeft, FiChevronRight, FiAlertTriangle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

export default function SprintManager({ onSprintChange, projectId, projectName, selectedDate, sprintId, isVisible = true }) {
  const [sprints, setSprints] = useState([]);
  const [currentSprint, setCurrentSprint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [formVisible, setFormVisible] = useState(false);
  const [formData, setFormData] = useState({ id: null, name: '', start_date: '', end_date: '', working_days_mask: 62 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const timelineRef = useRef(null);

  // Bitmask for working days:
  // 0 => Sunday, 1 => Monday, ..., 6 => Saturday
  const isWorkingDay = (mask, dayIndex) => (Number(mask) & (1 << dayIndex)) !== 0;
  const toggleWorkingDay = (mask, dayIndex) => {
    const numericMask = Number(mask) || 0;
    return isWorkingDay(numericMask, dayIndex) ? (numericMask & ~(1 << dayIndex)) : (numericMask | (1 << dayIndex));
  };

  // Load all sprints when component mounts or project changes
  useEffect(() => {
    const query = projectId ? `?project_id=${projectId}` : '';
    fetch(`/api/sprints.json${query}`)
      .then(res => res.json())
      .then(data => {
        const sortedData = data?.sort((a, b) => new Date(a.end_date) - new Date(b.end_date)) || [];
        const reference = selectedDate ? new Date(selectedDate) : new Date();
        const activeSprint = sortedData.find(sprint => {
          const startDate = new Date(sprint.start_date);
          const endDate = new Date(sprint.end_date);
          endDate.setHours(23, 59, 59, 999);
          return reference >= startDate && reference <= endDate;
        });
        const mostRecentPast = sortedData
          .filter(s => new Date(s.end_date) < reference)
          .sort((a, b) => new Date(b.end_date) - new Date(a.end_date))[0];

        setSprints(sortedData);

        const preferredSprint = sprintId
          ? sortedData.find(s => s.id === Number(sprintId))
          : null;

        const sprintToSelect = preferredSprint || activeSprint || mostRecentPast || (sortedData.length > 0 ? sortedData[0] : null);
        setCurrentSprint(sprintToSelect);

        if (!sprintId && sprintToSelect && onSprintChange) {
          onSprintChange(sprintToSelect);
        }
      })
      .catch(err => console.error("Error fetching sprints:", err))
      .finally(() => setLoading(false));
  }, [projectId, selectedDate, sprintId]);

  useEffect(() => {
    if (!sprintId || !sprints.length) return;
    const matchingSprint = sprints.find(s => s.id === Number(sprintId));
    if (matchingSprint && (!currentSprint || currentSprint.id !== matchingSprint.id)) {
      setCurrentSprint(matchingSprint);
    }
  }, [sprintId, sprints, currentSprint]);

  // Scroll to active sprint on load or change
  const scrollSprintIntoView = (sprintId, behavior = 'smooth') => {
    if (!timelineRef.current || !sprintId) return;

    const sprintElement = timelineRef.current.querySelector(`#sprint-${sprintId}`);
    if (!sprintElement) return;

    const container = timelineRef.current;
    const containerRect = container.getBoundingClientRect();
    const sprintRect = sprintElement.getBoundingClientRect();
    const offset = sprintRect.left - containerRect.left;
    const centeredScrollLeft = container.scrollLeft + offset - (container.clientWidth - sprintElement.clientWidth) / 2;
    const maxScrollLeft = container.scrollWidth - container.clientWidth;

    container.scrollTo({
      left: Math.min(Math.max(centeredScrollLeft, 0), Math.max(maxScrollLeft, 0)),
      behavior,
    });
  };

  useEffect(() => {
    if (!currentSprint || !isVisible) return;

    const frame = requestAnimationFrame(() => {
      scrollSprintIntoView(currentSprint.id);
    });

    return () => cancelAnimationFrame(frame);
  }, [currentSprint, isVisible]);

  // --- API & FORM HANDLERS ---
  const handleChange = e => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = e => {
    e.preventDefault();
    setIsSubmitting(true);
    const method = formData.id ? 'PATCH' : 'POST';
    const url = formData.id ? `/api/sprints/${formData.id}.json` : '/api/sprints.json';
    const payload = {
      sprint: {
        name: formData.name,
        start_date: formData.start_date,
        end_date: formData.end_date,
        project_id: projectId,
        working_days_mask: Number(formData.working_days_mask) || 62,
      }
    };

    fetch(url, {
      method,
      headers: {
        'X-CSRF-Token': document.querySelector("meta[name='csrf-token']").content,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    })
    .then(res => res.ok ? res.json() : Promise.reject('Network response was not ok'))
    .then(saved => {
      setSprints(prev => {
        const exists = prev.find(s => s.id === saved.id);
        const updated = exists ? prev.map(s => (s.id === saved.id ? saved : s)) : [...prev, saved];
        return updated.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      });
      setCurrentSprint(saved);
      if (onSprintChange) onSprintChange(saved);
      setFormVisible(false);
    })
    .catch(err => console.error("Error saving sprint:", err))
    .finally(() => setIsSubmitting(false));
  };

  const handleDelete = (id) => {
    setIsSubmitting(true);
    fetch(`/api/sprints/${id}.json`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': document.querySelector("meta[name='csrf-token']").content, 'Accept': 'application/json' }
    })
    .then(() => {
      const remaining = sprints.filter(s => s.id !== id);
      setSprints(remaining);
      const next = remaining.length > 0 ? remaining[0] : null;
      setCurrentSprint(next);
      if (onSprintChange) onSprintChange(next);
      setDeleteCandidate(null);
    })
    .catch(err => console.error("Error deleting sprint:", err))
    .finally(() => setIsSubmitting(false));
  };

  // Select a sprint when its card is clicked
  const handleSelectSprint = (s) => {
    setCurrentSprint(s);
    if (onSprintChange) onSprintChange(s);
    scrollSprintIntoView(s.id);
  };

  const openForm = (sprint = null) => {
    const formatDate = iso => iso ? new Date(iso).toISOString().slice(0, 10) : '';
    setFormData(sprint ? {
      id: sprint.id,
      name: sprint.name,
      start_date: formatDate(sprint.start_date),
      end_date: formatDate(sprint.end_date),
      working_days_mask: typeof sprint.working_days_mask === 'number' ? sprint.working_days_mask : 62
    } : { id: null, name: '', start_date: '', end_date: '', working_days_mask: 62 });
    setFormVisible(true);
  };

  const scrollTimeline = (direction) => {
    if (timelineRef.current) {
      const scrollAmount = direction === 'left' ? -timelineRef.current.offsetWidth / 2 : timelineRef.current.offsetWidth / 2;
      timelineRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // --- HELPER FUNCTIONS ---
  const formatDate = (dateString, options = { month: 'short', day: 'numeric' }) =>
    new Date(dateString).toLocaleDateString('en-US', options);

  const calculateWorkingDays = (startDate, endDate, workingDaysMask = 62) => {
    let start = new Date(startDate);
    let end = new Date(endDate);
    let workingDays = 0;

    while (start <= end) {
      const dayOfWeek = start.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
      if (isWorkingDay(workingDaysMask, dayOfWeek)) {
        workingDays++;
      }
      start.setDate(start.getDate() + 1);
    }
    return workingDays;
  };

  // --- RENDER LOGIC ---
  if (loading) return <PageLoader compact title="Sprints" message="Loading sprints…" />;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  return (
    <div className="bg-slate-50 text-slate-800 p-4 sm:p-6 rounded-2xl font-sans border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            {projectName ? `${projectName} Timeline` : 'Project Timeline'}
          </h2>
          <p className="text-slate-500 mt-1">Select a sprint to view its details and tasks.</p>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
          onClick={() => openForm()}
          className="mt-3 sm:mt-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-50 focus:ring-blue-500"
        >
          <FiPlus /><span>New Sprint</span>
        </motion.button>
      </div>

      {/* Timeline View */}
      <div className="relative">
        <button onClick={() => scrollTimeline('left')} className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white/60 rounded-full text-slate-500 hover:bg-white/90 border border-slate-200 shadow-sm transition-all backdrop-blur-sm"><FiChevronLeft size={20}/></button>
        <div ref={timelineRef} className="flex items-center space-x-4 overflow-x-auto pb-4 scrollbar-hide">
          {sprints.map((s, index) => {
            const isActive = s.id === currentSprint?.id;
            const workingDays = calculateWorkingDays(
              s.start_date,
              s.end_date,
              typeof s.working_days_mask === 'number' ? s.working_days_mask : 62
            );
            return (
              <motion.div
                layout
                id={`sprint-${s.id}`}
                key={s.id}
                onClick={() => handleSelectSprint(s)}
                className={`relative flex-shrink-0 w-56 h-32 p-4 rounded-xl cursor-pointer transition-all duration-300 border flex flex-col justify-between
                  ${isActive
                    ? 'bg-theme border-theme shadow-lg shadow-theme/20 text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-blue-400 hover:shadow-md'
                  }`}
              >
                <div>
                  <span className="font-bold text-lg truncate block">{s.name}</span>
                  <div className={`text-xs mt-1 ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                    <FiCalendar className="inline mr-1.5 mb-0.5" />
                    <span>{formatDate(s.start_date)} - {formatDate(s.end_date)}</span>
                  </div>
                  <div className={`text-xs mt-0.5 ${isActive ? 'text-blue-100' : 'text-slate-500'}`}>
                    <span>Working Days: {workingDays}</span>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-2">
                  <motion.button
                    whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); openForm(s); }}
                    className={`p-1 rounded-md ${isActive ? 'text-blue-100 hover:bg-blue-400' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    <FiEdit2 size={16} />
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                    onClick={(e) => { e.stopPropagation(); setDeleteCandidate(s); }}
                    className={`p-1 rounded-md ${isActive ? 'text-blue-100 hover:bg-blue-400' : 'text-slate-500 hover:bg-red-100 hover:text-red-600'}`}
                  >
                    <FiTrash2 size={16} />
                  </motion.button>
                </div>
                {index < sprints.length - 1 && <div className="absolute left-full top-1/2 w-4 h-px bg-slate-300"></div>}
              </motion.div>
            );
          })}
        </div>
        <button onClick={() => scrollTimeline('right')} className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white/60 rounded-full text-slate-500 hover:bg-white/90 border border-slate-200 shadow-sm transition-all backdrop-blur-sm"><FiChevronRight size={20}/></button>
      </div>

      {/* --- MODALS --- */}
      {portalTarget && createPortal(
        <AnimatePresence>
          {formVisible && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
              onClick={() => setFormVisible(false)}
            >
              <div className="flex min-h-full items-start justify-center py-4 sm:items-center">
                <motion.div
                  initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
                  className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
                  onClick={e => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="sprint-form-title"
                >
                  <form onSubmit={handleSubmit} className="flex max-h-[calc(100dvh-2rem)] min-h-0 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 id="sprint-form-title" className="text-lg font-bold text-slate-800">{formData.id ? 'Edit Sprint' : 'Create New Sprint'}</h3>
                        <button type="button" onClick={() => setFormVisible(false)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500"><FiX size={20} /></button>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-600 mb-1 required-label">Sprint Name</label>
                          <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="e.g., Summer Release" required className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-slate-800 focus:ring-2 focus:ring-theme focus:border-theme transition"/>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1 required-label">Start Date</label>
                            <input type="date" name="start_date" value={formData.start_date} onChange={handleChange} required className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-slate-800 focus:ring-2 focus:ring-theme focus:border-theme transition"/>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-600 mb-1 required-label">End Date</label>
                            <input type="date" name="end_date" value={formData.end_date} onChange={handleChange} required className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-slate-800 focus:ring-2 focus:ring-theme focus:border-theme transition"/>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-slate-600 mb-2 required-label">Working Days</label>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: 'Sun', idx: 0 },
                              { label: 'Mon', idx: 1 },
                              { label: 'Tue', idx: 2 },
                              { label: 'Wed', idx: 3 },
                              { label: 'Thu', idx: 4 },
                              { label: 'Fri', idx: 5 },
                              { label: 'Sat', idx: 6 },
                            ].map((d) => (
                              <label key={d.idx} className="flex items-center gap-2 text-sm text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={isWorkingDay(formData.working_days_mask, d.idx)}
                                  onChange={() =>
                                    setFormData(prev => ({
                                      ...prev,
                                      working_days_mask: toggleWorkingDay(prev.working_days_mask, d.idx),
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-theme focus:ring-theme"
                                />
                                <span>{d.label}</span>
                              </label>
                            ))}
                          </div>
                          <p className="text-xs text-slate-500 mt-2">Select which days are counted as working days for this sprint.</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 justify-end gap-3 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
                      <motion.button type="button" onClick={() => setFormVisible(false)} className="px-4 py-2 bg-white text-slate-700 rounded-md border border-slate-300 hover:bg-slate-100 transition" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>Cancel</motion.button>
                      <motion.button
                        type="submit"
                        disabled={isSubmitting || Number(formData.working_days_mask) === 0}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 transition disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed"
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      >
                        {isSubmitting ? 'Saving...' : (formData.id ? 'Update Sprint' : 'Create Sprint')}
                      </motion.button>
                    </div>
                  </form>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        portalTarget
      )}

      {portalTarget && createPortal(
        <AnimatePresence>
          {deleteCandidate && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
              onClick={() => setDeleteCandidate(null)}
            >
              <div className="flex min-h-full items-center justify-center py-4">
                <motion.div
                  initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
                  className="bg-white rounded-xl shadow-2xl w-full max-w-sm"
                  onClick={e => e.stopPropagation()}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="delete-sprint-title"
                >
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                      <FiAlertTriangle size={24} className="text-red-600" />
                    </div>
                    <h3 id="delete-sprint-title" className="text-lg font-semibold text-slate-800 mt-4">Delete Sprint</h3>
                    <p className="text-sm text-slate-500 mt-2">Are you sure you want to delete <strong className="text-slate-700">"{deleteCandidate.name}"</strong>? This action is permanent.</p>
                  </div>
                  <div className="bg-slate-50 px-6 py-4 flex justify-center gap-3 rounded-b-xl border-t border-slate-200">
                    <motion.button onClick={() => setDeleteCandidate(null)} className="w-full px-4 py-2 bg-white text-slate-700 rounded-md border border-slate-300 hover:bg-slate-100 transition" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>Cancel</motion.button>
                    <motion.button onClick={() => handleDelete(deleteCandidate.id)} disabled={isSubmitting} className="w-full px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition disabled:bg-red-300" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      {isSubmitting ? 'Deleting...' : 'Delete'}
                    </motion.button>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        portalTarget
      )}
    </div>
  );
}
