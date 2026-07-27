import React, { useEffect, useState, useMemo, useContext } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FiUsers,
  FiEdit2,
  FiArrowLeft,
  FiPlus,
  FiTrash2,
  FiX,
  FiSearch,
  FiCheck,
  FiMail,
  FiPhone,
  FiSave,
  FiBriefcase,
  FiCpu,
  FiUser,
  FiArrowRight
} from "react-icons/fi";
import {
  fetchDepartment,
  updateDepartment,
  getUsers,
  updateDepartmentMembers,
  deleteDepartment,
  normalizeCollectionResponse,
} from "../components/api";
import { AuthContext } from "../context/AuthContext";
import PageLoader from "../components/ui/PageLoader";

// Minimal Avatar component
const Avatar = ({ name, src, size = 'md', className = '' }) => {
  const sizeClasses = { sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base", xl: "w-16 h-16 text-lg" };
  const currentSizeClass = sizeClasses[size] || sizeClasses.md;

  if (src && src !== 'null') {
    return <img src={src} alt={name} className={`rounded-full object-cover ring-2 ring-white dark:ring-zinc-800 shadow-sm ${currentSizeClass} ${className}`} loading="lazy" />;
  }
  const initial = name ? name.charAt(0).toUpperCase() : "?";
  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500'];
  const colorIndex = name ? name.charCodeAt(0) % colors.length : 0;

  return (
    <div className={`rounded-full ${colors[colorIndex]} text-white flex items-center justify-center font-bold ring-2 ring-white dark:ring-zinc-800 shadow-sm ${currentSizeClass} ${className}`}>
      {initial}
    </div>
  );
};

const DepartmentDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [department, setDepartment] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Permissions
  const canManage = useMemo(() => {
    return user?.roles?.some(r => ['admin', 'owner'].includes(r.name));
  }, [user]);

  // Edit states
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState("");

  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [newDescription, setNewDescription] = useState("");

  const [isEditingManager, setIsEditingManager] = useState(false);
  const [newManagerId, setNewManagerId] = useState("");

  const [saving, setSaving] = useState(false);

  // Member management modal state
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [savingMembers, setSavingMembers] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [deptRes, usersRes] = await Promise.all([
        fetchDepartment(id),
        getUsers()
      ]);
      setDepartment(deptRes.data);
      setNewName(deptRes.data.name);
      setNewDescription(deptRes.data.description || "");
      setNewManagerId(deptRes.data.manager_id || "");
      setUsers(normalizeCollectionResponse(usersRes.data));
    } catch (error) {
      toast.error("Failed to load department details.");
      navigate("/departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleUpdate = async (field) => {
    if (!canManage) return;
    setSaving(true);
    let payload = {};
    if (field === 'name') {
      if (!newName.trim()) {
        toast.error("Department name cannot be empty.");
        setSaving(false);
        return;
      }
      payload = { name: newName };
    } else if (field === 'description') {
      payload = { description: newDescription };
    } else if (field === 'manager') {
      payload = { manager_id: newManagerId || null };
    }

    try {
      const res = await updateDepartment(id, payload);
      setDepartment((prev) => ({ ...prev, ...res.data }));
      if (field === 'name') setIsEditingName(false);
      if (field === 'description') setIsEditingDescription(false);
      if (field === 'manager') setIsEditingManager(false);
      toast.success("Department updated.");
    } catch (error) {
      toast.error("Failed to update department.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!canManage) return;
    if (!window.confirm("Are you sure? This will unassign all members.")) return;
    try {
      await deleteDepartment(id);
      toast.success("Department deleted.");
      navigate("/departments");
    } catch (error) {
      toast.error("Failed to delete department.");
    }
  };

  const openMemberModal = () => {
    if (!canManage) return;
    const currentMemberIds = department.members ? department.members.map(m => m.id) : [];
    setSelectedUserIds(currentMemberIds);
    setMemberModalOpen(true);
  };

  const toggleUserSelection = (userId) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(uid => uid !== userId) : [...prev, userId]
    );
  };

  const handleSaveMembers = async () => {
    if (!canManage) return;
    setSavingMembers(true);
    try {
      await updateDepartmentMembers(id, selectedUserIds);
      toast.success("Members updated.");
      setMemberModalOpen(false);
      loadData();
    } catch (error) {
      toast.error("Failed to update members.");
    } finally {
      setSavingMembers(false);
    }
  };

  const filteredUsersForModal = useMemo(() => {
    if (!memberModalOpen) return [];
    const term = memberSearch.toLowerCase();
    return users.filter(user => {
      const searchStr = `${user.first_name} ${user.last_name} ${user.email} ${user.department_name || ''}`.toLowerCase();
      return searchStr.includes(term);
    }).sort((a, b) => {
      const aSelected = selectedUserIds.includes(a.id) ? 0 : 1;
      const bSelected = selectedUserIds.includes(b.id) ? 0 : 1;
      if (aSelected !== bSelected) return aSelected - bSelected;
      return (a.first_name || '').localeCompare(b.first_name || '');
    });
  }, [users, memberSearch, selectedUserIds, memberModalOpen]);

  if (loading) return <PageLoader />;
  if (!department) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-900 pb-20">

      {/* Header */}
      <div className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link to="/departments" className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-500 transition">
              <FiArrowLeft className="text-xl" />
            </Link>

            <div className="min-w-0">
              {isEditingName && canManage ? (
                <div className="flex items-center gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg px-3 py-1 text-xl font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                    autoFocus
                  />
                  <button onClick={() => handleUpdate('name')} disabled={saving} className="p-2 rounded-lg bg-[var(--theme-color)] text-white hover:brightness-110"><FiSave /></button>
                  <button onClick={() => setIsEditingName(false)} className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-700 text-slate-500 hover:text-slate-700"><FiX /></button>
                </div>
              ) : (
                <div className="group flex min-w-0 items-center gap-3">
                  <h1 className="truncate text-2xl font-bold text-slate-900 dark:text-white">{department.name}</h1>
                  {canManage && (
                    <button onClick={() => setIsEditingName(true)} className="text-slate-400 hover:text-[var(--theme-color)] opacity-0 group-hover:opacity-100 transition-opacity p-1">
                      <FiEdit2 />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm text-slate-500 dark:text-slate-400">Department Overview</p>
            </div>
          </div>

          {canManage && (
            <button onClick={handleDelete} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 dark:bg-red-900/10 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/20 font-medium text-sm transition self-end md:self-auto">
              <FiTrash2 /> Delete Department
            </button>
          )}
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[2fr_1fr] lg:gap-8">

        {/* Left Column: Description & Members */}
        <div className="space-y-8">

          {/* Description Section */}
          <div className="group relative bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FiBriefcase className="text-[var(--theme-color)]" /> Mission & Goals
              </h3>
              {canManage && !isEditingDescription && (
                <button onClick={() => setIsEditingDescription(true)} className="text-slate-400 hover:text-[var(--theme-color)] opacity-0 group-hover:opacity-100 transition">
                  <FiEdit2 />
                </button>
              )}
            </div>

            {isEditingDescription && canManage ? (
              <div>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={4}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl p-4 text-sm focus:border-[var(--theme-color)] focus:ring-1 focus:ring-[var(--theme-color)] outline-none resize-none transition"
                  placeholder="What is this department responsible for?"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <button onClick={() => setIsEditingDescription(false)} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                  <button onClick={() => handleUpdate('description')} disabled={saving} className="bg-[var(--theme-color)] px-4 py-1.5 text-xs font-medium text-white hover:brightness-110 rounded-lg">Save Changes</button>
                </div>
              </div>
            ) : (
              <p className="text-slate-600 dark:text-slate-300 whitespace-pre-wrap text-sm leading-relaxed">
                {department.description || <span className="text-slate-400 italic">No description provided yet.</span>}
              </p>
            )}
          </div>

          {/* Members Section */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <FiUsers className="text-[var(--theme-color)]" /> Team Members <span className="bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-slate-400 text-xs px-2 py-0.5 rounded-full">{department.members?.length || 0}</span>
              </h3>
              {canManage && (
                <button onClick={openMemberModal} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium hover:opacity-90 transition shadow-sm">
                  <FiPlus /> Add Member
                </button>
              )}
            </div>

            {!department.members || department.members.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/50 py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                  <FiUsers className="text-xl text-slate-400" />
                </div>
                <h3 className="text-base font-medium text-slate-900 dark:text-white">No members yet</h3>
                <p className="text-xs text-slate-500 mt-1">Departments need people to bring them to life.</p>
                {canManage && (
                  <button onClick={openMemberModal} className="mt-3 text-sm font-medium text-[var(--theme-color)] hover:underline">Add First Member</button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {department.members.map(member => (
                  <div key={member.id} className="group relative flex items-center gap-4 rounded-xl border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/30 p-3 hover:bg-white dark:hover:bg-zinc-800 hover:shadow-md hover:border-slate-200 dark:hover:border-zinc-600 transition-all">
                    <Link to={`/profile/${member.id}`} className="shrink-0">
                      <Avatar name={member.full_name} src={member.profile_picture_url} size="md" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/profile/${member.id}`} className="block truncate font-medium text-slate-900 dark:text-white hover:text-[var(--theme-color)] transition-colors">
                        {member.full_name || "Unknown User"}
                      </Link>
                      <p className="truncate text-xs text-slate-500">{member.job_title || "Team Member"}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-400">
                        {member.email && <a href={`mailto:${member.email}`} className="hover:text-[var(--theme-color)] transition-colors"><FiMail /></a>}
                        {member.phone && <a href={`tel:${member.phone}`} className="hover:text-[var(--theme-color)] transition-colors"><FiPhone /></a>}
                      </div>
                    </div>

                    {canManage && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Remove ${member.full_name} from this department?`)) {
                            const newIds = (department.members || []).map(m => m.id).filter(id => id !== member.id);
                            updateDepartmentMembers(id, newIds).then(() => {
                              toast.success("Member removed");
                              loadData();
                            });
                          }
                        }}
                        className="absolute right-3 top-3 hidden p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 group-hover:block transition"
                        title="Remove from department"
                      >
                        <FiX />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Key Details */}
        <div className="space-y-6">

          {/* Lead Card */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-700 p-6 shadow-sm group relative">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Department Lead</h3>
              {canManage && !isEditingManager && (
                <button onClick={() => setIsEditingManager(true)} className="text-slate-400 hover:text-[var(--theme-color)] opacity-0 group-hover:opacity-100 transition">
                  <FiEdit2 />
                </button>
              )}
            </div>

            {isEditingManager && canManage ? (
              <div className="space-y-3">
                <select
                  value={newManagerId}
                  onChange={(e) => setNewManagerId(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[var(--theme-color)]"
                >
                  <option value="" className="text-slate-900">No Lead Assigned</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id} className="text-slate-900">{u.full_name}</option>
                  ))}
                </select>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsEditingManager(false)} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                  <button onClick={() => handleUpdate('manager')} disabled={saving} className="bg-[var(--theme-color)] px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 rounded-lg">Save</button>
                </div>
              </div>
            ) : department.manager ? (
              <div className="flex items-center gap-4">
                <Link to={`/profile/${department.manager.id}`}>
                  <Avatar name={department.manager.full_name} src={department.manager.profile_picture_url} size="lg" />
                </Link>
                <div>
                  <Link to={`/profile/${department.manager.id}`} className="font-semibold text-slate-900 dark:text-white hover:text-[var(--theme-color)] transition-colors block">
                    {department.manager.full_name}
                  </Link>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{department.manager.job_title || "Project Manager"}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 border border-dashed border-slate-200 dark:border-zinc-700 rounded-xl bg-slate-50 dark:bg-zinc-800/50">
                <p className="text-sm text-slate-500 dark:text-slate-400">No lead assigned</p>
                {canManage && (
                  <button onClick={() => setIsEditingManager(true)} className="mt-2 text-xs font-bold text-[var(--theme-color)] hover:underline">Assign Lead</button>
                )}
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="bg-gradient-to-br from-[var(--theme-color)] to-[var(--theme-color-dark)] rounded-2xl p-6 text-white shadow-lg overflow-hidden relative">
            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
                <FiCpu className="text-xl" />
              </div>
              <h3 className="font-semibold tracking-wide">Quick Stats</h3>
            </div>

            <div className="grid grid-cols-1 gap-4 relative z-10">
              <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm border border-white/10">
                <p className="text-[var(--theme-color-light)] text-xs font-medium uppercase tracking-wider mb-1">Members</p>
                <p className="text-3xl font-bold">{department.users_count || 0}</p>
              </div>
            </div>

            {/* Decorative background element */}
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
          </div>

        </div>
      </div>

      {/* Member Management Modal */}
      {memberModalOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMemberModalOpen(false)} />
          <div className="relative flex flex-col w-full max-w-2xl max-h-[85vh] bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden">

            <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 px-6 py-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Manage Members</h3>
              <button onClick={() => setMemberModalOpen(false)} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-600 transition"><FiX /></button>
            </div>

            <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-800/50 border-b border-slate-100 dark:border-zinc-800">
              <div className="relative">
                <FiSearch className="absolute left-3 top-3 text-slate-400" />
                <input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search users..."
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 py-2.5 pl-10 pr-4 outline-none focus:ring-2 focus:ring-[var(--theme-color)] transition"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-2">
              <div className="space-y-1">
                {filteredUsersForModal.map(user => {
                  const isSelected = selectedUserIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => toggleUserSelection(user.id)}
                      className={`group flex cursor-pointer items-center justify-between rounded-xl p-3 transition border ${isSelected ? "bg-[var(--theme-color-light)]/10 border-[var(--theme-color)]" : "border-transparent hover:bg-slate-50 dark:hover:bg-zinc-800"}`}
                    >
                      <div className="flex items-center gap-4">
                        <Avatar name={user.full_name} size="md" />
                        <div>
                          <p className={`text-sm font-semibold transition-colors ${isSelected ? "text-[var(--theme-color)]" : "text-slate-900 dark:text-white"}`}>{user.full_name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                          {user.department_id && user.department_id !== parseInt(id) && (
                            <p className="flex items-center gap-1 text-[10px] text-amber-600 font-medium mt-0.5">
                              In {user.department_name} <FiArrowRight className="text-[10px]" /> Move here
                            </p>
                          )}
                        </div>
                      </div>
                      <div className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "border-[var(--theme-color)] bg-[var(--theme-color)] text-white" : "border-slate-300 dark:border-zinc-600 group-hover:border-[var(--theme-color)]"}`}>
                        {isSelected && <FiCheck className="text-sm" />}
                      </div>
                    </div>
                  );
                })}
                {filteredUsersForModal.length === 0 && (
                  <p className="text-center text-slate-500 py-8 italic">No users found matching "{memberSearch}"</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-zinc-900">
              <button onClick={() => setMemberModalOpen(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-zinc-800 transition">Cancel</button>
              <button onClick={handleSaveMembers} disabled={savingMembers} className="rounded-lg bg-[var(--theme-color)] px-6 py-2 text-sm font-medium text-white hover:brightness-110 shadow-lg shadow-[var(--theme-color)]/20 disabled:opacity-70 transition">
                {savingMembers ? "Saving..." : `Update Members (${selectedUserIds.length})`}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DepartmentDetails;
