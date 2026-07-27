import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { fetchSheetData } from '../components/api';
import {
  FiRefreshCw,
  FiExternalLink,
  FiSearch,
  FiTable,
  FiAlertCircle,
  FiLoader,
  FiFileText
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const HEADER_GROUPS = {
  task: ['task', 'taskid'],
  title: ['taskdetails', 'tasktitle', 'title'],
  developer: ['devassigned', 'assignedtodeveloper', 'developer'],
  review: ['review', 'assigneduser', 'assignedtouser'],
  qaAssigned: ['qaassigned'],
  internalQa: ['internalqa'],
  blocker: ['blocker'],
  demo: ['demo'],
  priority: ['priority']
};

const KNOWN_HEADER_KEYS = new Set(Object.values(HEADER_GROUPS).flat());

const normalizeHeader = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const detectHeaderRowIndex = (sheetRows) => {
  let bestIndex = 0;
  let bestScore = 0;

  sheetRows.forEach((row, index) => {
    const normalizedCells = row.map(normalizeHeader).filter(Boolean);
    if (!normalizedCells.length) return;

    const matchedHeaders = normalizedCells.filter((cell) => KNOWN_HEADER_KEYS.has(cell));
    const hasTaskColumn = normalizedCells.some((cell) => HEADER_GROUPS.task.includes(cell));
    const hasTitleColumn = normalizedCells.some((cell) => HEADER_GROUPS.title.includes(cell));

    if (hasTaskColumn && hasTitleColumn && matchedHeaders.length >= 3 && matchedHeaders.length > bestScore) {
      bestIndex = index;
      bestScore = matchedHeaders.length;
    }
  });

  return bestIndex;
};

const Sheet = ({ sheetName, projectId, sheetId }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadData = useCallback(async (isRefresh = false) => {
    if (!sheetId) {
      setError("Sheet integration is enabled, but no Sheet ID is configured. Add a Sheet ID in project settings.");
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const params = sheetName ? { sheet: sheetName, project_id: projectId } : { project_id: projectId };
      const { data } = await fetchSheetData(params);
      setRows(data.rows || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to load sheet data. Please confirm the Sheet ID and permissions.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sheetName, projectId, sheetId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const headerRowIndex = useMemo(() => detectHeaderRowIndex(rows), [rows]);

  const titleText = useMemo(() => {
    if (headerRowIndex === 0) return null;

    const titleRows = rows.slice(0, headerRowIndex);
    for (const row of titleRows) {
      const value = row.find((cell) => String(cell || '').trim());
      if (value) return String(value).trim();
    }

    return null;
  }, [rows, headerRowIndex]);

  const headerRow = rows.length > 0 ? (rows[headerRowIndex] || []) : [];
  const bodySourceRows = rows.length > headerRowIndex + 1 ? rows.slice(headerRowIndex + 1) : [];

  const bodyRows = useMemo(() => {
    if (!searchQuery.trim()) return bodySourceRows;
    const query = searchQuery.toLowerCase();
    return bodySourceRows.filter((row) => row.some((cell) => String(cell).toLowerCase().includes(query)));
  }, [bodySourceRows, searchQuery]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 animate-pulse">
        <FiLoader className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <p className="text-zinc-500 font-medium">Fetching sheet data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 flex items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20 sm:m-6 sm:p-6">
        <FiAlertCircle className="w-6 h-6 text-red-500 shrink-0 mt-1" />
        <div>
          <h3 className="text-lg font-bold text-red-800 dark:text-red-300">Sheet Connection Error</h3>
          <p className="text-red-700 dark:text-red-400 mt-1">{error}</p>
          <button
            onClick={() => loadData()}
            className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all font-medium text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl overflow-hidden">
        {/* Header Section */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl shadow-inner">
              <FiTable className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100 tracking-tight">Google Sheet</h1>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 font-medium">
                {titleText || (sheetName ? `Showing: ${sheetName}` : 'Spreadsheet data')}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap items-center gap-3 md:w-auto">
            <div className="group relative w-full md:w-64">
              <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-500 transition-colors w-4 h-4" />
              <input
                type="text"
                placeholder="Find in sheet..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800/50"
              />
            </div>

            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-zinc-500 transition-all hover:bg-zinc-100 hover:text-blue-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-blue-400"
              title="Refresh Data"
              aria-label="Refresh sheet data"
            >
              <FiRefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <a
              href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-blue-700 active:scale-95 sm:flex-none"
            >
              <FiExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">Open in Drive</span>
            </a>
          </div>
        </div>

        {/* Table Section */}
        <div className="overflow-x-auto max-h-[70vh] relative custom-scrollbar">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-24 text-center">
              <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-full mb-6">
                <FiFileText className="w-12 h-12 text-zinc-300 dark:text-zinc-700" />
              </div>
              <h3 className="text-xl font-bold text-zinc-900 dark:text-white">No Data Available</h3>
              <p className="text-sm text-zinc-500 mt-2 max-w-xs">This sheet appears to be empty or the data couldn't be retrieved.</p>
            </div>
          ) : (
            <table className="min-w-max w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 z-20">
                <tr className="bg-zinc-50/90 dark:bg-zinc-800/90 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-700">
                  {headerRow.map((cell, i) => (
                    <th key={i} className="px-6 py-4.5 font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wider text-[11px] whitespace-nowrap">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.length > 0 ? (
                  bodyRows.map((row, i) => (
                    <tr
                      key={i}
                      className="group border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-blue-50/40 dark:hover:bg-blue-900/5 transition-colors"
                    >
                      {row.map((cell, j) => (
                        <td key={j} className="px-6 py-4 text-zinc-600 dark:text-zinc-400 border-r border-zinc-100/50 last:border-r-0 dark:border-zinc-800/30">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={headerRow.length} className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <FiSearch className="w-8 h-8 text-zinc-200 dark:text-zinc-800" />
                        <p className="text-zinc-500 font-medium">
                          {searchQuery ? `No matches found for "${searchQuery}"` : 'No data records found.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer/Stats */}
        {rows.length > 0 && (
          <div className="px-6 py-4 bg-zinc-50/50 dark:bg-zinc-800/20 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[11px] font-bold text-zinc-500 uppercase tracking-widest">
                {bodyRows.length} Rows
              </span>
              {searchQuery && (
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 animate-pulse">
                  Filtered Result
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 font-medium italic tracking-wide">
              Data synchronized with project Google Sheet integration
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sheet;
