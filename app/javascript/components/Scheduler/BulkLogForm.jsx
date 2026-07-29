import React, { useEffect, useMemo, useState } from 'react';
import {
  EMPTY_ARRAY,
  buildDistributionPlan,
  buildTaskStageRows,
  formatHours,
  numberOrZero,
  resolveDefaultLogDate,
  validateStageSelection,
} from './bulkLogPlanner';

export default function BulkLogForm({
  tasks,
  existingLogs,
  developers,
  dates,
  viewMode = 'combined',
  onSubmit,
  onCancel
}) {
  const safeTasks = useMemo(() => Array.isArray(tasks) ? tasks : EMPTY_ARRAY, [tasks]);
  const safeExistingLogs = useMemo(() => Array.isArray(existingLogs) ? existingLogs : EMPTY_ARRAY, [existingLogs]);
  const safeDevelopers = useMemo(() => Array.isArray(developers) ? developers : EMPTY_ARRAY, [developers]);
  const safeDates = useMemo(() => Array.isArray(dates) ? dates : EMPTY_ARRAY, [dates]);
  const [logDate, setLogDate] = useState('');
  const [maxHoursPerDay, setMaxHoursPerDay] = useState('8');
  const [applyDeveloperId, setApplyDeveloperId] = useState('');
  const [showOnlyRemaining, setShowOnlyRemaining] = useState(true);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(buildTaskStageRows({
      tasks: safeTasks,
      existingLogs: safeExistingLogs,
      developers: safeDevelopers,
      dates: safeDates,
      viewMode,
    }));
    setLogDate(resolveDefaultLogDate(safeDates));
    setMaxHoursPerDay('8');
    setApplyDeveloperId(safeDevelopers[0] ? String(safeDevelopers[0].id) : '');
    setShowOnlyRemaining(true);
    setError('');
  }, [safeTasks, safeExistingLogs, safeDevelopers, safeDates, viewMode]);

  const visibleRows = useMemo(
    () => rows.filter((row) => !showOnlyRemaining || row.selected || row.remainingHours > 0),
    [rows, showOnlyRemaining]
  );

  const selectedRows = useMemo(
    () => rows.filter((row) => row.selected),
    [rows]
  );

  const selectedHoursTotal = useMemo(
    () => selectedRows.reduce((sum, row) => sum + numberOrZero(row.hours), 0),
    [selectedRows]
  );

  const distributionPreview = useMemo(
    () => buildDistributionPlan({
      rows,
      dates: safeDates,
      startDate: logDate,
      maxHoursPerDay,
      existingLogs: safeExistingLogs
    }),
    [rows, safeDates, logDate, maxHoursPerDay, safeExistingLogs]
  );

  const remainingTaskCount = useMemo(
    () => new Set(rows.filter((row) => row.remainingHours > 0).map((row) => row.taskId)).size,
    [rows]
  );

  const updateRow = (rowId, updater) => {
    setRows((currentRows) => currentRows.map((row) => (
      row.rowId === rowId ? updater(row) : row
    )));
  };

  const toggleSelection = (rowId) => {
    setError('');
    updateRow(rowId, (row) => ({
      ...row,
      selected: !row.selected,
      hours: !row.selected && !row.hours && row.remainingHours > 0 ? String(row.remainingHours) : row.hours
    }));
  };

  const handleHoursChange = (rowId, value) => {
    setError('');
    updateRow(rowId, (row) => ({ ...row, hours: value }));
  };

  const handleDeveloperChange = (rowId, value) => {
    setError('');
    updateRow(rowId, (row) => ({ ...row, developerId: value }));
  };

  const selectRemainingTasks = () => {
    setRows((currentRows) => currentRows.map((row) => ({
      ...row,
      selected: row.remainingHours > 0,
      hours: row.remainingHours > 0 ? String(row.remainingHours) : row.hours
    })));
  };

  const clearSelection = () => {
    setRows((currentRows) => currentRows.map((row) => ({ ...row, selected: false })));
  };

  const fillRemainingHours = () => {
    setRows((currentRows) => currentRows.map((row) => (
      row.selected
        ? { ...row, hours: row.remainingHours > 0 ? String(row.remainingHours) : row.hours }
        : row
    )));
  };

  const applyDeveloperToSelected = () => {
    if (!applyDeveloperId) return;

    setRows((currentRows) => currentRows.map((row) => (
      row.selected ? { ...row, developerId: applyDeveloperId } : row
    )));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!logDate) {
      setError('Select a start date.');
      return;
    }

    if (numberOrZero(maxHoursPerDay) <= 0) {
      setError('Per day max hours must be greater than 0.');
      return;
    }

    const validation = validateStageSelection(rows);
    if (!validation.valid) {
      setError(validation.message);
      return;
    }

    if (!distributionPreview.distributionDates.length) {
      setError('No sprint dates are available from the selected start date.');
      return;
    }

    if (!distributionPreview.entries.length) {
      setError('Select at least one task with hours greater than 0.');
      return;
    }

    await onSubmit(distributionPreview.entries);
  };

  if (safeDevelopers.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        No members are available in this view. Switch the sprint toggle or add matching project members first.
      </div>
    );
  }

  if (safeTasks.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No sprint tasks are available for bulk logging in the current view.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 xl:grid-cols-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Start Date</label>
          <select
            value={logDate}
            onChange={(event) => setLogDate(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme"
          >
            {safeDates.map((date) => (
              <option key={date} value={date}>
                {new Date(date).toLocaleDateString()}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Per Day Max Hours</label>
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={maxHoursPerDay}
            onChange={(event) => setMaxHoursPerDay(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">Apply Member</label>
          <div className="flex gap-2">
            <select
              value={applyDeveloperId}
              onChange={(event) => setApplyDeveloperId(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme"
            >
              <option value="">Select member</option>
              {safeDevelopers.map((developer) => (
                <option key={developer.id} value={developer.id}>{developer.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyDeveloperToSelected}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showOnlyRemaining}
              onChange={(event) => setShowOnlyRemaining(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-theme focus:ring-theme"
            />
            Show only remaining work
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tasks With Remaining Stages</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{remainingTaskCount}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Stages</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{selectedRows.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Hours</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{formatHours(selectedHoursTotal)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Generated Log Rows</div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{distributionPreview.entries.length}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Bulk log starts from <span className="font-semibold text-slate-800">{logDate ? new Date(logDate).toLocaleDateString() : 'the selected date'}</span>, creates task stages from the task hour fields, and fills each working day up to <span className="font-semibold text-slate-800">{formatHours(maxHoursPerDay)}</span> per member. Review, Dev to QA, and QA stages start after the previous stage's last logged day; last sprint day overflow is added there for manual adjustment.
      </div>

      {distributionPreview.overflowHours > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {formatHours(distributionPreview.overflowHours)} could not fit within the daily limit for {distributionPreview.overflowTasks} stage{distributionPreview.overflowTasks === 1 ? '' : 's'} and will be added on the last sprint day so you can adjust manually.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectRemainingTasks}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Select Remaining Stages
        </button>
        <button
          type="button"
          onClick={fillRemainingHours}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Fill Remaining Hours
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Clear Selection
        </button>
      </div>

      <div className="max-h-[45vh] overflow-auto rounded-2xl border border-slate-200 lg:max-h-[50vh]">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Pick</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Task</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Stage</th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Planned</th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Logged</th>
              <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Remaining</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Member</th>
              <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Hours To Log</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan="8" className="px-4 py-8 text-center text-sm text-slate-500">
                  No tasks match the current bulk log filters.
                </td>
              </tr>
            )}
            {visibleRows.map((row) => {
              const remainingTone = row.remainingHours > 0
                ? 'text-emerald-700'
                : row.remainingHours < 0
                  ? 'text-red-600'
                  : 'text-slate-500';

              return (
                <tr key={row.rowId} className={row.selected ? 'bg-[rgb(var(--theme-color-rgb)/0.04)]' : undefined}>
                  <td className="px-3 py-3 align-top">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      onChange={() => toggleSelection(row.rowId)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-theme focus:ring-theme"
                    />
                  </td>
                  <td className="px-3 py-3 align-top">
                    <div className="min-w-[260px]">
                      {row.taskUrl ? (
                        <a
                          href={row.taskUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-indigo-600 hover:underline"
                        >
                          {row.taskKey}
                        </a>
                      ) : (
                        <div className="text-sm font-semibold text-slate-900">{row.taskKey}</div>
                      )}
                      <div className="mt-1 text-sm text-slate-600">{row.title}</div>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top text-sm font-semibold text-slate-700">{row.stageLabel}</td>
                  <td className="px-3 py-3 text-center text-sm text-slate-700">{formatHours(row.plannedHours)}</td>
                  <td className="px-3 py-3 text-center text-sm text-slate-700">{formatHours(row.loggedHours)}</td>
                  <td className={`px-3 py-3 text-center text-sm font-semibold ${remainingTone}`}>{formatHours(row.remainingHours)}</td>
                  <td className="px-3 py-3">
                    <select
                      value={row.developerId}
                      onChange={(event) => handleDeveloperChange(row.rowId, event.target.value)}
                      className="w-full min-w-[180px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme"
                    >
                      <option value="">Select member</option>
                      {safeDevelopers.map((developer) => (
                        <option key={developer.id} value={developer.id}>{developer.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={row.hours}
                      onChange={(event) => handleHoursChange(row.rowId, event.target.value)}
                      className="w-full min-w-[120px] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-theme"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-lg bg-theme px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
        >
          Create Bulk Logs
        </button>
      </div>
    </form>
  );
}
