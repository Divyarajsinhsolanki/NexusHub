import axios from "axios";
import { toast } from "react-hot-toast";

const getCsrfToken = () => document.querySelector('meta[name="csrf-token"]')?.content;

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    "X-CSRF-Token": getCsrfToken(),
  },
});

// Attach CSRF token before each request
api.interceptors.request.use((config) => {
  const csrfToken = getCsrfToken();
  if (csrfToken) config.headers["X-CSRF-Token"] = csrfToken;
  return config;
});

api.interceptors.response.use(
  response => response,
  async error => {
    const { config, response } = error;

    // NEW GUARD CLAUSE
    if (config?.skipAuthRetry || config?.url.includes("/refresh")) {
      return Promise.reject(error);
    }

    if (response?.status === 403 && response?.data?.error === "demo_read_only") {
      toast.error("This portfolio demo is read-only.");
    }

    if (response?.status === 401 && !config._retry) {
      config._retry = true;
      try {
        await api.post("/refresh");
        return api(config);
      } catch (refreshError) {
        console.warn("Token refresh failed:", refreshError?.message || refreshError);
      }
    }

    return Promise.reject(error);
  }
);


export const normalizeCollectionResponse = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];

  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.users)) return payload.users;
  if (Array.isArray(payload.projects)) return payload.projects;
  if (Array.isArray(payload.departments)) return payload.departments;
  if (Array.isArray(payload.teams)) return payload.teams;
  if (Array.isArray(payload.roles)) return payload.roles;

  return [];
};

const withNormalizedCollection = (request) =>
  request.then((response) => ({
    ...response,
    data: normalizeCollectionResponse(response?.data)
  }));

const DEFAULT_COLLECTION_PER_PAGE = 1000;
const collectionParams = (params = {}) => ({ per_page: DEFAULT_COLLECTION_PER_PAGE, ...params });

// SCHEDULER ENDPOINTS
export const SchedulerAPI = {
  // Sprints
  getLastSprint: (projectId) =>
    api.get("/sprints/last.json", { params: projectId ? { project_id: projectId } : {} }),
  getSprints: (projectId) =>
    withNormalizedCollection(api.get("/sprints.json", { params: projectId ? { project_id: projectId } : {} })),
  createSprint: (projectId, data) =>
    api.post("/sprints.json", { sprint: { ...data, project_id: projectId } }),
  updateSprint: (id, data) => api.put(`/sprints/${id}.json`, { sprint: data }),

  // Developers
  getDevelopers: (params = {}) => withNormalizedCollection(api.get("/developers.json", { params: collectionParams(params) })),

  // Tasks
  getTasks: (params = {}) => withNormalizedCollection(api.get("/tasks.json", { params })),
  createTask: (data) => api.post("/tasks.json", { task: data }),
  updateTask: (id, data) => api.patch(`/tasks/${id}.json`, { task: data }),
  deleteTask: (id) => api.delete(`/tasks/${id}.json`),
  moveTask: (id, newData) => api.patch(`/tasks/${id}.json`, newData),
  toggleTaskStatus: (id, status) => api.patch(`/tasks/${id}.json`, { is_struck: status }),

  // Task Logs
  getTaskLogs: (params = {}) => withNormalizedCollection(api.get('/task_logs.json', { params })),
  createTaskLog: (data) => api.post('/task_logs.json', { task_log: data }),
  bulkCreateTaskLogs: (entries) => api.post('/task_logs/bulk_create.json', { task_logs: entries }),
  deleteSprintTaskLogs: (sprintId) => api.delete('/task_logs/destroy_for_sprint.json', { params: { sprint_id: sprintId } }),
  updateTaskLog: (id, data) => api.patch(`/task_logs/${id}.json`, { task_log: data }),
  deleteTaskLog: (id) => api.delete(`/task_logs/${id}.json`),
  importSprintTasks: (id) => api.post(`/sprints/${id}/import_tasks`),
  importBacklogTasks: (projectId) => api.post('/tasks/import_backlog', { project_id: projectId }),
  exportSprintTasks: (id) => api.post(`/sprints/${id}/export_tasks`),
  exportSprintLogs: (id) => api.post(`/sprints/${id}/export_logs`)
};

