import React, { useEffect, useState, useMemo, useContext } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchUserInfo, fetchUserProfile, fetchPosts, SchedulerAPI, fetchTeams, saveKekaCredentials, refreshKekaProfile, startDirectConversation } from "../components/api";
import { getStatusClasses } from '/utils/taskUtils';
import { Squares2X2Icon, FolderIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { AuthContext } from '../context/AuthContext';
import { COLOR_MAP } from '/utils/theme';
import { buildAvatarStyle, getAvatarInitial, normalizeAvatarColor } from '/utils/avatar';

const asRecordArray = (value) =>
  Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];

const Avatar = ({ name, src, size = 'md', color }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  };

  useEffect(() => {
    setImageFailed(false);
  }, [src]);

  if (src && !imageFailed) {
    return (
      <img
        src={src}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover border-2 border-white/80 shadow-sm`}
        loading="lazy"
        onError={() => setImageFailed(true)}
      />
    );
  }
  const initial = getAvatarInitial(name);
  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center border-2 border-white/80 shadow-sm`}
      style={buildAvatarStyle(color)}
    >
      {size === 'lg' ? (
        <span className="text-xl font-medium">{initial}</span>
      ) : (
        <span className="text-sm font-medium">{initial}</span>
      )}
    </div>
  );
};

