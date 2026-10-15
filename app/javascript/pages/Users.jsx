import { hasWorkspacePermission } from "../utils/workspaceAccess";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { toast } from "react-hot-toast";
import { 
  Search, Edit2, Trash2, X, Upload, PencilLine,
  Mail, Calendar, Users as UsersIcon, UserPlus
} from "lucide-react";
import {
  getUsers,
  updateUser,
  fetchTeams,
  fetchProjects,
  fetchRoles,
  fetchDepartments,
  updatePresence,
} from "../components/api";
import { subscribeToPresence } from "../lib/chatCable";
import WorkspaceInviteDialog from "../components/WorkspaceInviteDialog";
import WorkspaceInvitationsPanel from "../components/WorkspaceInvitationsPanel";
import WorkspaceOffboardingDialog from "../components/WorkspaceOffboardingDialog";
import UserEditorDialog from "../components/UserEditorDialog";
import MemberContactActions from "../components/ui/MemberContactActions";
import { buildAvatarStyle, generateAvatarColor, getAvatarInitial, normalizeAvatarColor } from "../utils/avatar";

const UserProfileAvatar = ({ user }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email || "User";
  const hasValidImage = user.profile_picture && user.profile_picture !== "null" && !imageFailed;

  useEffect(() => {
    setImageFailed(false);
  }, [user.profile_picture]);

  if (hasValidImage) {
    return (
      <img
        src={user.profile_picture}
        alt={`${displayName}'s avatar`}
        className="w-20 h-20 rounded-2xl object-cover border-4 border-white shadow-md bg-white"
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      className="flex w-20 h-20 items-center justify-center rounded-2xl border-4 border-white text-2xl font-bold shadow-md"
      style={buildAvatarStyle(normalizeAvatarColor(user.avatar_color, generateAvatarColor(user.id || displayName)))}
      aria-label={`${displayName}'s initials`}
    >
      {getAvatarInitial(displayName)}
    </div>
  );
};

const Users = () => {
  const { user: currentUser, setUser } = React.useContext(AuthContext);
  // --- State Management ---
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoModalUser, setPhotoModalUser] = useState(null);
  const [photoForm, setPhotoForm] = useState({
    profile_picture: null,
    cover_photo: null,
  });
  
  // Data Lists
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [roles, setRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [invitationRevision, setInvitationRevision] = useState(0);
  const [inviteEmail, setInviteEmail] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    first_name: "", last_name: "", email: "",
    date_of_birth: "", profile_picture: null,
    cover_photo: null, roles: [], membership_status: "active", department_id: "",
    job_title: "", phone_number: "", bio: "", landing_page: ""
  });

  // Modal State
  const [offboardingOpen, setOffboardingOpen] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const [offboardingUser, setOffboardingUser] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 8;

  const canCreateUsers = hasWorkspacePermission(currentUser, "invitations.manage");
  const canEditUsers = hasWorkspacePermission(currentUser, "users.manage");

  // --- Helpers ---
  const formatRole = (role) =>
    role.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");

  // --- API Calls ---
  const fetchData = async () => {
    setLoading(true);
    try {
      const rolesRequest = canCreateUsers ? fetchRoles() : Promise.resolve({ data: [] });
      const [uData, tData, pData, rData, dData] = await Promise.all([
        getUsers(), fetchTeams(), fetchProjects(), rolesRequest, fetchDepartments()
      ]);
      
      setUsers(Array.isArray(uData.data) ? uData.data : []);
      setTeams(Array.isArray(tData.data) ? tData.data : []);
      setProjects(Array.isArray(pData.data) ? pData.data : []);
      setRoles(Array.isArray(rData.data) ? rData.data : []);
      setDepartments(Array.isArray(dData.data) ? dData.data : []);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [canCreateUsers]);

  useEffect(() => {
    updatePresence().catch(() => {});
    const timer = setInterval(() => updatePresence().catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const subscription = subscribeToPresence((payload) => {
      if (!payload?.user_id) return;
      setUsers((prev) => prev.map((item) => item.id === payload.user_id ? { ...item, online: !!payload.online, last_seen_at: payload.last_seen_at } : item));
    });

    return () => subscription.unsubscribe();
  }, []);

  // --- Handlers ---
  const handleEdit = (user) => {
    setEditingId(user.id);
    setFormData({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      date_of_birth: user.date_of_birth || "",
      department_id: user.department_id || "",
      profile_picture: null,
      cover_photo: null,
      roles: user.roles || [],
      membership_status: user.workspace_membership?.status || "active",
      job_title: user.job_title || "",
      phone_number: user.phone_number || "",
      bio: user.bio || "",
      landing_page: user.landing_page || "profile",
    });
  };

  const closeEditModal = () => {
    setEditingId(null);
    setFormData({
      first_name: "", last_name: "", email: "",
      date_of_birth: "", profile_picture: null,
      cover_photo: null, roles: [], membership_status: "active", department_id: "",
      job_title: "", phone_number: "", bio: "", landing_page: ""
    });
  };

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: files ? files[0] : value,
    }));
  };

  const handleRoleChange = (role) => {
    setFormData((prev) => {
      const newRoles = prev.roles.includes(role)
        ? prev.roles.filter((r) => r !== role)
        : [...prev.roles, role];
      return { ...prev, roles: newRoles };
    });
  };

  const closeCreateModal = () => setCreateModalOpen(false);

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingId) return;
    setIsUpdatingUser(true);
    try {
      const data = new FormData();
      // Append fields (simplified for brevity)
      Object.keys(formData).forEach(key => {
        if (key === 'roles') {
          (formData.roles.length ? formData.roles : ["member"]).forEach(r => data.append("user[role_names][]", r));
        } else if (key === 'profile_picture' || key === 'cover_photo') {
          if (formData[key]) data.append(`user[${key}]`, formData[key]);
        } else {
          data.append(`user[${key}]`, formData[key]);
        }
      });
      
      const { data: updated } = await updateUser(editingId, data);
      const editingSelf = updated?.id === currentUser?.id;
      if (editingSelf && setUser) {
        setUser((current) => updated.workspace_membership?.status === "suspended" ? null : {
          ...current, ...updated, roles: (updated.roles || []).map((name) => ({ name })),
        });
      }
      toast.success("User updated successfully.");
      setEditingId(null);
      if (!editingSelf || updated.workspace_membership?.status !== "suspended") fetchData();
    } catch (error) {
      console.error("Update failed", error);
      toast.error(error.response?.data?.errors?.join(', ') || 'Unable to update user.');
    } finally {
      setIsUpdatingUser(false);
    }
  };

  const beginOffboarding = (user) => {
    setOffboardingUser(user);
    setOffboardingOpen(true);
  };

  const openPhotoModal = (user) => {
    setPhotoModalUser(user);
    setPhotoForm({
      profile_picture: null,
      cover_photo: null,
    });
    setPhotoModalOpen(true);
  };

  const closePhotoModal = () => {
    setPhotoModalOpen(false);
    setPhotoModalUser(null);
    setPhotoForm({ profile_picture: null, cover_photo: null });
  };

  const handlePhotoChange = (e) => {
    const { name, files } = e.target;
    setPhotoForm((prev) => ({
      ...prev,
      [name]: files ? files[0] : null,
    }));
  };

  const handlePhotoUpdate = async (e) => {
    e.preventDefault();
    if (!photoModalUser) return;

    const data = new FormData();
    if (photoForm.profile_picture) {
      data.append("user[profile_picture]", photoForm.profile_picture);
    }
    if (photoForm.cover_photo) {
      data.append("user[cover_photo]", photoForm.cover_photo);
    }

    if (!photoForm.profile_picture && !photoForm.cover_photo) {
      closePhotoModal();
      return;
    }

    try {
      await updateUser(photoModalUser.id, data);
      await fetchData();
      closePhotoModal();
    } catch (error) {
      console.error("Photo update failed", error);
    }
  };


  const filteredUsers = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / usersPerPage));
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * usersPerPage,
    currentPage * usersPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // --- Render Helpers ---
  const UserCard = ({ user }) => {
    const userTeams = teams.filter(t => t.users?.some(u => u.id === user.id));
    
    // Default gradients for cover if none exists
    const gradients = [
      "from-blue-400 to-indigo-500",
      "from-emerald-400 to-teal-500",
      "from-orange-400 to-pink-500",
      "from-purple-400 to-indigo-500"
    ];
    const randomGradient = gradients[user.id % gradients.length];

    return (
      <div className="group bg-white rounded-2xl shadow-sm hover:shadow-xl border border-gray-100 overflow-hidden transition-all duration-300 flex flex-col h-full relative">
        {/* Banner */}
        <div className={`h-24 w-full bg-gradient-to-r ${randomGradient} relative`}>
            {user.cover_photo && (
                <img src={user.cover_photo} alt="cover" className="w-full h-full object-cover opacity-80" loading="lazy" />
            )}
            {canEditUsers && (
              <button
                type="button"
                onClick={() => openPhotoModal(user)}
                className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/70 text-gray-700 px-2.5 py-1 text-xs font-semibold shadow-sm transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <PencilLine size={14} />
                <span>Edit photos</span>
              </button>
            )}
        </div>

        {/* Profile Pic & Header */}
        <div className="px-6 relative flex-grow">
          <div className="absolute -top-10 left-6">
            <div className="relative">
              <UserProfileAvatar user={user} />
              <span className={`absolute bottom-0 right-0 w-4 h-4 border-2 border-white rounded-full ${user.online ? "bg-green-400" : "bg-gray-300"}`} title={user.online ? "Online" : "Offline"}></span>
            </div>
          </div>

          <div className="mt-12 mb-4">
             <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 leading-tight">
                    {user.first_name} {user.last_name}
                    </h2>
                    <p className="text-indigo-600 font-medium text-sm mb-2">{user.department_name || "Unassigned Dept"}</p>
                </div>
             </div>
            
            {/* Meta Data */}
            <div className="space-y-2 mt-3 text-sm text-gray-500">
                <div className="flex items-center gap-2">
                    <Mail size={14} className="text-gray-400" />
                    <span className="truncate">{user.email}</span>
                </div>
                {user.date_of_birth && (
                    <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span>{new Date(user.date_of_birth).toLocaleDateString()}</span>
                    </div>
                )}
                 {userTeams.length > 0 && (
                    <div className="flex items-start gap-2">
                        <UsersIcon size={14} className="text-gray-400 mt-1" />
                        <span className="flex-1 truncate">{userTeams.map(t => t.name).join(", ")}</span>
                    </div>
                )}
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mt-4">
              {user.workspace_membership?.offboarded_at && canCreateUsers && <button type="button" className="text-xs font-semibold text-emerald-700" onClick={() => { setInviteEmail(user.email); setCreateModalOpen(true); }}>Reinvite</button>}
              {user.workspace_membership?.status === "suspended" && <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">Access suspended</span>}
              {user.roles?.map((role) => (
                <span key={role} className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-md border border-indigo-100">
                  {formatRole(role)}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex flex-wrap gap-3 justify-between items-center opacity-80 group-hover:opacity-100 transition-opacity">
            <div className="flex items-center gap-3">
              <Link
                to={`/profile/${user.id}`}
                className="text-[var(--theme-color)] hover:text-indigo-700 font-medium text-sm"
              >
                View profile
              </Link>
              {currentUser?.id !== user.id && <MemberContactActions userId={user.id} />}
            </div>
            {canEditUsers ? (
              <div className="flex items-center gap-4">
                <button 
                    onClick={() => handleEdit(user)}
                    className="text-gray-600 hover:text-indigo-600 font-medium text-sm flex items-center gap-2 transition-colors"
                >
                    <Edit2 size={16} /> Edit
                </button>
                <button 
                    onClick={() => beginOffboarding(user)}
                    className="text-gray-400 hover:text-red-600 font-medium text-sm flex items-center gap-2 transition-colors"
                >
                    <Trash2 size={16} /> Offboard
                </button>
              </div>
            ) : null}
        </div>
      </div>
    );
  };

  // --- Main UI ---
  return (
    <div className="min-h-screen bg-slate-50 text-gray-800 font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
          <div className="text-center md:text-left">
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
              Team Directory
            </h1>
            <p className="text-slate-500 mt-1 text-lg">Manage your team members, roles, and assignments.</p>
          </div>

          <div className="w-full md:w-auto flex flex-col md:flex-row items-stretch md:items-center gap-3">
            {canCreateUsers && (
              <button
                type="button"
                onClick={() => setCreateModalOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                <UserPlus size={16} />
                Invite teammate
              </button>
            )}

            {/* Search Bar */}
            <div className="relative w-full md:w-96 group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
              </div>
              <input
                type="text"
                placeholder="Search people..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl leading-5 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-sm transition-all"
              />
            </div>
          </div>
        </div>

        {/* Content Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-white rounded-2xl h-80 shadow-sm animate-pulse border border-gray-100"></div>
            ))}
          </div>
        ) : (
            <>
                {filteredUsers.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="inline-flex justify-center items-center w-20 h-20 rounded-full bg-slate-100 mb-4">
                            <Search className="text-slate-400" size={32} />
                        </div>
                        <h3 className="text-lg font-medium text-slate-900">No users found</h3>
                        <p className="text-slate-500">Try adjusting your search terms.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pb-20">
                        {paginatedUsers.map((user) => (
                        <UserCard key={user.id} user={user} />
                        ))}
                    </div>
                )}
            </>
        )}

        {!loading && filteredUsers.length > 0 && (
          <div className="mt-4 flex flex-col items-center gap-3 pb-10">
            <p className="text-sm text-slate-500">
              Showing {(currentPage - 1) * usersPerPage + 1} to {Math.min(currentPage * usersPerPage, filteredUsers.length)} of {filteredUsers.length} users
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Previous
              </button>
              {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={`h-9 w-9 rounded-lg text-sm font-medium border transition-colors ${
                    page === currentPage
                      ? "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-gray-700 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {canCreateUsers && <WorkspaceInvitationsPanel revision={invitationRevision} />}
      {createModalOpen && <WorkspaceInviteDialog initialEmail={inviteEmail} roles={roles} departments={departments} projects={projects} onClose={() => { closeCreateModal(); setInviteEmail(""); }} onCreated={(invitation) => { toast.success(invitation.delivery_status === "failed" ? "Invitation created. Email delivery failed; use Resend to retry." : "Invitation created. Email delivery is queued."); closeCreateModal(); setInviteEmail(""); setInvitationRevision((value) => value + 1); }} />}

      {/* Photo Update Modal */}
      {photoModalOpen && photoModalUser && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-6 backdrop-blur-sm sm:items-center sm:pt-4">
          <form
            onSubmit={handlePhotoUpdate}
            encType="multipart/form-data"
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 relative"
          >
            <button
              type="button"
              onClick={closePhotoModal}
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <PencilLine size={18} />
              </div>
              <div>
                <p className="text-xs uppercase text-gray-500 font-semibold tracking-wide">
                  Update Photos
                </p>
                <h3 className="text-lg font-bold text-gray-900">
                  {photoModalUser.first_name} {photoModalUser.last_name}
                </h3>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block border border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-300 transition-colors">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Upload size={16} className="text-indigo-600" />
                  Profile Picture
                </span>
                <input
                  type="file"
                  name="profile_picture"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="mt-2 block w-full text-xs text-gray-600"
                />
              </label>

              <label className="block border border-dashed border-gray-200 rounded-xl p-4 cursor-pointer hover:border-indigo-300 transition-colors">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <Upload size={16} className="text-indigo-600" />
                  Background Photo
                </span>
                <input
                  type="file"
                  name="cover_photo"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="mt-2 block w-full text-xs text-gray-600"
                />
              </label>
            </div>

            <div className="mt-5 flex gap-3 justify-end">
              <button
                type="button"
                onClick={closePhotoModal}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-colors"
              >
                Save changes
              </button>
            </div>
          </form>
        </div>
      )}

      {editingId && <UserEditorDialog offboarded={users.find((item) => item.id === editingId)?.workspace_membership?.offboarded_at} mode="edit" value={formData} roles={roles} departments={departments} onChange={handleChange} onRoleToggle={handleRoleChange} onClose={closeEditModal} onSubmit={handleUpdate} busy={isUpdatingUser} />}

      {offboardingOpen && offboardingUser && <WorkspaceOffboardingDialog user={offboardingUser} onClose={() => setOffboardingOpen(false)} onOffboarded={(receipt) => { toast.success(receipt.cleanup_status === "failed" ? "Access removed. Call cleanup failed; retry offboarding." : receipt.cleanup_status === "pending" ? "Workspace access removed. Call cleanup is queued." : "Employee offboarded. Company records retained."); setOffboardingOpen(false); setOffboardingUser(null); setInvitationRevision((value) => value + 1); if (offboardingUser.id === currentUser.id) setUser(null); else fetchData(); }} />}

    </div>
  );
};

export default Users;
