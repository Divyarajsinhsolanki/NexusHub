import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { getTables } from '../api';
import DynamicAdminTable from './DynamicAdminTable';
import { LayoutDashboard, Database, Search, ChevronRight, Menu } from 'lucide-react';
import { motion } from 'framer-motion';

function Admin() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Fetch available table names on mount
  useEffect(() => {
    async function fetchTables() {
      setLoading(true);
      try {
        const res = await getTables();
        setTables(res.data);
      } catch (error) {
        toast.error('Failed to fetch tables');
      } finally {
        setLoading(false);
      }
    }
    fetchTables();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 767px)');
    const syncSidebar = () => setIsSidebarOpen(!media.matches);
    syncSidebar();
    media.addEventListener('change', syncSidebar);
    return () => media.removeEventListener('change', syncSidebar);
  }, []);

  const filteredTables = tables.filter(t =>
    t.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={{ width: isSidebarOpen ? 256 : 0 }}
        className="fixed inset-y-0 left-0 z-30 flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white shadow-2xl md:relative md:z-auto md:shadow-none"
      >
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-gray-800">Admin</span>
        </div>

        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-hide">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2 mt-2">
            Database Tables
          </div>

          {loading ? (
            <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
          ) : (
            <div className="space-y-1">
              {filteredTables.map(tbl => (
                <button
                  key={tbl}
                  onClick={() => setSelectedTable(tbl)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all group ${selectedTable === tbl
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <Database className={`w-4 h-4 ${selectedTable === tbl ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'}`} />
                    <span>{tbl}</span>
                  </div>
                  {selectedTable === tbl && (
                    <ChevronRight className="w-4 h-4 text-blue-500" />
                  )}
                </button>
              ))}
              {filteredTables.length === 0 && !loading && (
                <div className="text-center py-8 text-gray-400 text-sm">
                  No tables found
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
              AD
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">Admin User</p>
              <p className="text-xs text-gray-500 truncate">System Administrator</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 justify-between flex-shrink-0 z-10">
          <div className="flex min-w-0 items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="flex h-11 w-11 items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Toggle admin sidebar"
              aria-expanded={isSidebarOpen}
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="min-w-0 truncate text-lg font-semibold text-gray-800">
              {selectedTable ? (
                <span className="flex items-center gap-2">
                  <span className="text-gray-400">Tables</span>
                  <span className="text-gray-300">/</span>
                  <span>{selectedTable}</span>
                </span>
              ) : 'Dashboard Overview'}
            </h2>
          </div>
          <div>
            {/* Header Actions if needed */}
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-gray-50 p-4 md:p-6">
          {selectedTable ? (
            <motion.div
              key={selectedTable}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-7xl mx-auto"
            >
              <DynamicAdminTable table={selectedTable} />
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto p-6">
              <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                <Database className="w-12 h-12 text-blue-500" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Admin Dashboard</h3>
              <p className="text-gray-500 mb-8">
                Select a database table from the sidebar to view, edit, and manage records.
                You can perform full CRUD operations on any table in the system.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default Admin;