const Profile = () => {
  const navigate = useNavigate();
  const { setUser: setAuthUser } = useContext(AuthContext);
  const { userId } = useParams();
  const viewingOtherProfile = Boolean(userId);
  const [user, setUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    date_of_birth: "",
    profile_picture: null,
    cover_photo: null,
    color_theme: "#3b82f6",
    avatar_color: "#6366f1",
    phone_number: "",
    bio: "",
    social_links: {
      linkedin: "",
      github: "",
      twitter: "",
      website: ""
    }
  });
  const [profileImageFailed, setProfileImageFailed] = useState(false);
  const [keka, setKeka] = useState({
    connected: false,
    base_url: "",
    employee_id: "",
    api_key_masked: "",
    last_synced_at: null,
    data: {}
  });
  const [kekaForm, setKekaForm] = useState({
    base_url: "",
    employee_id: "",
    api_key: ""
  });
  const [kekaSaving, setKekaSaving] = useState(false);
  const [kekaRefreshing, setKekaRefreshing] = useState(false);
  const [kekaError, setKekaError] = useState("");
  const [kekaSuccess, setKekaSuccess] = useState("");

  const refreshUserInfo = async () => {
    setIsLoading(true);
    try {
      const { data } = viewingOtherProfile
        ? await fetchUserProfile(userId)
        : await fetchUserInfo();
      const userData = data.user || data;
      const theme = COLOR_MAP[userData.color_theme] || userData.color_theme || '#3b82f6';
      const avatarColor = normalizeAvatarColor(userData.avatar_color);
      const updatedUser = { ...userData, color_theme: theme, avatar_color: avatarColor };
      setUser((prev) => ({ ...prev, ...updatedUser }));
      if (!viewingOtherProfile) {
        setAuthUser((prev) => ({ ...(prev || {}), ...updatedUser }));
      }

      const basicTeams = Array.isArray(data.teams) ? data.teams : [];
      try {
        const { data: allTeams } = await fetchTeams();
        const filtered = Array.isArray(allTeams) ? allTeams.filter(t => basicTeams.some(bt => bt.id === t.id)) : [];
        const merged = filtered.map(t => ({
          ...t,
          ...basicTeams.find(bt => bt.id === t.id)
        }));
        setTeams(merged);
      } catch {
        setTeams(basicTeams);
      }

      setProjects(Array.isArray(data.projects) ? data.projects : []);
      setFormData({
        first_name: userData.first_name,
        last_name: userData.last_name,
        date_of_birth: userData.date_of_birth,
        profile_picture: userData.profile_picture,
        cover_photo: userData.cover_photo,
        color_theme: theme,
        avatar_color: avatarColor,
        phone_number: userData.phone_number || "",
        bio: userData.bio || "",
        social_links: {
          linkedin: userData.social_links?.linkedin || "",
          github: userData.social_links?.github || "",
          twitter: userData.social_links?.twitter || "",
          website: userData.social_links?.website || ""
        }
      });
      if (data.keka && !viewingOtherProfile) {
        setKeka({
          connected: data.keka.connected,
          base_url: data.keka.base_url || "",
          employee_id: data.keka.employee_id || "",
          api_key_masked: data.keka.api_key_masked || "",
          last_synced_at: data.keka.last_synced_at,
          data: data.keka.data || {}
        });
        setKekaForm((prev) => ({
          ...prev,
          base_url: data.keka.base_url || "",
          employee_id: data.keka.employee_id || "",
          api_key: ""
        }));
      }

      const postsResponse = await fetchPosts(userData.id);
      setPosts(postsResponse.data);

      const tasksResponse = await SchedulerAPI.getTasks({ assigned_to_user: userData.id });
      setTasks(tasksResponse.data);
    } catch (error) {
      console.error("Error fetching user info:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUserInfo();
  }, [userId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith("social_links.")) {
      const key = name.replace("social_links.", "");
      setFormData((prevData) => ({
        ...prevData,
        social_links: { ...(prevData.social_links || {}), [key]: value }
      }));
      return;
    }

    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleFileChange = (e) => {
    const { name, files } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: files[0],
    }));
  };

  const handleKekaChange = (e) => {
    const { name, value } = e.target;
    setKekaForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleKekaSave = async (e) => {
    e.preventDefault();
    setKekaSaving(true);
    setKekaError("");
    setKekaSuccess("");
    try {
      const { data } = await saveKekaCredentials({
        base_url: kekaForm.base_url,
        api_key: kekaForm.api_key,
        employee_id: kekaForm.employee_id
      });
      if (data?.keka) {
        setKeka(data.keka);
        setKekaForm((prev) => ({ ...prev, api_key: "" }));
      }
      setKekaSuccess("Keka credentials saved and synced.");
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to save Keka credentials.";
      setKekaError(message);
    } finally {
      setKekaSaving(false);
    }
  };

  const handleKekaRefresh = async () => {
    setKekaRefreshing(true);
    setKekaError("");
    setKekaSuccess("");
    try {
      const { data } = await refreshKekaProfile();
      if (data?.keka) {
        setKeka(data.keka);
      }
      setKekaSuccess("Keka data refreshed.");
    } catch (error) {
      const message = error?.response?.data?.error || "Failed to refresh Keka data.";
      setKekaError(message);
    } finally {
      setKekaRefreshing(false);
    }
  };

  function getCSRFToken() {
    const meta = document.querySelector("meta[name='csrf-token']");
    return meta?.getAttribute("content");
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const payload = new FormData();
    payload.append("auth[first_name]", formData.first_name);
    payload.append("auth[last_name]", formData.last_name);
    payload.append("auth[date_of_birth]", formData.date_of_birth);
    payload.append("auth[avatar_color]", formData.avatar_color);
    payload.append("auth[phone_number]", formData.phone_number || "");
    payload.append("auth[bio]", formData.bio || "");
    Object.entries(formData.social_links || {}).forEach(([key, value]) => {
      payload.append(`auth[social_links][${key}]`, value || "");
    });

    if (formData.profile_picture instanceof File) {
      payload.append("auth[profile_picture]", formData.profile_picture);
    }
    if (formData.cover_photo instanceof File) {
      payload.append("auth[cover_photo]", formData.cover_photo);
    }

    try {
      const res = await fetch("/api/update_profile", {
        method: "POST",
        body: payload,
        headers: {
          "Accept": "application/json",
          "X-CSRF-Token": getCSRFToken()
        },
        credentials: "include"
      });

      if (!res.ok) throw new Error("Update failed");

      setEditMode(false);
      await refreshUserInfo();
    } catch (error) {
      console.error("Error updating user info:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const displayName = user
    ? ([user.first_name, user.last_name]
        .filter((n) => n && n !== "null")
        .join(" ") || "Unnamed User")
    : "";

  const initial = getAvatarInitial(displayName || user?.email);
  const avatarPreviewColor = normalizeAvatarColor(editMode ? formData.avatar_color : user?.avatar_color);
  const showProfileImage = user?.profile_picture && user.profile_picture !== 'null' && !profileImageFailed;
  const currentRoleLabel = (user?.roles?.[0]?.name || "member")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  const todayStr = new Date().toISOString().split("T")[0];
  const normalizeKekaPayload = (payload) => {
    if (!payload) return null;
    return payload.data?.data || payload.data?.result || payload.data || payload;
  };
  const extractArray = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.logs)) return payload.logs;
    if (Array.isArray(payload.entries)) return payload.entries;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  };

  useEffect(() => {
    setProfileImageFailed(false);
  }, [user?.profile_picture]);
  const extractNumber = (payload, keys = []) => {
    if (!payload) return null;
    for (const key of keys) {
      const value = payload[key];
      if (typeof value === "number") return value;
      if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }
    return null;
  };
  const kekaPayload = keka?.data || {};
  const kekaProfile = normalizeKekaPayload(kekaPayload.profile);
  const kekaAttendance = normalizeKekaPayload(kekaPayload.attendance);
  const kekaTimesheets = normalizeKekaPayload(kekaPayload.timesheets);
  const kekaLeave = normalizeKekaPayload(kekaPayload.leave_balances);
  const kekaAttendanceLogs = extractArray(kekaAttendance);
  const kekaTimesheetEntries = extractArray(kekaTimesheets);
  const kekaTotalHours = extractNumber(kekaTimesheets, ["totalHours", "totalHoursWorked", "total_hours"]);
  const kekaTotalMinutes = extractNumber(kekaTimesheets, ["totalMinutes", "total_minutes"]);
  const kekaHoursDisplay = kekaTotalHours ?? (kekaTotalMinutes ? (kekaTotalMinutes / 60).toFixed(2) : null);
  const taskRecords = useMemo(() => asRecordArray(tasks), [tasks]);
  const completedTasks = useMemo(
    () => taskRecords.filter((task) => {
      const normalizedStatus = (task.status || '').toLowerCase();
      return normalizedStatus === 'completed' || normalizedStatus === 'done';
    }),
    [taskRecords]
  );
  const incompleteTasks = useMemo(
    () => taskRecords.filter((task) => {
      const normalizedStatus = (task.status || '').toLowerCase();
      return normalizedStatus !== 'completed' && normalizedStatus !== 'done';
    }),
    [taskRecords]
  );
  const generalTasks = useMemo(
    () => incompleteTasks.filter((t) => t.type === 'general'),
    [incompleteTasks]
  );
  const nonGeneralTasks = useMemo(
    () => incompleteTasks.filter((t) => t.type !== 'general'),
    [incompleteTasks]
  );
  const dueTodayTasks = useMemo(
    () => nonGeneralTasks.filter((t) => (t.end_date || t.due_date) === todayStr),
    [nonGeneralTasks, todayStr]
  );
  const dueTodayAllTasks = useMemo(
    () => taskRecords.filter((t) => {
      const normalizedStatus = (t.status || '').toLowerCase();
      if (normalizedStatus === 'completed' || normalizedStatus === 'done') return false;
      const dueDate = t.end_date || t.due_date;
      return dueDate === todayStr;
    }),
    [taskRecords, todayStr]
  );
  const otherTasks = useMemo(
    () => nonGeneralTasks.filter((t) => (t.end_date || t.due_date) !== todayStr),
    [nonGeneralTasks, todayStr]
  );
  const overdueTasks = useMemo(
    () => taskRecords.filter((task) => {
      const normalizedStatus = (task.status || '').toLowerCase();
      if (normalizedStatus === 'completed' || normalizedStatus === 'done') return false;
      const dueDate = task.end_date || task.due_date;
      return dueDate && dueDate < todayStr;
    }),
    [taskRecords, todayStr]
  );
  const activeTasks = incompleteTasks.length;
  const taskStats = useMemo(
    () => [
      {
        label: 'Total Tasks',
        value: taskRecords.length,
        tone: 'text-gray-700',
        accent: 'bg-gray-100 text-gray-700',
      },
      {
        label: 'Active Tasks',
        value: activeTasks,
        tone: 'text-blue-700',
        accent: 'bg-blue-100 text-blue-700',
      },
      {
        label: 'Due Today',
        value: dueTodayAllTasks.length,
        tone: 'text-red-700',
        accent: 'bg-red-100 text-red-700',
      },
      {
        label: 'Completed',
        value: completedTasks.length,
        tone: 'text-green-700',
        accent: 'bg-green-100 text-green-700',
      },
      {
        label: 'Overdue',
        value: overdueTasks.length,
        tone: 'text-orange-700',
        accent: 'bg-orange-100 text-orange-700',
      }
    ],
    [activeTasks, completedTasks.length, dueTodayAllTasks.length, overdueTasks.length, taskRecords.length]
  );

  const sortedCompletedTasks = useMemo(() => {
    const parseDate = (task) => task.updated_at || task.end_date || task.due_date || task.created_at;
    return completedTasks
      .slice()
      .sort((a, b) => {
        const dateA = parseDate(a) || '';
        const dateB = parseDate(b) || '';
        return dateB.localeCompare(dateA);
      });
  }, [completedTasks]);

  const handleTaskNavigation = (task) => {
    if (task.task_url) {
      window.open(task.task_url, '_blank', 'noopener');
      return;
    }

    if (task.sprint?.project_id) {
      navigate(`/projects/${task.sprint.project_id}/dashboard`, {
        state: { focusTaskId: task.id || task.task_id },
      });
      return;
    }

    navigate('/worklog', { state: { focusTaskId: task.id || task.task_id } });
  };
  const statusSections = useMemo(() => {
    const statusOrder = [
      { key: 'in-progress', label: 'In Progress', matchers: ['in progress', 'inprogress', 'in_progress'] },
      { key: 'todo', label: 'To Do', matchers: ['todo', 'to do'] },
      { key: 'completed', label: 'Completed', matchers: ['completed', 'done'] },
    ];

    const buckets = statusOrder.map(() => []);
    const uncategorized = [];

    otherTasks.forEach((task) => {
      const normalizedStatus = (task.status || '').toLowerCase();
      const matchedIndex = statusOrder.findIndex(({ matchers }) => matchers.includes(normalizedStatus));

      if (matchedIndex >= 0) {
        buckets[matchedIndex].push(task);
      } else {
        uncategorized.push(task);
      }
    });

    const sections = statusOrder
      .map((section, index) => ({
        ...section,
        tasks: buckets[index].slice().sort((a, b) => {
          const dateA = a.end_date || a.due_date || '';
          const dateB = b.end_date || b.due_date || '';
          return dateA.localeCompare(dateB);
        }),
      }))
      .filter((section) => section.tasks.length > 0);

    if (uncategorized.length > 0) {
      sections.push({
        key: 'other',
        label: 'Other',
        tasks: uncategorized.slice().sort((a, b) => {
          const dateA = a.end_date || a.due_date || '';
          const dateB = b.end_date || b.due_date || '';
          return dateA.localeCompare(dateB);
        }),
      });
    }

    return sections;
  }, [otherTasks]);


  const handleStartDirectChat = async () => {
    if (!userId) return;

    try {
      const { data } = await startDirectConversation(userId);
      navigate(`/chat/${data.id}`);
    } catch (error) {
      console.error("Unable to start direct chat", error);
    }
  };

  const getProjectName = (projectId) => {
    const project = projects.find((p) => p.id === projectId);
    return project ? project.name : `Project ${projectId}`;
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center py-16">
        <div className="premium-loader-card shell-panel shell-panel-strong rounded-[32px] px-8 py-10 text-center">
          <div className="premium-loader-mark mx-auto">
            <span />
          </div>
          <div className="premium-loader-track mt-6 w-56">
            <div className="premium-loader-bar animate-[shell-loader_1.45s_ease-in-out_infinite]" />
          </div>
          <p className="mt-5 text-sm font-medium text-slate-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12 pt-4 sm:pt-6">
      <div className="mx-auto max-w-[1280px] space-y-6">
        {/* Profile Header */}
        <div className="shell-panel shell-panel-strong overflow-hidden rounded-[38px]">
          <div className="relative h-56 overflow-hidden bg-[linear-gradient(135deg,rgba(15,23,42,0.9),rgba(52,109,255,0.58),rgba(103,232,249,0.34))] md:h-64">
            {/* Cover Photo */}
            {user?.cover_photo && user.cover_photo !== 'null' && (
              <img
                src={user.cover_photo}
                alt="Cover"
                className="absolute inset-0 w-full h-full object-cover"
              loading="lazy" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,17,32,0.08),rgba(7,17,32,0.72))]" />
            <div className="absolute left-6 top-6 flex flex-wrap items-center gap-2">
              <span className="shell-chip border-white/25 bg-slate-950/35 text-white/88 shadow-none backdrop-blur-md">
                <span className="shell-chip-dot" />
                Profile Console
              </span>
              <span className="shell-chip border-white/25 bg-white/10 text-white/82 shadow-none backdrop-blur-md">
                {viewingOtherProfile ? "Team profile" : "Personal profile"}
              </span>
            </div>

            {/* Cover Photo Edit Button */}
            {editMode && !viewingOtherProfile && (
              <label className="absolute bottom-5 right-5 cursor-pointer rounded-full border border-white/30 bg-white/15 p-2.5 text-white shadow-[0_18px_36px_rgb(15_23_42_/_0.22)] backdrop-blur-md hover:bg-white/24">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-theme" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                <input type="file" name="cover_photo" className="hidden" onChange={handleFileChange} accept="image/*" />
              </label>
            )}
          </div>

          <div className="relative px-5 pb-8 sm:px-8">
            <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
              {/* Profile Picture */}
              <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
              <div className="relative group -mt-16 sm:-mt-20">
                <div className="absolute inset-0 rounded-full bg-theme/20 blur-xl -z-10"></div>
                {showProfileImage ? (
                  <img
                    src={user.profile_picture}
                    alt="Profile"
                    className="h-32 w-32 rounded-full border-4 border-white/90 object-cover shadow-[0_26px_54px_rgb(15_23_42_/_0.18)] transition-all duration-300 group-hover:scale-[1.03] md:h-40 md:w-40"
                    loading="lazy"
                    onError={() => setProfileImageFailed(true)}
                  />
                ) : (
                  <div
                    className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-white/90 text-5xl font-bold shadow-[0_26px_54px_rgb(15_23_42_/_0.18)] transition-all duration-300 group-hover:scale-[1.03] md:h-40 md:w-40 md:text-6xl"
                    style={buildAvatarStyle(avatarPreviewColor)}
                  >
                    {initial}
                  </div>
                )}
                {editMode && !viewingOtherProfile && (
                  <label className="absolute bottom-2 right-2 cursor-pointer rounded-full border border-white/70 bg-white/92 p-2 shadow-[0_14px_26px_rgb(15_23_42_/_0.14)] hover:bg-white">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-theme" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                    </svg>
                    <input type="file" name="profile_picture" className="hidden" onChange={handleFileChange} accept="image/*" />
                  </label>
                )}
              </div>

              {/* User Info */}
              <div className="flex-1 text-center sm:text-left">
                <div className="mb-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="shell-chip">
                    <span className="shell-chip-dot" />
                    {currentRoleLabel}
                  </span>
                  {user?.date_of_birth && (
                    <span className="shell-chip">
                      Born {new Date(user.date_of_birth).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
                <h1 className="text-[clamp(2rem,8vw,3rem)] font-semibold tracking-[-0.05em] text-slate-950 md:text-5xl">
                  {user ? displayName : "Loading..."}
                </h1>
                <p className="mt-2 break-all text-base font-medium text-theme sm:text-lg">{user?.email}</p>
                {user?.phone_number && (
                  <p className="mt-1 text-sm text-slate-500">{user.phone_number}</p>
                )}
                {user?.bio && (
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">{user.bio}</p>
                )}
                <div className="mt-3 flex flex-wrap justify-center gap-3 text-sm sm:justify-start">
                  {user?.social_links?.linkedin && <a className="font-medium text-theme hover:underline" href={user.social_links.linkedin} target="_blank" rel="noreferrer">LinkedIn</a>}
                  {user?.social_links?.github && <a className="font-medium text-theme hover:underline" href={user.social_links.github} target="_blank" rel="noreferrer">GitHub</a>}
                  {user?.social_links?.twitter && <a className="font-medium text-theme hover:underline" href={user.social_links.twitter} target="_blank" rel="noreferrer">Twitter</a>}
                  {user?.social_links?.website && <a className="font-medium text-theme hover:underline" href={user.social_links.website} target="_blank" rel="noreferrer">Website</a>}
                </div>
                <div className="mt-5 flex flex-wrap justify-center gap-3 sm:justify-start">
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/72 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_14px_28px_rgb(15_23_42_/_0.06)]">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-theme mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" />
                    </svg>
                    <span>{teams.length} Teams</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/72 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_14px_28px_rgb(15_23_42_/_0.06)]">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-theme mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2H5a1 1 0 010-2h12a2 2 0 001-2V4a2 2 0 00-2-2H6a2 2 0 00-2 2z" clipRule="evenodd" />
                    </svg>
                    <span>{projects.length} Projects</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/72 px-4 py-2 text-sm font-semibold text-slate-700 shadow-[0_14px_28px_rgb(15_23_42_/_0.06)]">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-theme mr-2" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                    </svg>
                    <span>{nonGeneralTasks.length} Tasks</span>
                  </div>
                </div>
              </div>
              </div>

              {/* Edit Button */}
              {!editMode && !viewingOtherProfile && (
                <button
                  onClick={() => setEditMode(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/75 bg-[linear-gradient(135deg,var(--theme-color),var(--theme-secondary))] px-6 py-3 text-sm font-semibold text-white shadow-[0_24px_44px_rgb(52_109_255_/_0.22)] hover:brightness-110 sm:w-auto"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                  </svg>
                  Edit Profile
                </button>
              )}

              {!editMode && viewingOtherProfile && (
                <button
                  onClick={handleStartDirectChat}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/75 bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-[0_24px_44px_rgb(15_23_42_/_0.18)] hover:brightness-110 sm:w-auto"
                >
                  Text
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Tabs */}
        <div className="shell-panel shell-panel-strong rounded-[28px] p-2">
          <div className="scrollbar-hide flex gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab('overview')}
              className={`rounded-[18px] px-5 py-3 font-semibold whitespace-nowrap transition-all ${activeTab === 'overview' ? 'bg-slate-950 text-white shadow-[0_18px_34px_rgb(15_23_42_/_0.18)]' : 'text-slate-500 hover:bg-white/72 hover:text-slate-800'}`}
            >
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                </svg>
                Overview
              </div>
            </button>
            <button
              onClick={() => setActiveTab('posts')}
              className={`rounded-[18px] px-5 py-3 font-semibold whitespace-nowrap transition-all ${activeTab === 'posts' ? 'bg-slate-950 text-white shadow-[0_18px_34px_rgb(15_23_42_/_0.18)]' : 'text-slate-500 hover:bg-white/72 hover:text-slate-800'}`}
            >
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
                Posts
              </div>
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`rounded-[18px] px-5 py-3 font-semibold whitespace-nowrap transition-all ${activeTab === 'tasks' ? 'bg-slate-950 text-white shadow-[0_18px_34px_rgb(15_23_42_/_0.18)]' : 'text-slate-500 hover:bg-white/72 hover:text-slate-800'}`}
            >
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
                Tasks
              </div>
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`rounded-[18px] px-5 py-3 font-semibold whitespace-nowrap transition-all ${activeTab === 'teams' ? 'bg-slate-950 text-white shadow-[0_18px_34px_rgb(15_23_42_/_0.18)]' : 'text-slate-500 hover:bg-white/72 hover:text-slate-800'}`}
            >
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v1h8v-1zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-1a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v1h-3zM4.75 12.094A5.973 5.973 0 004 15v1H1v-1a3 3 0 013.75-2.906z" />
                </svg>
                Teams
              </div>
            </button>
            <button
              onClick={() => setActiveTab('projects')}
              className={`rounded-[18px] px-5 py-3 font-semibold whitespace-nowrap transition-all ${activeTab === 'projects' ? 'bg-slate-950 text-white shadow-[0_18px_34px_rgb(15_23_42_/_0.18)]' : 'text-slate-500 hover:bg-white/72 hover:text-slate-800'}`}
            >
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Projects
              </div>
            </button>
            <button
              onClick={() => setActiveTab('keka')}
              className={`rounded-[18px] px-5 py-3 font-semibold whitespace-nowrap transition-all ${activeTab === 'keka' ? 'bg-slate-950 text-white shadow-[0_18px_34px_rgb(15_23_42_/_0.18)]' : 'text-slate-500 hover:bg-white/72 hover:text-slate-800'}`}
            >
              <div className="flex items-center gap-2">
                <Squares2X2Icon className="h-5 w-5" />
                Keka
              </div>
            </button>
          </div>
        </div>

        <div className="shell-panel shell-panel-strong rounded-[32px] p-6 sm:p-7">
            {activeTab === 'overview' && (
              <div className="space-y-8">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="rounded-[24px] border border-sky-100 bg-[linear-gradient(135deg,rgba(232,244,255,0.92),rgba(213,232,255,0.72))] p-6 shadow-[0_20px_40px_rgb(59_130_246_/_0.08)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-blue-600 font-medium">Active Tasks</p>
                        <h3 className="text-2xl font-bold text-blue-800 mt-1">{nonGeneralTasks.length}</h3>
                      </div>
                      <div className="rounded-2xl bg-white/70 p-3 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.8)]">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-blue-600">
                      <ArrowPathIcon className="h-4 w-4 mr-1" />
                      <span>{dueTodayTasks.length} due today</span>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-fuchsia-100 bg-[linear-gradient(135deg,rgba(250,240,255,0.92),rgba(237,228,255,0.72))] p-6 shadow-[0_20px_40px_rgb(168_85_247_/_0.08)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-purple-600 font-medium">Team Projects</p>
                        <h3 className="text-2xl font-bold text-purple-800 mt-1">{projects.length}</h3>
                      </div>
                      <div className="rounded-2xl bg-white/70 p-3 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.8)]">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-purple-600">
                      <FolderIcon className="h-4 w-4 mr-1" />
                      <span>{teams.length} teams involved</span>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-emerald-100 bg-[linear-gradient(135deg,rgba(235,253,242,0.92),rgba(214,248,226,0.72))] p-6 shadow-[0_20px_40px_rgb(16_185_129_/_0.08)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-green-600 font-medium">Recent Posts</p>
                        <h3 className="text-2xl font-bold text-green-800 mt-1">{posts.length}</h3>
                      </div>
                      <div className="rounded-2xl bg-white/70 p-3 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.8)]">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center text-sm text-green-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Last post {posts.length > 0 ? new Date(posts[0].created_at).toLocaleDateString() : 'never'}</span>
                    </div>
                  </div>
                </div>

                {generalTasks.length > 0 && (
                  <div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-4">General Tasks</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {generalTasks.map((task) => (
                        <div key={task.id} className="p-4 bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-medium text-gray-800">{task.title || task.task_id}</h3>
                              <div className="flex items-center mt-1 space-x-3">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${getStatusClasses(task.status)}`}>
                                  {task.status}
                                </span>
                                {(task.end_date || task.due_date) && (
                                  <span className="text-xs text-gray-500 flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                    </svg>
                                    Due {new Date(task.end_date || task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Recent Activity */}
                <div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-4">Recent Activity</h3>
                  <div className="bg-white rounded-lg border border-gray-100 p-4">
                    {tasks.length > 0 || posts.length > 0 ? (
                      <div className="space-y-4">
                        {[...tasks.slice(0, 3), ...posts.slice(0, 3)]
                          .sort((a, b) => new Date(b.created_at || b.start_date) - new Date(a.created_at || a.start_date))
                          .slice(0, 5)
                          .map((item) => (
                            <div key={item.id} className="flex items-start pb-4 border-b border-gray-100 last:border-0 last:pb-0">
                              <div className="bg-theme/10 p-2 rounded-lg mr-4">
                                {item.message ? (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-theme" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                  </svg>
                                ) : (
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-theme" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                  </svg>
                                )}
                              </div>
                              <div className="flex-1">
                                <h4 className="font-medium text-gray-800">
                                  {item.message ? 'Posted an update' : `Task ${item.task_id} assigned`}
                                </h4>
                                <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                                  {item.message || item.description || 'No description'}
                                </p>
                                <div className="flex items-center text-xs text-gray-400 mt-2">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {new Date(item.created_at || item.start_date).toLocaleString()}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="mt-2 text-gray-500">No recent activity</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'posts' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">Recent Posts</h2>
                  <button
                    onClick={() => navigate('/posts')}
                    className="px-4 py-2 bg-theme text-white rounded-lg hover:bg-theme/90 transition flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                    New Post
                  </button>
                </div>
                {posts.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {posts.map((post) => {
                      const likesCount = typeof post.likes_count === 'number' ? post.likes_count : 0;

                      return (
                        <div key={post.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow duration-300">
                          {post.image_url && (
                            <img
                              src={post.image_url}
                              alt="Post"
                              className="w-full h-48 object-cover"
                            loading="lazy" />
                          )}
                          <div className="p-5">
                            <div className="flex items-center text-sm text-gray-500 mb-2">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <p className="text-gray-700 line-clamp-3">{post.message}</p>
                            {likesCount > 0 && (
                              <div className="mt-3 flex items-center text-sm text-gray-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-rose-400 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                                </svg>
                                <span className="font-medium text-gray-700">
                                  {likesCount} {likesCount === 1 ? 'Like' : 'Likes'}
                                </span>
                              </div>
                            )}
                            <button onClick={() => navigate('/posts')} className="mt-3 text-theme hover:text-theme/90 text-sm font-medium flex items-center">
                              Read more
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-700">No posts yet</h3>
                    <p className="mt-1 text-gray-500">Share your thoughts with your team!</p>
                    <button
                      onClick={() => navigate('/posts')}
                      className="mt-4 px-4 py-2 bg-theme text-white rounded-lg hover:bg-theme/90 transition flex items-center gap-2 mx-auto"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                      </svg>
                      Create your first post
                    </button>
                  </div>
                  )}
              </div>
            )}

            {activeTab === 'tasks' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">My Tasks</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                  {taskStats.map((stat) => (
                    <div key={stat.label} className="p-4 bg-white border border-gray-100 rounded-lg shadow-sm">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-gray-500">{stat.label}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stat.accent}`}>{stat.value}</span>
                      </div>
                      <p className={`mt-3 text-2xl font-semibold ${stat.tone}`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                {nonGeneralTasks.length > 0 ? (
                  <>
                    {dueTodayTasks.length > 0 && (
                      <div className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-xl font-semibold text-gray-700">Due Today</h3>
                          <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                            {dueTodayTasks.length} urgent
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {dueTodayTasks.map((task) => (
                            <div key={task.id} className="p-4 bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition">
                              <div className="flex items-start justify-between">
                                <div>
                                  <h3 className="font-medium text-gray-800">{task.task_id}</h3>
                                  <div className="flex items-center mt-1 space-x-3">
                                    <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${getStatusClasses(task.status)}`}>
                                      {task.status}
                                    </span>
                                    <span className="text-xs text-gray-500 flex items-center">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                      </svg>
                                      Due today
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleTaskNavigation(task)}
                                  className="inline-flex items-center text-sm font-medium text-theme hover:text-theme/80"
                                >
                                  View Task
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M12.293 2.293a1 1 0 011.414 0L18 6.586a1 1 0 01-1.414 1.414L14 5.414V17a1 1 0 11-2 0V5.414l-2.586 2.586A1 1 0 018 6.586l4.293-4.293z" />
                                  </svg>
                                </button>
                              </div>
                              {task.sprint?.project_id && (
                                <div className="mt-2 flex items-center justify-between text-sm">
                                  <span className="flex items-center text-gray-500">
                                    <FolderIcon className="h-4 w-4 mr-1" />
                                    {getProjectName(task.sprint.project_id)}
                                  </span>
                                  <button
                                    onClick={() => navigate(`/projects/${task.sprint.project_id}/dashboard`)}
                                    className="flex items-center text-theme hover:underline"
                                  >
                                    <Squares2X2Icon className="h-4 w-4 mr-1" />Board
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-8">
                      {statusSections.length > 0 ? (
                        statusSections.map((section) => (
                          <div key={section.key}>
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-xl font-semibold text-gray-700">{section.label}</h3>
                              <span className="text-sm text-gray-500">{section.tasks.length} {section.tasks.length === 1 ? 'task' : 'tasks'}</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {section.tasks.map((task) => (
                                <div key={task.id} className="p-4 bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition">
                                  <div className="flex items-start justify-between">
                                    <div>
                                      <h3 className="font-medium text-gray-800">{task.task_id}</h3>
                                      <div className="flex items-center mt-1 space-x-3">
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium capitalize ${getStatusClasses(task.status)}`}>
                                          {task.status}
                                        </span>
                                        {(task.end_date || task.due_date) && (
                                          <span className="text-xs text-gray-500 flex items-center">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                            </svg>
                                            Due {new Date(task.end_date || task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                <button
                                  onClick={() => handleTaskNavigation(task)}
                                  className="inline-flex items-center text-sm font-medium text-theme hover:text-theme/80"
                                >
                                  View Task
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                                    <path d="M12.293 2.293a1 1 0 011.414 0L18 6.586a1 1 0 01-1.414 1.414L14 5.414V17a1 1 0 11-2 0V5.414l-2.586 2.586A1 1 0 018 6.586l4.293-4.293z" />
                                  </svg>
                                </button>
                                  </div>
                                  {task.sprint?.project_id && (
                                    <div className="mt-2 flex items-center justify-between text-sm">
                                      <span className="flex items-center text-gray-500">
                                        <FolderIcon className="h-4 w-4 mr-1" />
                                        {getProjectName(task.sprint.project_id)}
                                      </span>
                                      <button
                                        onClick={() => navigate(`/projects/${task.sprint.project_id}/dashboard`)}
                                        className="flex items-center text-theme hover:underline"
                                      >
                                        <Squares2X2Icon className="h-4 w-4 mr-1" />Board
                                      </button>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <p className="mt-4 text-gray-500">No upcoming tasks</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-12">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-700">No tasks assigned</h3>
                    <p className="mt-1 text-gray-500">You're all caught up!</p>
                  </div>
                )}
                {sortedCompletedTasks.length > 0 && (
                  <div className="mt-10">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-semibold text-gray-700">Recently Completed</h3>
                      <span className="text-sm text-gray-500">{sortedCompletedTasks.length} total</span>
                    </div>
                    <div className="bg-white border border-gray-100 rounded-lg shadow-sm divide-y divide-gray-100">
                      {sortedCompletedTasks.slice(0, 6).map((task) => (
                        <div key={task.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <h4 className="font-medium text-gray-800">{task.title || task.task_id}</h4>
                            <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-gray-500">
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-7.25 7.25a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L8.5 11.086l6.543-6.543a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Completed
                              </span>
                              {(task.end_date || task.due_date) && (
                                <span className="flex items-center gap-1">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                  </svg>
                                  Due {new Date(task.end_date || task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                              {task.sprint?.project_id && (
                                <span className="flex items-center gap-1">
                                  <FolderIcon className="h-4 w-4" />
                                  {getProjectName(task.sprint.project_id)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {task.sprint?.project_id && (
                              <button
                                onClick={() => navigate(`/projects/${task.sprint.project_id}/dashboard`)}
                                className="inline-flex items-center text-sm font-medium text-theme hover:text-theme/80"
                              >
                                View Project
                              </button>
                            )}
                            <button
                              onClick={() => handleTaskNavigation(task)}
                              className="inline-flex items-center text-sm font-medium text-theme hover:text-theme/80"
                            >
                              View Task
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'teams' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">My Teams</h2>
                {teams.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {teams.map((team) => {
                      const teamUsers = asRecordArray(team?.users);
                      return (
                        <div key={team.id} className="border border-gray-100 rounded-lg p-6 hover:shadow-md transition bg-white">
                          <div className="flex items-center mb-4">
                            <div className="flex -space-x-2">
                              {teamUsers.slice(0,3).map((m) => (
                                <Avatar key={m.id} name={m.name} src={m.profile_picture} color={m.avatar_color} />
                              ))}
                              {teamUsers.length > 3 && (
                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-500 border-2 border-white">
                                  +{teamUsers.length - 3}
                                </div>
                              )}
                            </div>
                            <div className="ml-4">
                              <h3 className="font-bold text-gray-800">{team.name}</h3>
                              <span className="text-xs text-gray-500">{team.role}</span>
                            </div>
                          </div>
                          <div className="text-sm text-gray-500 mb-2">{teamUsers.length} members</div>
                          <button
                            onClick={() => navigate('/teams', { state: { teamId: team.id } })}
                            className="mt-4 w-full py-2 text-sm font-medium text-theme hover:text-theme border border-theme/20 rounded-lg hover:bg-theme/10 transition"
                          >
                            View Team
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-700">No team memberships</h3>
                    <p className="mt-1 text-gray-500">Join or create a team to collaborate</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'projects' && (
              <div>
                <h2 className="text-2xl font-bold text-gray-800 mb-6">My Projects</h2>
                {projects.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects.map((project) => {
                      const projectMembers = asRecordArray(project?.members);
                      return (
                        <div key={project.id} className="border border-gray-100 rounded-lg p-6 hover:shadow-md transition bg-white">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-gray-800">{project.name}</h3>
                            <span className="text-xs px-2 py-1 bg-theme/10 text-theme rounded-full">{project.role}</span>
                          </div>
                          <p className="text-sm text-gray-500 mb-6 line-clamp-2">{project.description || 'No description provided.'}</p>
                          <div className="flex justify-between items-center">
                            <div className="flex -space-x-2">
                              {projectMembers.slice(0,3).map((m) => (
                                <Avatar key={m.id} name={m.name} src={m.profile_picture} color={m.avatar_color} size="sm" />
                              ))}
                              {projectMembers.length > 3 && (
                                <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500">
                                  +{projectMembers.length - 3}
                                </div>
                              )}
                            </div>
                            {project.end_date && (
                              <div className="text-xs text-gray-500">
                                Due {new Date(project.end_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => navigate(`/projects/${project.id}/dashboard`)}
                            className="mt-4 w-full py-2 text-sm font-medium text-theme hover:text-theme border border-theme/20 rounded-lg hover:bg-theme/10 transition"
                          >
                            View Project
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-700">No projects assigned</h3>
                    <p className="mt-1 text-gray-500">Get started by joining a project</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'keka' && (
              <div className="space-y-8">
                <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-800">Keka Integration</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Connect your Keka account to surface attendance logs, hours, and employee details.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleKekaRefresh}
                        disabled={kekaRefreshing || !keka.connected}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-theme/20 text-theme hover:bg-theme/10 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ArrowPathIcon className={`h-4 w-4 ${kekaRefreshing ? "animate-spin" : ""}`} />
                        Refresh Data
                      </button>
                    </div>
                  </div>

                  <form onSubmit={handleKekaSave} className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Keka Base URL</label>
                      <input
                        type="text"
                        name="base_url"
                        value={kekaForm.base_url}
                        onChange={handleKekaChange}
                        placeholder="https://yourcompany.keka.com"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label>
                      <input
                        type="text"
                        name="employee_id"
                        value={kekaForm.employee_id}
                        onChange={handleKekaChange}
                        placeholder="EMP000123"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                      <input
                        type="password"
                        name="api_key"
                        value={kekaForm.api_key}
                        onChange={handleKekaChange}
                        placeholder={keka.api_key_masked ? `Saved (${keka.api_key_masked})` : "Paste your API key"}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none"
                        required
                      />
                    </div>
                    <div className="md:col-span-3 flex flex-wrap items-center gap-3">
                      <button
                        type="submit"
                        disabled={kekaSaving}
                        className="px-5 py-2 bg-theme text-white rounded-lg hover:bg-theme/90 transition disabled:opacity-50"
                      >
                        {kekaSaving ? "Saving..." : "Save & Sync"}
                      </button>
                      {keka.last_synced_at && (
                        <span className="text-sm text-gray-500">
                          Last synced {new Date(keka.last_synced_at).toLocaleString()}
                        </span>
                      )}
                      {kekaSuccess && <span className="text-sm text-green-600">{kekaSuccess}</span>}
                      {kekaError && <span className="text-sm text-red-600">{kekaError}</span>}
                    </div>
                  </form>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-6 border border-indigo-100">
                    <p className="text-sm text-indigo-600 font-medium">Attendance Logs</p>
                    <h3 className="text-2xl font-bold text-indigo-800 mt-1">{kekaAttendanceLogs.length}</h3>
                    <p className="text-xs text-indigo-600 mt-2">Last 30 days</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-6 border border-emerald-100">
                    <p className="text-sm text-emerald-600 font-medium">Hours Logged</p>
                    <h3 className="text-2xl font-bold text-emerald-800 mt-1">
                      {kekaHoursDisplay !== null ? `${kekaHoursDisplay} hrs` : "—"}
                    </h3>
                    <p className="text-xs text-emerald-600 mt-2">From timesheets</p>
                  </div>
                  <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-6 border border-amber-100">
                    <p className="text-sm text-amber-600 font-medium">Timesheet Entries</p>
                    <h3 className="text-2xl font-bold text-amber-800 mt-1">{kekaTimesheetEntries.length}</h3>
                    <p className="text-xs text-amber-600 mt-2">Last 30 days</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Employee Details</h3>
                    {kekaProfile ? (
                      <div className="space-y-3 text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Name</span>
                          <span className="font-medium text-gray-800">
                            {kekaProfile.fullName || kekaProfile.name || kekaProfile.displayName || "—"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Email</span>
                          <span className="font-medium text-gray-800">{kekaProfile.email || kekaProfile.workEmail || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Department</span>
                          <span className="font-medium text-gray-800">{kekaProfile.department || kekaProfile.departmentName || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Designation</span>
                          <span className="font-medium text-gray-800">{kekaProfile.designation || kekaProfile.jobTitle || "—"}</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No employee details available yet.</p>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Leave Balances</h3>
                    {kekaLeave ? (
                      <div className="space-y-3 text-sm text-gray-600">
                        {extractArray(kekaLeave).length > 0 ? (
                          extractArray(kekaLeave).slice(0, 6).map((leave, index) => (
                            <div key={`${leave.name || leave.type || index}`} className="flex justify-between">
                              <span className="text-gray-500">{leave.name || leave.type || "Leave"}</span>
                              <span className="font-medium text-gray-800">{leave.balance ?? leave.available ?? "—"}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-gray-500">No leave balance data returned.</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Leave balances will appear after sync.</p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-800">Recent Attendance Logs</h3>
                    <span className="text-xs text-gray-500">Showing last 5</span>
                  </div>
                  {kekaAttendanceLogs.length > 0 ? (
                    <div className="space-y-3">
                      {kekaAttendanceLogs.slice(0, 5).map((log, index) => (
                        <div key={log.id || log.logId || index} className="p-3 border border-gray-100 rounded-lg flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{log.date || log.attendanceDate || log.shiftDate || "—"}</p>
                            <p className="text-xs text-gray-500">{log.status || log.attendanceStatus || log.type || "Logged"}</p>
                          </div>
                          <div className="text-xs text-gray-500">
                            {log.inTime || log.checkIn || log.firstIn || "—"} - {log.outTime || log.checkOut || log.lastOut || "—"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {log.totalHours || log.workedHours || log.hours || "—"} hrs
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No attendance logs returned yet.</p>
                  )}
                </div>

                <div className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Raw Keka Payload</h3>
                  <details className="text-sm text-gray-600">
                    <summary className="cursor-pointer text-theme font-medium">View JSON</summary>
                    <pre className="mt-3 whitespace-pre-wrap break-words text-xs bg-gray-50 border border-gray-100 rounded-lg p-4">
                      {JSON.stringify(kekaPayload, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            )}
          </div>
        </div>
      {/* Edit Profile Modal */}
      {editMode && !viewingOtherProfile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-white/30">
            <div className="bg-gradient-to-r from-[var(--theme-color)] to-[var(--theme-color)] p-6 text-white">
              <h3 className="text-2xl font-bold">Edit Profile</h3>
              <p className="opacity-90">Update your personal information</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6" encType="multipart/form-data">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 required-label">First Name</label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 required-label">Last Name</label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 required-label">Date of Birth</label>
                  <input
                    type="date"
                    name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    name="phone_number"
                    value={formData.phone_number || ''}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                  <textarea
                    name="bio"
                    rows={3}
                    value={formData.bio || ''}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Social links</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input type="url" name="social_links.linkedin" placeholder="LinkedIn URL" value={formData.social_links?.linkedin || ''} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none transition" />
                    <input type="url" name="social_links.github" placeholder="GitHub URL" value={formData.social_links?.github || ''} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none transition" />
                    <input type="url" name="social_links.twitter" placeholder="Twitter URL" value={formData.social_links?.twitter || ''} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none transition" />
                    <input type="url" name="social_links.website" placeholder="Website URL" value={formData.social_links?.website || ''} onChange={handleInputChange} className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-theme focus:border-theme focus:outline-none transition" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Profile Picture</label>
                  <div className="mt-1 flex items-center">
                    <label className="inline-block w-full overflow-hidden rounded-lg bg-gray-100 hover:bg-gray-200 transition cursor-pointer">
                      <div className="px-4 py-2 text-sm text-gray-500 flex items-center justify-between">
                        <span>{formData.profile_picture instanceof File ? formData.profile_picture.name : 'Choose file...'}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <input
                        type="file"
                        id="profile_picture"
                        accept="image/*"
                        name="profile_picture"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cover Photo</label>
                  <div className="mt-1 flex items-center">
                    <label className="inline-block w-full overflow-hidden rounded-lg bg-gray-100 hover:bg-gray-200 transition cursor-pointer">
                      <div className="px-4 py-2 text-sm text-gray-500 flex items-center justify-between">
                        <span>{formData.cover_photo instanceof File ? formData.cover_photo.name : 'Choose file...'}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <input
                        type="file"
                        id="cover_photo"
                        name="cover_photo"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Avatar Color</label>
                  <p className="text-xs text-gray-500 mb-3">Used when your profile picture is missing.</p>
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-full border border-white/80 shadow-sm flex items-center justify-center text-sm font-semibold"
                      style={buildAvatarStyle(formData.avatar_color)}
                    >
                      {getAvatarInitial(formData.first_name || displayName || user?.email)}
                    </div>
                    <input
                      type="color"
                      name="avatar_color"
                      value={formData.avatar_color}
                      onChange={handleInputChange}
                      className="w-16 h-10 p-0 border-0 bg-transparent cursor-pointer rounded-lg overflow-hidden"
                    />
                    <div className="flex gap-2">
                      {Object.entries(COLOR_MAP).map(([name, color]) => (
                        <button
                          key={`avatar-${name}`}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, avatar_color: color }))}
                          className="w-6 h-6 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-label={`${name} avatar color`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex justify-end space-x-3 md:col-span-2">
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-theme text-white rounded-lg hover:bg-theme/90 focus:outline-none focus:ring-2 focus:ring-theme focus:ring-offset-2 transition"
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global styles */}
      <style>{`
        @keyframes float {
          0% { transform: translateY(0) translateX(0); }
          50% { transform: translateY(-20px) translateX(10px); }
          100% { transform: translateY(0) translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default Profile;
