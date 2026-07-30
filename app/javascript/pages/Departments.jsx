import React, { useEffect, useState, useContext, useMemo } from 'react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FiUsers,
  FiPlus,
  FiSearch,
  FiSettings,
  FiTrash2,
  FiEdit2,
  FiInfo,
  FiMoreVertical,
  FiBriefcase,
  FiArrowRight,
  FiGrid,
  FiList
} from 'react-icons/fi';
import {
  fetchDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  getUsers,
  normalizeCollectionResponse
} from '../components/api';
import { AuthContext } from '../context/AuthContext';
import PageLoader from '../components/ui/PageLoader';

// --- Improved UI Components (Copied/Adapted from Projects.jsx) ---

const Avatar = ({ name, src, size = 'md', className = '' }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const sizeClasses = {
    sm: "w-7 h-7 text-xs",
    md: "w-9 h-9 text-sm",
    lg: "w-11 h-11 text-base",
    xl: "w-14 h-14 text-lg",
  };
  const currentSizeClass = sizeClasses[size] || sizeClasses.md;

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (src && src !== 'null' && !imageFailed) {
    return (
      <img
        src={src}
        alt={`${name}'s avatar`}
        className={`rounded-full object-cover ring-2 ring-white dark:ring-zinc-800 shadow-sm ${currentSizeClass} ${className}`}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  // Deterministic color based on name
  const colors = [
    'bg-gradient-to-br from-violet-400 to-violet-600',
    'bg-gradient-to-br from-blue-400 to-blue-600',
    'bg-gradient-to-br from-emerald-400 to-emerald-600',
    'bg-gradient-to-br from-amber-400 to-amber-600',
    'bg-gradient-to-br from-rose-400 to-rose-600',
  ];
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;

  return (
    <div className={`rounded-full ${colors[colorIndex]} text-white flex items-center justify-center font-bold ring-2 ring-white dark:ring-zinc-800 shadow-sm ${currentSizeClass} ${className}`}>
      {initial}
    </div>
  );
};

const AvatarStack = ({ members, max = 4, size = 'sm' }) => {
  const visible = members.slice(0, max);
  const remaining = members.length - max;
  return (
    <div className="flex items-center -space-x-2">
      {visible.map((member, i) => (
        <div key={member.id || i} className="relative z-0 hover:z-10 transition-transform hover:scale-105">
          <Avatar name={member.full_name} src={member.profile_picture_url} size={size} />
        </div>
      ))}
      {remaining > 0 && (
        <div className={`w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-medium ring-2 ring-white`}>
          +{remaining}
        </div>
      )}
    </div>
  );
};

const Departments = () => {
  const { user } = useContext(AuthContext);
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]); // Needed for total/unassigned
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'

  // Permissions
  const canManage = useMemo(() => {
    return user?.roles?.some(r => ['admin', 'owner'].includes(r.name));
  }, [user]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [deptRes, usersRes] = await Promise.all([fetchDepartments(), getUsers()]);
      setDepartments(normalizeCollectionResponse(deptRes.data));
      setUsers(normalizeCollectionResponse(usersRes.data));
    } catch (error) {
      toast.error("Failed to load departments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredDepartments = useMemo(() => {
    const term = search.toLowerCase();
    return departments.filter(d =>
      d.name.toLowerCase().includes(term) ||
      (d.description && d.description.toLowerCase().includes(term))
    );
  }, [departments, search]);

  const unassignedCount = useMemo(() => users.filter(u => !u.department_id).length, [users]);

  // Handlers
  const handleOpenModal = (dept = null) => {
    if (dept) {
      setEditingDepartment(dept);
      setFormName(dept.name);
      setFormDesc(dept.description || "");
    } else {
      setEditingDepartment(null);
      setFormName("");
      setFormDesc("");
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingDepartment(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formName.trim()) return toast.error("Name is required");

    setIsSaving(true);
    try {
      const payload = { name: formName, description: formDesc };
      if (editingDepartment) {
        await updateDepartment(editingDepartment.id, payload);
        toast.success("Department updated");
      } else {
        await createDepartment(payload);
        toast.success("Department created");
      }
      handleCloseModal();
      loadData();
    } catch (error) {
      toast.error("Failed to save department");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete ${name}? Members will be unassigned.`)) return;
    try {
      await deleteDepartment(id);
      toast.success("Department deleted");
      loadData();
    } catch (error) {
      toast.error("Failed to delete department");
    }
  };

  if (loading) return <PageLoader />;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-900 pb-20">
      {/* Header Section similar to Projects */}
      <div className="border-b border-slate-200 bg-white px-4 py-6 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6 sm:py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Departments</h1>
            <p className="mt-1 text-slate-500 dark:text-slate-400">Manage your organization's structure and teams.</p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
            <div className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-800 sm:w-auto">
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase font-semibold">Total</p>
                <p className="text-lg font-bold text-slate-800 dark:text-white">{departments.length}</p>
              </div>
              <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700"></div>
              <div className="text-center">
                <p className="text-xs text-slate-500 uppercase font-semibold">Members</p>
                <p className="text-lg font-bold text-slate-800 dark:text-white">{users.length}</p>
              </div>
              <div className="w-px h-8 bg-slate-200 dark:bg-zinc-700"></div>
              <div className="text-center">
                <p className="text-xs text-amber-500 uppercase font-semibold">Unassigned</p>
                <p className="text-lg font-bold text-amber-600">{unassignedCount}</p>
              </div>
            </div>

            {canManage && (
              <button
                onClick={() => handleOpenModal()}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--theme-color)] px-4 py-2.5 font-medium text-white shadow-sm transition hover:brightness-110 sm:w-auto"
              >
                <FiPlus /> New Department
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="relative w-full flex-1 sm:max-w-md">
            <FiSearch className="absolute left-3 top-3 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search departments..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 focus:ring-2 focus:ring-[var(--theme-color)] outline-none transition"
            />
          </div>
          <div className="flex w-full items-center rounded-lg border border-slate-200 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-800 sm:w-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-md p-2 transition sm:flex-none ${viewMode === 'grid' ? 'bg-slate-100 dark:bg-zinc-700 text-[var(--theme-color)]' : 'text-slate-400 hover:text-slate-600'}`}
              aria-label="Show department grid"
            >
              <FiGrid />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-md p-2 transition sm:flex-none ${viewMode === 'list' ? 'bg-slate-100 dark:bg-zinc-700 text-[var(--theme-color)]' : 'text-slate-400 hover:text-slate-600'}`}
              aria-label="Show department list"
            >
              <FiList />
            </button>
          </div>
        </div>

        {filteredDepartments.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-zinc-800 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-700">
            <div className="w-16 h-16 bg-slate-50 dark:bg-zinc-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <FiBriefcase className="text-2xl text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">No departments found</h3>
            <p className="text-slate-500 mt-1">Try adjusting your search or add a new department.</p>
            {canManage && (
              <button onClick={() => handleOpenModal()} className="mt-4 text-[var(--theme-color)] font-medium hover:underline">
                Create Department
              </button>
            )}
          </div>
        ) : (
          <div className={viewMode === 'grid' ? "grid gap-6 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-4"}>
            {filteredDepartments.map(dept => (
              <DepartmentCard
                key={dept.id}
                department={dept}
                viewMode={viewMode}
                canManage={canManage}
                onEdit={() => handleOpenModal(dept)}
                onDelete={() => handleDelete(dept.id, dept.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={handleCloseModal}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex justify-between items-center">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {editingDepartment ? 'Edit Department' : 'Create Department'}
                </h3>
                <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600"><FiTrash2 className="rotate-45" /></button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-[var(--theme-color)] dark:bg-zinc-800"
                    placeholder="Engineering, Marketing, etc."
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
                  <textarea
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-zinc-700 rounded-lg outline-none focus:ring-2 focus:ring-[var(--theme-color)] dark:bg-zinc-800 resize-none"
                    placeholder="Briefly describe what this department does..."
                  />
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button type="button" onClick={handleCloseModal} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                  <button
                    disabled={isSaving}
                    className="px-6 py-2 bg-[var(--theme-color)] text-white rounded-lg hover:brightness-110 disabled:opacity-70 font-medium"
                  >
                    {isSaving ? 'Saving...' : 'Save Department'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const DepartmentCard = ({ department, viewMode, canManage, onEdit, onDelete }) => {
  // If we have members_preview from backend, use it. Otherwise empty.
  const members = department.members_preview || [];

  if (viewMode === 'list') {
    return (
      <div className="group flex items-center justify-between p-4 bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl hover:shadow-md transition">
        <div className="flex items-center gap-4 flex-1">
          <div className="h-10 w-10 rounded-lg bg-[var(--theme-color-light)] flex items-center justify-center text-[var(--theme-color)]">
            <FiBriefcase className="text-xl" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white">{department.name}</h3>
            <p className="text-sm text-slate-500 line-clamp-1">{department.description || "No description"}</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden sm:block text-right">
            <p className="text-xs text-slate-400 uppercase">Members</p>
            <p className="font-medium text-slate-700 dark:text-slate-300">{department.users_count || 0}</p>
          </div>

          {department.manager ? (
            <div className="hidden md:flex items-center gap-2">
              <Avatar name={department.manager.full_name} src={department.manager.profile_picture_url} size="sm" />
              <div className="text-xs">
                <p className="font-medium text-slate-700 dark:text-slate-300">{department.manager.full_name}</p>
                <p className="text-slate-400">Lead</p>
              </div>
            </div>
          ) : (
            <div className="hidden md:block text-xs text-slate-400 italic">No Lead</div>
          )}

          <div className="flex items-center gap-2">
            <Link to={`/departments/${department.id}`} className="p-2 text-slate-400 hover:text-[var(--theme-color)] hover:bg-slate-50 rounded-lg transition">
              <FiArrowRight />
            </Link>
            {canManage && (
              <div className="relative group/menu">
                <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg">
                  <FiMoreVertical />
                </button>
                <div className="absolute right-0 top-8 w-32 bg-white dark:bg-zinc-800 shadow-xl border border-slate-100 dark:border-zinc-700 rounded-lg overflow-hidden invisible group-hover/menu:visible z-10">
                  <button onClick={onEdit} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-zinc-700 flex items-center gap-2">
                    <FiEdit2 className="w-3 h-3" /> Edit
                  </button>
                  <button onClick={onDelete} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-slate-50 dark:hover:bg-zinc-700 flex items-center gap-2">
                    <FiTrash2 className="w-3 h-3" /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl p-6 hover:shadow-lg hover:-translate-y-1 transition-all duration-200">
      <div className="flex justify-between items-start mb-4">
        <div className="h-12 w-12 rounded-xl bg-[var(--theme-color-light)]/20 flex items-center justify-center text-[var(--theme-color)]">
          <FiBriefcase className="text-2xl" />
        </div>
        {canManage && (
          <div className="relative group/menu">
            <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg">
              <FiMoreVertical />
            </button>
            <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-zinc-800 shadow-xl border border-slate-100 dark:border-zinc-700 rounded-lg overflow-hidden invisible group-hover/menu:visible z-10 transition-all opacity-0 group-hover/menu:opacity-100">
              <button onClick={onEdit} className="w-full text-left px-4 py-2 text-sm hover:bg-slate-50 dark:hover:bg-zinc-700 flex items-center gap-2">
                <FiEdit2 className="w-3 h-3" /> Edit
              </button>
              <button onClick={onDelete} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2">
                <FiTrash2 className="w-3 h-3" /> Delete
              </button>
            </div>
          </div>
        )}
      </div>

      <Link to={`/departments/${department.id}`} className="block mb-4">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-[var(--theme-color)] transition-colors">
          {department.name}
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2 min-h-[2.5em]">
          {department.description || "No description provided."}
        </p>
      </Link>

      <div className="mt-auto pt-4 border-t border-slate-100 dark:border-zinc-700 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 uppercase mb-1 font-semibold">Team</p>
          {members.length > 0 ? (
            <AvatarStack members={members} max={3} />
          ) : (
            <p className="text-xs text-slate-400 italic">No members</p>
          )}
        </div>

        {department.manager && (
          <div className="text-right">
            <p className="text-xs text-slate-400 uppercase mb-1 font-semibold">Lead</p>
            <Link to={`/profile/${department.manager.id}`} className="block">
              <Avatar name={department.manager.full_name} src={department.manager.profile_picture_url} size="sm" className="ml-auto" />
            </Link>
          </div>
        )}
      </div>

      <Link
        to={`/departments/${department.id}`}
        className="absolute inset-0 z-0"
        aria-label={`View ${department.name}`}
      />
      {/* Interactions handled by z-10 elements */}
    </div>
  );
};

export default Departments;
