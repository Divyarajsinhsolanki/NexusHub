import React, { useEffect, useState, useContext, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
    fetchTeams,
    createTeam,
    updateTeam,
    deleteTeam,
    addTeamUser,
    updateTeamUser,
    deleteTeamUser,
    leaveTeam,
    fetchTeamInsights,
    createUserSkill,
    updateUserSkill,
    deleteUserSkill,
    endorseSkill,
    revokeSkillEndorsement,
    createLearningGoal,
    deleteLearningGoal,
    createLearningCheckpoint,
    updateLearningCheckpoint,
} from "../components/api";
import UserMultiSelect from "../components/UserMultiSelect";
import TeamSkillMatrix from "../components/teams/TeamSkillMatrix";
import SkillDirectory from "../components/teams/SkillDirectory";
import SkillEndorsementsPanel from "../components/teams/SkillEndorsementsPanel";
import LearningGoalsPanel from "../components/teams/LearningGoalsPanel";
import { AuthContext } from "../context/AuthContext";
import {
    FiPlus, FiEdit2, FiTrash2, FiUsers, FiSearch, FiUserPlus,
    FiChevronRight, FiX, FiCheck, FiInfo, FiLoader, FiTarget,
    FiAward, FiTrendingUp, FiZap, FiStar
} from 'react-icons/fi';

// --- Premium UI Components ---