// USER ENDPOINTS (existing)
export const signup = (u) => api.post("/signup", u);
export const login = (u) => api.post("/login", u);
export const logout = () => api.delete("/logout");
export const startDemoSession = () => api.post("/demo_session", {}, { skipAuthRetry: true });
export const fetchDemoManifest = () => api.get("/demo/manifest");
export const searchWorkspace = (query, types) => api.get("/search", { params: { q: query, types } });
export const fetchActivity = () => api.get("/activity");
export const fetchKnowledgeItems = (params = {}) => api.get("/knowledge_items", { params });
export const fetchKnowledgePromptRuns = (params = {}) => api.get("/knowledge_prompt_runs", { params });
export const archiveKnowledgeItem = (id) => api.patch(`/knowledge_items/${id}/archive`);
export const fetchPortfolio = () => api.get("/portfolio", { skipAuthRetry: true });
export const fetchPortfolioAdmin = () => api.get("/admin/portfolio");
export const updatePortfolioProfile = (data) => api.patch("/admin/portfolio/profile", data, { headers: { "Content-Type": "multipart/form-data" } });
export const createPortfolioProject = (data) => api.post("/admin/portfolio/projects", data, { headers: { "Content-Type": "multipart/form-data" } });
export const updatePortfolioProject = (id, data) => api.patch(`/admin/portfolio/projects/${id}`, data, { headers: { "Content-Type": "multipart/form-data" } });
export const deletePortfolioProject = (id) => api.delete(`/admin/portfolio/projects/${id}`);
export const createPortfolioFeature = (projectId, data) => api.post(`/admin/portfolio/projects/${projectId}/features`, data, { headers: { "Content-Type": "multipart/form-data" } });
export const updatePortfolioFeature = (id, data) => api.patch(`/admin/portfolio/features/${id}`, data, { headers: { "Content-Type": "multipart/form-data" } });
export const deletePortfolioFeature = (id) => api.delete(`/admin/portfolio/features/${id}`);
export const updatePortfolioOrder = (data) => api.patch("/admin/portfolio/order", data);
export const fetchUserInfo = () => api.get("/view_profile");
export const updateUserInfo = (d) => api.post("/update_profile", d);
export const fetchUserProfile = (id) => api.get(`/users/${id}.json`);
export const saveKekaCredentials = (data) => api.post("/keka/credentials", { keka: data, sync: true });
export const fetchKekaProfile = () => api.get("/keka/profile");
export const refreshKekaProfile = () => api.post("/keka/refresh");
export const requestPasswordReset = (email) => api.post("/password/forgot", { password: { email } });
export const resetPassword = (payload) => api.post("/password/reset", { password: payload });
export const getUsers = (params = {}) => withNormalizedCollection(api.get('/users.json', { params: collectionParams(params) }));
export const updatePresence = () => api.post('/users/presence');
export const createUser = (data) => api.post('/users.json', { user: data });
export const deleteUser = (id) => api.delete(`/users/${id}.json`);
export const updateUser = (id, data) =>
  api.patch(`/users/${id}.json`, data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const fetchDepartments = () => withNormalizedCollection(api.get('/departments.json'));
export const createDepartment = (data) => api.post('/departments.json', { department: data });
export const updateDepartment = (id, data) => api.patch(`/departments/${id}.json`, { department: data });
export const deleteDepartment = (id) => api.delete(`/departments/${id}.json`);
export const fetchDepartmentMembers = (id) => api.get(`/departments/${id}/members.json`);
export const fetchDepartment = (id) => api.get(`/departments/${id}.json`);
export const updateDepartmentMembers = (id, userIds) => api.patch(`/departments/${id}/update_members.json`, { user_ids: userIds });
export const adminImpersonate = (userId) => api.post('/admin/impersonate', { user_id: userId });

// ISSUE TRACKER
const buildIssuePayload = (raw) => {
  const normalized = {
    ...raw,
    issue_key: raw?.issue_key || raw?.issueKey,
  };
  const files = normalized?.mediaFiles ? Array.from(normalized.mediaFiles) : [];
  if (!files.length) return { issue: normalized };

  const formData = new FormData();
  Object.entries(normalized).forEach(([key, value]) => {
    if (key === 'mediaFiles') return;
    if (Array.isArray(value)) {
      value.forEach((v) => formData.append(`issue[${key}][]`, v));
    } else if (value !== undefined && value !== null) {
      formData.append(`issue[${key}]`, value);
    }
  });
  files.forEach((file) => formData.append('issue[media_files][]', file));
  return formData;
};

export const getIssues = (projectId) => withNormalizedCollection(api.get('/issues.json', { params: { project_id: projectId } }));
export const createIssue = (data) => {
  const payload = buildIssuePayload(data);
  return api.post('/issues.json', payload, payload instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {});
};
export const updateIssue = (id, data) => {
  const payload = buildIssuePayload(data);
  return api.patch(`/issues/${id}.json`, payload, payload instanceof FormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {});
};
export const deleteIssue = (id, projectId) => api.delete(`/issues/${id}.json`, { params: { project_id: projectId } });
export const importIssuesFromSheet = (projectId, sheet = null) =>
  api.post('/issues/import_from_sheet.json', { project_id: projectId, ...(sheet ? { sheet } : {}) });

// POST ENDPOINTS (existing)
export const fetchPosts = (id) => withNormalizedCollection(api.get('/posts', { params: id ? { user_id: id } : {} }));
export const createPost = (d) =>
  api.post("/posts", d, { headers: { "Content-Type": "multipart/form-data" } });
export const updatePost = (i, d) =>
  api.put(`/posts/${i}`, d, { headers: { "Content-Type": "multipart/form-data" } });
export const deletePost = (i) => api.delete(`/posts/${i}`);
export const likePost = (i) => api.post(`/posts/${i}/like`);
export const unlikePost = (i) => api.delete(`/posts/${i}/unlike`);
export const fetchComments = (postId) => api.get(`/posts/${postId}/comments`);
export const createComment = (postId, data) => api.post(`/posts/${postId}/comments`, data);
export const deleteComment = (postId, commentId) => api.delete(`/posts/${postId}/comments/${commentId}`);


// ITEM ENDPOINTS
export const fetchItems = (params = {}) => api.get('/items.json', { params });
export const createItem = (d) => api.post('/items.json', { item: d });
export const updateItem = (id, d) => api.patch(`/items/${id}.json`, { item: d });
export const deleteItem = (id) => api.delete(`/items/${id}.json`);

// TEAM ENDPOINTS
export const fetchTeams = () => withNormalizedCollection(api.get('/teams.json'));
export const createTeam = (data) => api.post('/teams.json', { team: data });
export const updateTeam = (id, data) => api.patch(`/teams/${id}.json`, { team: data });
export const deleteTeam = (id) => api.delete(`/teams/${id}.json`);
export const addTeamUser = (data) => api.post('/team_users.json', { team_user: data });
export const updateTeamUser = (id, data) => api.patch(`/team_users/${id}.json`, { team_user: data });
export const deleteTeamUser = (id) => api.delete(`/team_users/${id}.json`);
export const leaveTeam = (teamId) => api.delete(`/team_users/leave/${teamId}.json`);
export const fetchRoles = (params = {}) => withNormalizedCollection(api.get('/roles.json', { params: collectionParams(params) }));
export const fetchTeamInsights = (teamId) => api.get(`/teams/${teamId}/insights.json`);
export const createUserSkill = (data) => api.post('/user_skills.json', { user_skill: data });
export const updateUserSkill = (id, data) => api.patch(`/user_skills/${id}.json`, { user_skill: data });
export const deleteUserSkill = (id) => api.delete(`/user_skills/${id}.json`);
export const endorseSkill = (data) => api.post('/skill_endorsements.json', { skill_endorsement: data });
export const revokeSkillEndorsement = (id) => api.delete(`/skill_endorsements/${id}.json`);
export const createLearningGoal = (data) => api.post('/learning_goals.json', { learning_goal: data });
export const deleteLearningGoal = (id) => api.delete(`/learning_goals/${id}.json`);
export const createLearningCheckpoint = (data) => api.post('/learning_checkpoints.json', { learning_checkpoint: data });
export const updateLearningCheckpoint = (id, data) => api.patch(`/learning_checkpoints/${id}.json`, { learning_checkpoint: data });

// PROJECT ENDPOINTS
export const fetchProjects = (params = {}) => withNormalizedCollection(api.get('/projects.json', { params: collectionParams(params) }));
export const createProject = (data) => api.post('/projects.json', { project: data });
export const updateProject = (id, data) => api.patch(`/projects/${id}.json`, { project: data });
export const deleteProject = (id) => api.delete(`/projects/${id}.json`);
export const addProjectUser = (data) => api.post('/project_users.json', { project_user: data });
export const updateProjectUser = (id, data) => api.patch(`/project_users/${id}.json`, { project_user: data });
export const deleteProjectUser = (id) => api.delete(`/project_users/${id}.json`);
export const leaveProject = (projectId) => api.delete(`/project_users/leave/${projectId}.json`);

// PROJECT VAULT ENDPOINTS
// Environments
export const fetchProjectEnvironments = (projectId) => api.get(`/projects/${projectId}/environments.json`);
export const createProjectEnvironment = (projectId, data) => api.post(`/projects/${projectId}/environments.json`, { project_environment: data });
export const updateProjectEnvironment = (projectId, id, data) => api.patch(`/projects/${projectId}/environments/${id}.json`, { project_environment: data });
export const deleteProjectEnvironment = (projectId, id) => api.delete(`/projects/${projectId}/environments/${id}.json`);

// Vault Items
export const fetchProjectVaultItems = (projectId, params = {}) => api.get(`/projects/${projectId}/vault_items.json`, { params });
export const createProjectVaultItem = (projectId, data) => api.post(`/projects/${projectId}/vault_items.json`, { project_vault_item: data });
export const updateProjectVaultItem = (projectId, id, data) => api.patch(`/projects/${projectId}/vault_items/${id}.json`, { project_vault_item: data });
export const deleteProjectVaultItem = (projectId, id) => api.delete(`/projects/${projectId}/vault_items/${id}.json`);

export const fetchDailyMomentum = () => api.get('/daily_momentum');

// PDF DOCUMENTS
export const fetchPdfDocuments = (params = {}) => api.get('/pdf_documents', { params });
export const fetchPdfDocument = (id) => api.get(`/pdf_documents/${id}`);
export const uploadPdfDocument = (file, title, onUploadProgress) => {
  const data = new FormData();
  data.append('file', file);
  if (title) data.append('title', title);
  return api.post('/pdf_documents', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress,
  });
};
export const renamePdfDocument = (id, title) => api.patch(`/pdf_documents/${id}`, { title });
export const deletePdfDocument = (id) => api.delete(`/pdf_documents/${id}`);
export const undoPdfDocument = (id) => api.post(`/pdf_documents/${id}/undo`);
export const redoPdfDocument = (id) => api.post(`/pdf_documents/${id}/redo`);
export const restorePdfDocument = (id) => api.post(`/pdf_documents/${id}/restore_original`);
export const createPdfDocumentOperation = (payload, asset) => {
  if (!asset) return api.post('/pdf_document_operations', payload);

  const data = new FormData();
  data.append('kind', payload.kind);
  if (payload.pdf_document_id) data.append('pdf_document_id', payload.pdf_document_id);
  if (payload.base_version_id) data.append('base_version_id', payload.base_version_id);
  data.append('parameters', JSON.stringify(payload.parameters || {}));
  data.append('asset', asset);
  return api.post('/pdf_document_operations', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const fetchPdfDocumentOperation = (id) => api.get(`/pdf_document_operations/${id}`);

// WORK LOG ENDPOINTS
export const fetchWorkPriorities = () => withNormalizedCollection(api.get('/work_priorities', { params: collectionParams() }));
export const fetchWorkCategories = () => withNormalizedCollection(api.get('/work_categories', { params: collectionParams() }));
export const fetchWorkTags = () => withNormalizedCollection(api.get('/work_tags', { params: collectionParams() }));

export const getWorkLogs = (params = {}) => withNormalizedCollection(api.get('/work_logs', { params: collectionParams(params) }));
export const createWorkLog = (data) => api.post('/work_logs', { work_log: data });
export const updateWorkLog = (id, data) => api.put(`/work_logs/${id}`, { work_log: data });
export const deleteWorkLog = (id) => api.delete(`/work_logs/${id}`);

export const getWorkNote = (date) => api.get('/work_notes', { params: { date } });
export const createWorkNote = (data) => api.post('/work_notes', { work_note: data });
export const updateWorkNote = (id, data) => api.put(`/work_notes/${id}`, { work_note: data });

export const getTables = () => api.get('/admin/tables');
export const getMeta = (table) => api.get(`/admin_meta/${table}`);
export const getRecords = (table, params = {}) => api.get(`/admin/${table}`, { params });
export const createRecord = (table, data) => api.post(`/admin/${table}`, { record: data });
export const updateRecord = (table, id, data) => api.patch(`/admin/${table}/${id}`, { record: data });
export const deleteRecord = (table, id) => api.delete(`/admin/${table}/${id}`);

export const sendContact = (data) => api.post('/contacts', { contact: data });

export const fetchSheetData = (params) => api.get('/sheet', { params });


// CHAT ENDPOINTS
export const fetchConversations = (params = {}) => api.get('/conversations.json', { params });
export const fetchConversation = (id) => api.get(`/conversations/${id}.json`);
export const fetchConversationSummary = (id) => api.get(`/conversations/${id}/summary.json`);
export const createConversation = (data) => api.post('/conversations.json', { conversation: data, participant_ids: data.participant_ids || [] });
export const startDirectConversation = (userId) => api.post('/conversations/start_direct', { user_id: userId });
export const deleteConversation = (id) => api.delete(`/conversations/${id}`);
export const deleteConversationForEveryone = (id, confirmation) =>
  api.delete(`/conversations/${id}/for_everyone`, { data: { confirmation } });
export const sendMessage = (conversationId, formData) =>
  api.post(`/conversations/${conversationId}/messages`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const addMessageReaction = (conversationId, messageId, emoji) =>
  api.post(`/conversations/${conversationId}/messages/${messageId}/reactions`, { message_reaction: { emoji } });
export const removeMessageReaction = (conversationId, messageId, emoji) =>
  api.delete(`/conversations/${conversationId}/messages/${messageId}/reactions`, { params: { emoji } });

// NOTIFICATION ENDPOINTS
export const fetchNotifications = (params = {}) => api.get('/notifications.json', { params });
export const markNotificationRead = (id) => api.post(`/notifications/${id}/mark_read`);
export const markAllNotificationsRead = () => api.post('/notifications/mark_all_read');


// CALENDAR ENDPOINTS
export const fetchCalendarEvents = (params = {}) => api.get('/calendar_events', { params });
export const createCalendarEvent = (data) => api.post('/calendar_events', { calendar_event: data });
export const updateCalendarEvent = (id, data) => api.patch(`/calendar_events/${id}`, { calendar_event: data });
export const rescheduleCalendarEvent = (id, data) => api.patch(`/calendar_events/${id}/reschedule`, data);
export const exportCalendarIcs = () => api.get('/calendar_events/export_ics', { responseType: 'text' });
export const importCalendarIcs = (ics) => api.post('/calendar_events/import_ics', { ics });
export const getCalendarGoogleLink = (id) => api.get(`/calendar_events/${id}/google_link`);
export const deleteCalendarEvent = (id) => api.delete(`/calendar_events/${id}`);
export const createEventReminder = (calendarEventId, data) => api.post(`/calendar_events/${calendarEventId}/event_reminders`, { event_reminder: data });
export const updateEventReminder = (id, data) => api.patch(`/event_reminders/${id}`, { event_reminder: data });
export const deleteEventReminder = (id) => api.delete(`/event_reminders/${id}`);

export default api;