const Avatar = ({ name, src, size = 'md', className = '' }) => {
    const sizeClasses = {
        sm: "w-7 h-7 text-xs",
        md: "w-9 h-9 text-sm",
        lg: "w-11 h-11 text-base",
        xl: "w-14 h-14 text-lg",
    };
    const currentSizeClass = sizeClasses[size] || sizeClasses.md;

    if (src && src !== 'null') {
        return (
            <img
                src={src}
                alt={`${name}'s avatar`}
                className={`rounded-full object-cover ring-2 ring-white dark:ring-zinc-800 shadow-sm ${currentSizeClass} ${className}`}
            loading="lazy" />
        );
    }
    const initial = name ? name.charAt(0).toUpperCase() : "?";
    const colors = [
        'bg-gradient-to-br from-blue-400 to-blue-600',
        'bg-gradient-to-br from-purple-400 to-purple-600',
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

const AvatarStack = ({ members, max = 4 }) => {
    const visible = members.slice(0, max);
    const remaining = members.length - max;

    return (
        <div className="flex items-center -space-x-2">
            {visible.map((member, i) => (
                <motion.div
                    key={member.id || i}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="relative hover:z-10 hover:scale-110 transition-transform"
                >
                    <Avatar name={member.name} src={member.profile_picture} size="md" />
                </motion.div>
            ))}
            {remaining > 0 && (
                <div className="w-9 h-9 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-semibold flex items-center justify-center ring-2 ring-white dark:ring-zinc-800">
                    +{remaining}
                </div>
            )}
        </div>
    );
};

const Modal = ({ isOpen, onClose, title, children, footer, size = 'md' }) => {
    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-lg',
        lg: 'max-w-2xl',
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-6 sm:items-center sm:pt-4"
                >
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: "spring", duration: 0.4 }}
                        className={`relative flex max-h-[calc(100vh-2rem)] w-full ${sizeClasses[size]} flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900`}
                    >
                        <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
                            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{title}</h3>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                            >
                                <FiX className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
                        {footer && (
                            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-100 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-800/50">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const Notification = ({ message, type, onClose }) => {
    const styles = {
        success: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300",
        error: "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300",
        info: "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300",
    };

    const icons = {
        success: <FiCheck className="w-5 h-5" />,
        error: <FiX className="w-5 h-5" />,
        info: <FiInfo className="w-5 h-5" />,
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg ${styles[type]}`}
        >
            {icons[type]}
            <span className="font-medium">{message}</span>
            <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 transition-opacity">
                <FiX className="w-4 h-4" />
            </button>
        </motion.div>
    );
};

const StatCard = ({ icon: Icon, label, value, accent = false }) => (
    <div className={`flex items-center gap-3 p-4 rounded-xl ${accent ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white' : 'bg-zinc-50 dark:bg-zinc-800/50'}`}>
        <div className={`p-2 rounded-lg ${accent ? 'bg-white/20' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
            <Icon className={`w-5 h-5 ${accent ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
        </div>
        <div>
            <p className={`text-2xl font-bold ${accent ? 'text-white' : 'text-zinc-900 dark:text-white'}`}>{value}</p>
            <p className={`text-sm ${accent ? 'text-white/80' : 'text-zinc-500 dark:text-zinc-400'}`}>{label}</p>
        </div>
    </div>
);

const ProfileStyleStatCard = ({ icon: Icon, label, value, detail, tone = "blue" }) => {
    const tones = {
        blue: {
            wrapper: "bg-gradient-to-br from-blue-50 to-blue-100 border-blue-100",
            label: "text-blue-600",
            value: "text-blue-800",
            iconBg: "bg-blue-100",
            icon: "text-blue-600",
            detail: "text-blue-600",
        },
        purple: {
            wrapper: "bg-gradient-to-br from-purple-50 to-purple-100 border-purple-100",
            label: "text-purple-600",
            value: "text-purple-800",
            iconBg: "bg-purple-100",
            icon: "text-purple-600",
            detail: "text-purple-600",
        },
        green: {
            wrapper: "bg-gradient-to-br from-green-50 to-green-100 border-green-100",
            label: "text-green-600",
            value: "text-green-800",
            iconBg: "bg-green-100",
            icon: "text-green-600",
            detail: "text-green-600",
        },
    };

    const selectedTone = tones[tone] || tones.blue;

    return (
        <div className={`rounded-xl border p-6 ${selectedTone.wrapper}`}>
            <div className="flex items-center justify-between">
                <div>
                    <p className={`text-sm font-medium ${selectedTone.label}`}>{label}</p>
                    <h3 className={`mt-1 text-2xl font-bold ${selectedTone.value}`}>{value}</h3>
                </div>
                <div className={`rounded-lg p-3 ${selectedTone.iconBg}`}>
                    <Icon className={`h-6 w-6 ${selectedTone.icon}`} />
                </div>
            </div>
            {detail && (
                <p className={`mt-4 text-sm ${selectedTone.detail}`}>{detail}</p>
            )}
        </div>
    );
};

const TeamCard = ({ team, isSelected, onClick }) => {
    const activeMembers = team.users.filter((member) => member.status === "active").length;
    const leads = team.users.filter((member) => member.role === "team_leader").length;

    return (
        <motion.button
            onClick={onClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${isSelected
                    ? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-800 shadow-md'
                    : 'bg-white dark:bg-zinc-800/50 border-zinc-100 dark:border-zinc-700/50 hover:border-zinc-200 dark:hover:border-zinc-600 hover:shadow-md'
                }`}
        >
            <div className="mb-2 flex items-center justify-between">
                <h3 className={`font-semibold ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-zinc-800 dark:text-white'}`}>
                    {team.name}
                </h3>
                <FiChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'text-blue-500 translate-x-1' : 'text-zinc-400'}`} />
            </div>
            <p className="mb-3 line-clamp-2 text-xs text-zinc-500 dark:text-zinc-400">
                {team.description?.trim() || "No team details added yet."}
            </p>
            <div className="flex items-center justify-between mb-2">
                <AvatarStack members={team.users} max={3} />
                <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    {team.users.length} member{team.users.length !== 1 ? 's' : ''}
                </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{activeMembers} active</span>
                <span>•</span>
                <span>{leads} leads</span>
            </div>
        </motion.button>
    );
};

const MemberRow = ({ member, canManage, isEditing, onEdit, onSave, onCancel, onRemove, editRole, setEditRole, isSaving, isCurrentUser }) => (
    <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between p-4 bg-white dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-700/50 hover:shadow-md transition-all"
    >
        <div className="flex items-center gap-3">
            <Avatar name={member.name} src={member.profile_picture} size="lg" />
            <div>
                <p className="font-semibold text-zinc-800 dark:text-white">{member.name || "Invited User"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 capitalize">
                        {member.role}
                    </span>
                    {member.job_title && (
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{member.job_title}</span>
                    )}
                </div>
            </div>
        </div>

        {canManage && (
            isEditing ? (
                <form onSubmit={onSave} className="flex items-center gap-2">
                    <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="text-sm border border-zinc-200 dark:border-zinc-600 rounded-lg px-3 py-1.5 bg-white dark:bg-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none"
                        disabled={isSaving}
                    >
                        <option value="admin">Admin</option>
                        <option value="team_leader">Team Leader</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                    </select>
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="p-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
                    >
                        {isSaving ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiCheck className="w-4 h-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isSaving}
                        className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                    >
                        <FiX className="w-4 h-4" />
                    </button>
                </form>
            ) : (
                <div className="flex items-center gap-2">
                    <button
                        onClick={onEdit}
                        className="p-2 rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-blue-500 transition-all"
                    >
                        <FiEdit2 className="w-4 h-4" />
                    </button>
                    {!isCurrentUser && (
                        <button
                            onClick={onRemove}
                            className="p-2 rounded-lg text-zinc-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-all"
                        >
                            <FiTrash2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )
        )}
    </motion.div>
);

// --- Main Teams Component ---

const Teams = () => {
    const { user } = useContext(AuthContext);
    const location = useLocation();
    const canEdit = user?.roles?.some((r) => ["owner", "team_leader"].includes(r.name));
    const canManageMembers = user?.roles?.some((r) => r.name === "admin");

    // State
    const [teams, setTeams] = useState([]);
    const [selectedTeamId, setSelectedTeamId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isInsightsLoading, setIsInsightsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [teamInsights, setTeamInsights] = useState(null);
    const [insightsTeamId, setInsightsTeamId] = useState(null);

    // Form States
    const [teamForm, setTeamForm] = useState({ name: "", description: "" });
    const [editingId, setEditingId] = useState(null);
    const [isCreatingNewTeam, setIsCreatingNewTeam] = useState(false);
    const [memberForm, setMemberForm] = useState({ role: "member" });
    const [selectedUsersToAdd, setSelectedUsersToAdd] = useState([]);
    const [editingMemberId, setEditingMemberId] = useState(null);
    const [editingMemberRole, setEditingMemberRole] = useState("member");
    const [memberSavingId, setMemberSavingId] = useState(null);

    // Modals & Notifications
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [teamToDeleteId, setTeamToDeleteId] = useState(null);
    const [notification, setNotification] = useState(null);

    const extractErrorMessage = (error, fallback = "Something went wrong.") => {
        if (error?.response?.data?.errors) return error.response.data.errors.join(', ');
        if (error?.response?.data?.error) return error.response.data.error;
        return fallback;
    };

    // Data Fetching
    const loadTeams = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data } = await fetchTeams();
            const validTeams = Array.isArray(data) ? data : [];
            setTeams(validTeams);
            if (selectedTeamId && !validTeams.some(t => t.id === selectedTeamId)) {
                setSelectedTeamId(null);
            }
        } catch (error) {
            console.error("Failed to fetch teams:", error);
            setNotification({ message: "Failed to load teams.", type: "error" });
            setTeams([]);
        } finally {
            setIsLoading(false);
        }
    }, [selectedTeamId]);

    const loadTeamInsights = useCallback(async (teamId) => {
        if (!teamId) {
            setTeamInsights(null);
            setInsightsTeamId(null);
            return;
        }
        if (teamId !== insightsTeamId) setTeamInsights(null);
        setInsightsTeamId(teamId);
        setIsInsightsLoading(true);
        try {
            const { data } = await fetchTeamInsights(teamId);
            setTeamInsights(data);
            setInsightsTeamId(teamId);
        } catch (error) {
            console.error("Failed to fetch team insights:", error);
            setTeamInsights(null);
        } finally {
            setIsInsightsLoading(false);
        }
    }, [insightsTeamId]);

    const refreshInsights = useCallback(async () => {
        if (selectedTeamId) await loadTeamInsights(selectedTeamId);
    }, [selectedTeamId, loadTeamInsights]);

    useEffect(() => { loadTeams(); }, [loadTeams]);

    useEffect(() => {
        if (selectedTeamId) loadTeamInsights(selectedTeamId);
        else { setTeamInsights(null); setInsightsTeamId(null); }
    }, [selectedTeamId, loadTeamInsights]);

    useEffect(() => {
        if (teams.length > 0 && location.state?.teamId) {
            setSelectedTeamId(location.state.teamId);
            window.history.replaceState({}, document.title);
        }
    }, [teams, location.state]);

    // Handlers
    const handleFormChange = (e) => setTeamForm({ ...teamForm, [e.target.name]: e.target.value });
    const handleRoleChange = (e) => setMemberForm({ ...memberForm, role: e.target.value });

    const resetAndCloseForms = () => {
        setEditingId(null);
        setIsCreatingNewTeam(false);
        setTeamForm({ name: "", description: "" });
        setNotification(null);
        setEditingMemberId(null);
        setEditingMemberRole("member");
        setMemberSavingId(null);
        setSelectedUsersToAdd([]);
        setMemberForm({ role: "member" });
    };

    const handleSelectTeam = (id) => {
        setSelectedTeamId(id);
        resetAndCloseForms();
    };

    const handleTeamSubmit = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        setNotification(null);
        const action = editingId ? updateTeam(editingId, teamForm) : createTeam(teamForm);
        try {
            await action;
            resetAndCloseForms();
            await loadTeams();
            await refreshInsights();
            setNotification({ message: `Team ${editingId ? 'updated' : 'created'} successfully!`, type: "success" });
        } catch (err) {
            setNotification({ message: `Failed to save team: ${err.message || 'An error occurred.'}`, type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditClick = (team) => {
        setEditingId(team.id);
        setIsCreatingNewTeam(false);
        setTeamForm({ name: team.name, description: team.description || "" });
        setSelectedTeamId(team.id);
        setNotification(null);
    };

    const handleNewClick = () => {
        setIsCreatingNewTeam(true);
        setEditingId(null);
        setSelectedTeamId(null);
        setTeamForm({ name: "", description: "" });
        setNotification(null);
    };

    const confirmDeleteTeam = (id) => {
        setTeamToDeleteId(id);
        setShowDeleteConfirm(true);
    };

    const handleDeleteTeam = async () => {
        setShowDeleteConfirm(false);
        setIsSaving(true);
        setNotification(null);
        try {
            await deleteTeam(teamToDeleteId);
            if (selectedTeamId === teamToDeleteId) setSelectedTeamId(null);
            await loadTeams();
            setNotification({ message: "Team deleted successfully!", type: "success" });
        } catch (err) {
            setNotification({ message: `Failed to delete team: ${err.message || 'An error occurred.'}`, type: "error" });
        } finally {
            setIsSaving(false);
            setTeamToDeleteId(null);
        }
    };

    const handleAddMember = async (e) => {
        e.preventDefault();
        if (selectedUsersToAdd.length === 0) {
            setNotification({ message: "Please select users to add.", type: "info" });
            return;
        }
        setIsSaving(true);
        setNotification(null);
        try {
            await Promise.all(
                selectedUsersToAdd.map((u) =>
                    addTeamUser({ team_id: selectedTeamId, user_id: u.id, role: memberForm.role })
                )
            );
            setSelectedUsersToAdd([]);
            setMemberForm({ role: "member" });
            await loadTeams();
            await refreshInsights();
            setNotification({ message: "Member(s) added successfully!", type: "success" });
        } catch (err) {
            setNotification({ message: `Failed to add member: ${err.message || 'An error occurred.'}`, type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveMember = async (teamUserId, memberName) => {
        if (!window.confirm(`Remove ${memberName} from this team?`)) return;
        setIsSaving(true);
        setNotification(null);
        try {
            await deleteTeamUser(teamUserId);
            await loadTeams();
            await refreshInsights();
            setNotification({ message: `${memberName} removed from team.`, type: "success" });
        } catch (err) {
            setNotification({ message: `Failed to remove ${memberName}.`, type: "error" });
        } finally {
            setIsSaving(false);
        }
    };

    const handleEditMemberClick = (member) => {
        setEditingMemberId(member.team_user_id);
        setEditingMemberRole(member.role || "member");
    };

    const handleCancelMemberEdit = () => {
        setEditingMemberId(null);
        setEditingMemberRole("member");
    };

    const handleUpdateMember = async (event, member) => {
        event.preventDefault();
        if (!editingMemberId) return;
        setMemberSavingId(editingMemberId);
        setNotification(null);
        try {
            await updateTeamUser(editingMemberId, { role: editingMemberRole });
            await loadTeams();
            await refreshInsights();
            setNotification({ message: `${member.name || "Member"} updated successfully!`, type: "success" });
            setEditingMemberId(null);
            setEditingMemberRole("member");
        } catch (err) {
            setNotification({ message: `Failed to update member.`, type: "error" });
        } finally {
            setMemberSavingId(null);
        }
    };

    const handleLeaveTeam = async () => {
        if (!window.confirm('Leave this team?')) return;
        setIsSaving(true);
        setNotification(null);
        try {
            await leaveTeam(selectedTeamId);
            await loadTeams();
            setNotification({ message: 'You have left the team.', type: 'success' });
        } catch (err) {
            setNotification({ message: `Failed to leave team.`, type: 'error' });
        } finally {
            setIsSaving(false);
            setSelectedTeamId(null);
        }
    };

    // Skill handlers
    const handleToggleEndorsement = async ({ userSkillId, endorsed, endorsementId }) => {
        if (!selectedTeamId) return;
        try {
            if (endorsed && endorsementId) {
                await revokeSkillEndorsement(endorsementId);
                setNotification({ message: "Endorsement removed.", type: "success" });
            } else {
                await endorseSkill({ user_skill_id: userSkillId, team_id: selectedTeamId });
                setNotification({ message: "Skill endorsed!", type: "success" });
            }
            await refreshInsights();
        } catch (error) {
            setNotification({ message: extractErrorMessage(error, "Unable to update endorsement."), type: "error" });
        }
    };

    const handleAddSkill = async (payload) => {
        try {
            await createUserSkill(payload);
            setNotification({ message: "Skill added.", type: "success" });
            await refreshInsights();
        } catch (error) {
            setNotification({ message: extractErrorMessage(error, "Unable to add skill."), type: "error" });
        }
    };

    const handleUpdateSkill = async (skillId, data) => {
        try {
            await updateUserSkill(skillId, data);
            setNotification({ message: "Skill updated.", type: "success" });
            await refreshInsights();
        } catch (error) {
            setNotification({ message: extractErrorMessage(error, "Unable to update skill."), type: "error" });
        }
    };

    const handleDeleteSkill = async (skillId) => {
        try {
            await deleteUserSkill(skillId);
            setNotification({ message: "Skill removed.", type: "success" });
            await refreshInsights();
        } catch (error) {
            setNotification({ message: extractErrorMessage(error, "Unable to remove skill."), type: "error" });
        }
    };

    const handleCreateGoal = async (goal) => {
        if (!selectedTeamId) return;
        try {
            await createLearningGoal({ ...goal, team_id: selectedTeamId });
            setNotification({ message: "Learning goal created.", type: "success" });
            await refreshInsights();
        } catch (error) {
            setNotification({ message: extractErrorMessage(error, "Unable to create goal."), type: "error" });
        }
    };

    const handleDeleteGoal = async (goalId) => {
        try {
            await deleteLearningGoal(goalId);
            setNotification({ message: "Goal removed.", type: "success" });
            await refreshInsights();
        } catch (error) {
            setNotification({ message: extractErrorMessage(error, "Unable to delete goal."), type: "error" });
        }
    };

    const handleAddCheckpoint = async (goalId, checkpoint) => {
        try {
            await createLearningCheckpoint({ learning_goal_id: goalId, ...checkpoint });
            await refreshInsights();
        } catch (error) {
            setNotification({ message: extractErrorMessage(error, "Unable to add checkpoint."), type: "error" });
        }
    };

    const handleToggleCheckpoint = async (checkpointId, completed) => {
        try {
            await updateLearningCheckpoint(checkpointId, { completed });
            await refreshInsights();
        } catch (error) {
            setNotification({ message: extractErrorMessage(error, "Unable to update checkpoint."), type: "error" });
        }
    };

    // Derived State
    const filteredTeams = teams.filter((t) =>
        `${t.name} ${t.users.map((u) => u.name).join(" ")}`
            .toLowerCase()
            .includes(searchQuery.toLowerCase())
    );

    const selectedTeam = teams.find((t) => t.id === selectedTeamId);
    const isTeamLeaderOfSelectedTeam = selectedTeam?.users?.some(
        (teamUser) => teamUser.id === user?.id && teamUser.role === "team_leader"
    );
    const canManageSelectedTeamMembers = canManageMembers || isTeamLeaderOfSelectedTeam;
    const isFormVisible = isCreatingNewTeam || editingId;

    const aggregatedStats = useMemo(() => {
        const totalTeams = teams.length;
        const stats = { totalTeams, totalMembers: 0, avgMembers: 0, uniqueSkills: 0, topSkills: [] };
        if (totalTeams === 0) return stats;

        const skillSet = new Set();
        const skillFrequency = new Map();

        teams.forEach((team) => {
            const members = team.users || [];
            stats.totalMembers += members.length;
            members.forEach((member) => {
                const memberSkills = Array.isArray(member.skills) ? member.skills : [];
                memberSkills.forEach((skill) => {
                    const name = typeof skill === "string" ? skill : skill?.name || skill?.skill_name;
                    if (name) {
                        skillSet.add(name);
                        skillFrequency.set(name, (skillFrequency.get(name) || 0) + 1);
                    }
                });
            });
        });

        stats.avgMembers = totalTeams ? Math.round((stats.totalMembers / totalTeams) * 10) / 10 : 0;
        stats.uniqueSkills = skillSet.size;
        stats.topSkills = Array.from(skillFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, count]) => ({ name, count }));

        return stats;
    }, [teams]);

    const renderSkillGapAnalysis = () => {
        if (!teamInsights?.skill_gap || insightsTeamId !== selectedTeamId) return null;

        const strengths = teamInsights.skill_gap.strengths || [];
        const opportunities = teamInsights.skill_gap.opportunities || [];
        const memberCount = Math.max(teamInsights.members?.length || 1, 1);

        const renderList = (items, accentClass) => {
            if (items.length === 0) {
                return <p className="text-sm text-zinc-500">Not enough data yet.</p>;
            }
            return items.map((item) => {
                const active = item.expert_count + item.advanced_count;
                const width = Math.min(100, Math.round((active / memberCount) * 100));
                return (
                    <div key={item.name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                            <span className="font-medium text-zinc-700 dark:text-zinc-300">{item.name}</span>
                            <span className="text-zinc-500">{item.expert_count} expert{item.expert_count === 1 ? '' : 's'}</span>
                        </div>
                        <div className="w-full bg-zinc-100 dark:bg-zinc-700 rounded-full h-2">
                            <div className={`${accentClass} h-2 rounded-full transition-all`} style={{ width: `${width}%` }} />
                        </div>
                    </div>
                );
            });
        };

        return (
            <section id="skill-gap-analysis" className="bg-white dark:bg-zinc-800/50 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-700/50 p-6 xl:col-span-2">
                <h2 className="text-lg font-semibold text-zinc-800 dark:text-white mb-4 flex items-center gap-2">
                    <FiTrendingUp className="w-5 h-5 text-blue-500" />
                    Skill Gap Analysis
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-medium text-zinc-600 dark:text-zinc-400 mb-3 text-sm uppercase tracking-wide">Strengths</h3>
                        <div className="space-y-3">{renderList(strengths, 'bg-emerald-500')}</div>
                    </div>
                    <div>
                        <h3 className="font-medium text-zinc-600 dark:text-zinc-400 mb-3 text-sm uppercase tracking-wide">Opportunities</h3>
                        <div className="space-y-3">{renderList(opportunities, 'bg-amber-500')}</div>
                    </div>
                </div>
            </section>
        );
    };

    const hasInsights = Boolean(teamInsights && insightsTeamId === selectedTeam?.id);

    // Render
    return (
        <div className="flex h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200">
            {/* Sidebar */}
            <aside className="w-80 flex-shrink-0 bg-white dark:bg-zinc-800 border-r border-zinc-100 dark:border-zinc-700 flex flex-col">
                <div className="p-5 border-b border-zinc-100 dark:border-zinc-700 bg-gradient-to-r from-blue-600 to-indigo-600">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-white/20 rounded-lg">
                                <FiUsers className="w-5 h-5 text-white" />
                            </div>
                            <h2 className="text-lg font-bold text-white">Teams</h2>
                        </div>
                        <span className="text-sm text-white/70">{teams.length}</span>
                    </div>
                </div>

                <div className="p-4">
                    <div className="relative">
                        <FiSearch className="absolute top-1/2 left-3 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search teams..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto p-3 space-y-2">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                            <FiLoader className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                            <p className="text-sm">Loading teams...</p>
                        </div>
                    ) : filteredTeams.length > 0 ? (
                        filteredTeams.map((team) => (
                            <TeamCard
                                key={team.id}
                                team={team}
                                isSelected={selectedTeamId === team.id}
                                onClick={() => handleSelectTeam(team.id)}
                            />
                        ))
                    ) : (
                        <div className="text-center py-12">
                            <FiUsers className="w-12 h-12 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                            <p className="font-medium text-zinc-600 dark:text-zinc-400">No teams found</p>
                            <p className="text-sm text-zinc-500">Try a different search</p>
                        </div>
                    )}
                </nav>

                {canEdit && (
                    <div className="p-4 border-t border-zinc-100 dark:border-zinc-700">
                        <button
                            onClick={handleNewClick}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg"
                        >
                            <FiPlus className="w-4 h-4" />
                            New Team
                        </button>
                    </div>
                )}
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                <div className="p-8">
                    {isFormVisible ? (
                        // Create/Edit Form
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-w-2xl mx-auto"
                        >
                            <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-lg border border-zinc-100 dark:border-zinc-700 overflow-hidden">
                                <div className="p-6 border-b border-zinc-100 dark:border-zinc-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
                                        {editingId ? 'Edit Team' : 'Create New Team'}
                                    </h1>
                                    <p className="text-zinc-600 dark:text-zinc-400 mt-1">
                                        {editingId ? `Update details for ${teamForm.name}` : 'Set up a new team for your organization'}
                                    </p>
                                </div>

                                <form onSubmit={handleTeamSubmit} className="p-6 space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                            Team Name *
                                        </label>
                                        <input
                                            name="name"
                                            value={teamForm.name}
                                            onChange={handleFormChange}
                                            placeholder="e.g. Product Development"
                                            required
                                            className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                                            Description <span className="text-zinc-400">(optional)</span>
                                        </label>
                                        <textarea
                                            name="description"
                                            value={teamForm.description}
                                            onChange={handleFormChange}
                                            placeholder="What does this team focus on?"
                                            rows={4}
                                            className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none"
                                        />
                                    </div>

                                    <div className="flex items-center justify-end gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={resetAndCloseForms}
                                            disabled={isSaving}
                                            className="px-5 py-2.5 text-zinc-600 dark:text-zinc-400 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-xl transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSaving}
                                            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md flex items-center gap-2"
                                        >
                                            {isSaving ? (
                                                <>
                                                    <FiLoader className="w-4 h-4 animate-spin" />
                                                    Saving...
                                                </>
                                            ) : (
                                                <>
                                                    <FiCheck className="w-4 h-4" />
                                                    {editingId ? 'Save Changes' : 'Create Team'}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    ) : selectedTeam ? (
                        // Team Details
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="space-y-8"
                        >
                            {/* Header */}
                            <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-700 p-6">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white">{selectedTeam.name}</h1>
                                        <p className="text-zinc-600 dark:text-zinc-400 mt-2 max-w-2xl">
                                            {selectedTeam.description || 'No description provided.'}
                                        </p>
                                    </div>
                                    {canEdit && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleEditClick(selectedTeam)}
                                                className="p-2.5 rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700 hover:text-blue-500 transition-all"
                                            >
                                                <FiEdit2 className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => confirmDeleteTeam(selectedTeam.id)}
                                                className="p-2.5 rounded-xl text-zinc-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-all"
                                            >
                                                <FiTrash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Quick Stats */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                    <ProfileStyleStatCard
                                        icon={FiUsers}
                                        label="Active Members"
                                        value={selectedTeam.users.filter((member) => member.status === 'active').length}
                                        detail={`${selectedTeam.users.length} total members`}
                                        tone="blue"
                                    />
                                    <ProfileStyleStatCard
                                        icon={FiAward}
                                        label="Team Leaders"
                                        value={selectedTeam.users.filter((member) => member.role === 'team_leader').length}
                                        detail={`${teamInsights?.team_experts?.length || 0} recognized experts`}
                                        tone="purple"
                                    />
                                    <ProfileStyleStatCard
                                        icon={FiTarget}
                                        label="Skills Tracked"
                                        value={teamInsights?.skills?.length || 0}
                                        detail={`${teamInsights?.current_user_learning_goals?.length || 0} active learning goals`}
                                        tone="green"
                                    />
                                </div>
                            </div>

                            {/* Members Section */}
                            <section id="team-members-section" className="bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-700 p-6">
                                <h2 className="text-lg font-semibold text-zinc-800 dark:text-white mb-4 flex items-center gap-2">
                                    <FiUsers className="w-5 h-5 text-blue-500" />
                                    Team Members
                                </h2>

                                <div className="space-y-3">
                                    {selectedTeam.users.length > 0 ? (
                                        selectedTeam.users.map((member) => (
                                            <MemberRow
                                                key={member.team_user_id}
                                                member={member}
                                                canManage={canManageSelectedTeamMembers}
                                                isEditing={editingMemberId === member.team_user_id}
                                                onEdit={() => handleEditMemberClick(member)}
                                                onSave={(e) => handleUpdateMember(e, member)}
                                                onCancel={handleCancelMemberEdit}
                                                onRemove={() => handleRemoveMember(member.team_user_id, member.name)}
                                                editRole={editingMemberRole}
                                                setEditRole={setEditingMemberRole}
                                                isSaving={memberSavingId === member.team_user_id}
                                                isCurrentUser={member.id === user.id}
                                            />
                                        ))
                                    ) : (
                                        <p className="text-center text-zinc-500 py-8">No members yet.</p>
                                    )}
                                </div>

                                {/* Add Member Form */}
                                {canManageSelectedTeamMembers && (
                                    <form
                                        id="add-member-form"
                                        onSubmit={handleAddMember}
                                        className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-700 grid grid-cols-1 md:grid-cols-4 gap-4"
                                    >
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                                                Add Members
                                            </label>
                                            <UserMultiSelect
                                                selectedUsers={selectedUsersToAdd}
                                                setSelectedUsers={setSelectedUsersToAdd}
                                                excludedIds={selectedTeam.users.map((u) => u.id)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-2">
                                                Role
                                            </label>
                                            <select
                                                value={memberForm.role}
                                                onChange={handleRoleChange}
                                                className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                            >
                                                <option value="admin">Admin</option>
                                                <option value="team_leader">Team Leader</option>
                                                <option value="member">Member</option>
                                                <option value="viewer">Viewer</option>
                                            </select>
                                        </div>
                                        <div className="flex items-end">
                                            <button
                                                type="submit"
                                                disabled={isSaving || selectedUsersToAdd.length === 0}
                                                className="w-full px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                                            >
                                                {isSaving ? (
                                                    <FiLoader className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <FiUserPlus className="w-4 h-4" />
                                                )}
                                                Add
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </section>

                            {/* Insights */}
                            {isInsightsLoading && !teamInsights ? (
                                <div className="bg-white dark:bg-zinc-800 rounded-2xl p-8 flex items-center justify-center text-zinc-500">
                                    <FiLoader className="w-6 h-6 animate-spin mr-3" />
                                    Loading insights...
                                </div>
                            ) : hasInsights && (
                                <>
                                    <section id="team-skill-matrix">
                                        <TeamSkillMatrix
                                            members={teamInsights.members}
                                            skills={teamInsights.skills}
                                            roles={teamInsights.roles}
                                        />
                                    </section>

                                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                        {renderSkillGapAnalysis()}
                                        <section id="endorsements-panel">
                                            <SkillEndorsementsPanel
                                                skills={teamInsights.current_user_skills}
                                                availableSkills={teamInsights.available_skills}
                                                teamExperts={teamInsights.team_experts}
                                                recentEndorsements={teamInsights.recent_endorsements}
                                                onAddSkill={handleAddSkill}
                                                onUpdateSkill={handleUpdateSkill}
                                                onRemoveSkill={handleDeleteSkill}
                                            />
                                        </section>
                                        <section id="learning-goals-panel">
                                            <LearningGoalsPanel
                                                goals={teamInsights.current_user_learning_goals}
                                                onCreateGoal={handleCreateGoal}
                                                onDeleteGoal={handleDeleteGoal}
                                                onAddCheckpoint={handleAddCheckpoint}
                                                onToggleCheckpoint={handleToggleCheckpoint}
                                            />
                                        </section>
                                        <section id="skills-directory-panel" className="xl:col-span-2">
                                            <SkillDirectory
                                                members={teamInsights.members}
                                                skills={teamInsights.skills}
                                                roles={teamInsights.roles}
                                                availabilityOptions={teamInsights.availability_options}
                                                onToggleEndorse={handleToggleEndorsement}
                                            />
                                        </section>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    ) : isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full py-20">
                            <FiLoader className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                            <p className="text-zinc-500">Loading teams...</p>
                        </div>
                    ) : (
                        // Empty State / All Teams View
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                            {teams.length > 0 ? (
                                <>
                                    {/* Stats Overview */}
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                                        <StatCard icon={FiUsers} label="Total Teams" value={aggregatedStats.totalTeams} accent />
                                        <StatCard icon={FiStar} label="Total Members" value={aggregatedStats.totalMembers} />
                                        <StatCard icon={FiTarget} label="Avg Members/Team" value={aggregatedStats.avgMembers} />
                                        <StatCard icon={FiZap} label="Skills Tracked" value={aggregatedStats.uniqueSkills} />
                                    </div>

                                    {/* Info Banner */}
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-5 mb-8 flex items-center gap-4">
                                        <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                                            <FiInfo className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-blue-700 dark:text-blue-300">Select a Team</h3>
                                            <p className="text-sm text-blue-600/80 dark:text-blue-400/80">Click on any team in the sidebar to view details and manage members.</p>
                                        </div>
                                    </div>

                                    {/* Team Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {teams.map((team) => (
                                            <motion.div
                                                key={team.id}
                                                whileHover={{ y: -4 }}
                                                onClick={() => handleSelectTeam(team.id)}
                                                className="bg-white dark:bg-zinc-800 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-700 p-6 cursor-pointer hover:shadow-lg transition-all"
                                            >
                                                <h3 className="text-lg font-semibold text-zinc-800 dark:text-white mb-2">{team.name}</h3>
                                                {team.description && (
                                                    <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-4">{team.description}</p>
                                                )}
                                                <div className="flex items-center justify-between">
                                                    <AvatarStack members={team.users} max={4} />
                                                    <button className="text-sm text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 hover:gap-2 transition-all">
                                                        View <FiChevronRight className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                                    <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
                                        <FiUsers className="w-10 h-10 text-zinc-400" />
                                    </div>
                                    <h2 className="text-2xl font-bold text-zinc-800 dark:text-white mb-2">No Teams Yet</h2>
                                    <p className="text-zinc-500 max-w-md mb-8">
                                        Create your first team to start collaborating and tracking skills across your organization.
                                    </p>
                                    {canEdit && (
                                        <button
                                            onClick={handleNewClick}
                                            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg flex items-center gap-2"
                                        >
                                            <FiPlus className="w-5 h-5" />
                                            Create First Team
                                        </button>
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>
            </main>

            {/* Delete Modal */}
            <Modal
                isOpen={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                title="Delete Team"
                footer={
                    <>
                        <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-4 py-2 text-zinc-600 dark:text-zinc-400 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleDeleteTeam}
                            disabled={isSaving}
                            className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                        >
                            {isSaving ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiTrash2 className="w-4 h-4" />}
                            Delete
                        </button>
                    </>
                }
            >
                <p className="text-zinc-600 dark:text-zinc-400">
                    Are you sure you want to delete <span className="font-semibold text-zinc-800 dark:text-white">{teams.find(t => t.id === teamToDeleteId)?.name}</span>? This action cannot be undone.
                </p>
            </Modal>

            {/* Notification */}
            <AnimatePresence>
                {notification && (
                    <Notification
                        message={notification.message}
                        type={notification.type}
                        onClose={() => setNotification(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default Teams;
