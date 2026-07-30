import { api } from './client';
import type {
  AccessSession,
  ApiEnvelope,
  ApiMeta,
  AuthSession,
  CalendarEvent,
  CallSession,
  Comment,
  CollectionResult,
  Conversation,
  Department,
  EntityRecord,
  EventReminder,
  HomeData,
  LearningCheckpoint,
  LearningGoal,
  Message,
  MobileConfig,
  DemoManifest,
  MobileSession,
  Notification,
  PdfDocument,
  PdfOperation,
  PortfolioData,
  PortfolioFeature,
  PortfolioProfile,
  PortfolioProject,
  Post,
  Project,
  Sprint,
  Task,
  TaskStatus,
  Team,
  TeamInsights,
  User,
  WorkLog,
  WorkLogInput,
  WorkOptions,
} from './types';

const COLLECTION_KEYS = [
  'data',
  'items',
  'results',
  'users',
  'projects',
  'teams',
  'departments',
  'notifications',
  'conversations',
  'messages',
  'events',
  'documents',
  'bookmarks',
  'records',
] as const;

export function normalizeCollection<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of COLLECTION_KEYS) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  return [];
}

export function unwrapData<T>(payload: ApiEnvelope<T> | T): T {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return (payload as ApiEnvelope<T>).data;
  }
  return payload as T;
}

async function collection<T>(path: string, params: Record<string, unknown> = {}): Promise<CollectionResult<T>> {
  const response = await api.get<ApiEnvelope<unknown> | unknown>(path, { params });
  const payload = response.data;
  const raw = unwrapData(payload);
  const envelopeMeta = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as ApiEnvelope<unknown>).meta
    : undefined;
  const embeddedMeta = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? ((raw as Record<string, unknown>).pagination as ApiMeta | undefined)
    : undefined;
  return { data: normalizeCollection<T>(raw), meta: envelopeMeta || embeddedMeta, raw };
}

async function create<T>(path: string, body: unknown) {
  const response = await api.post<ApiEnvelope<T> | T>(path, body);
  return unwrapData(response.data);
}

async function update<T>(path: string, body: unknown) {
  const response = await api.patch<ApiEnvelope<T> | T>(path, body);
  return unwrapData(response.data);
}

export const endpoints = {
  async config() {
    const response = await api.get<ApiEnvelope<MobileConfig>>('/mobile_config');
    return unwrapData(response.data);
  },
  async login(email: string, password: string) {
    const response = await api.post<ApiEnvelope<AuthSession>>('/auth/login', {
      auth: { email, password, device_name: 'Nexus Hub mobile' },
    });
    return unwrapData(response.data);
  },
  async google(idToken: string) {
    const response = await api.post<ApiEnvelope<AuthSession>>('/auth/google', {
      id_token: idToken,
      device_name: 'Nexus Hub mobile',
    });
    return unwrapData(response.data);
  },
  async demo() {
    const response = await api.post<ApiEnvelope<AuthSession>>('/auth/demo', {
      device_name: 'Nexus Hub mobile demo',
    });
    return unwrapData(response.data);
  },
  async signup(input: { first_name: string; last_name: string; email: string; password: string; password_confirmation: string }) {
    return create<{ user: User; confirmation_required: boolean }>('/auth/signup', { auth: input });
  },
  async forgotPassword(email: string) {
    return create<{ accepted: boolean }>('/auth/password/forgot', { email });
  },
  async resetPassword(input: { reset_password_token: string; password: string; password_confirmation: string }) {
    return create<{ password_reset: boolean }>('/auth/password/reset', input);
  },
  async logout(refreshToken: string) {
    await api.delete('/auth/logout', { data: { refresh_token: refreshToken } });
  },
  async me() {
    const response = await api.get<ApiEnvelope<User>>('/me');
    return unwrapData(response.data);
  },
  async updateMe(input: Record<string, unknown> | FormData) {
    const response = await api.patch<ApiEnvelope<User>>('/me', input instanceof FormData ? input : { auth: input });
    return unwrapData(response.data);
  },
  async home() {
    const response = await api.get<ApiEnvelope<HomeData>>('/home');
    return unwrapData(response.data);
  },
  async resetAdminUserPassword(userId: number, input: { password: string; password_confirmation: string }) {
    const response = await api.patch<ApiEnvelope<{ message: string }>>(`/admin/users/${userId}/password`, { password: input });
    return unwrapData(response.data);
  },
  async portfolio() {
    const response = await api.get<ApiEnvelope<PortfolioData>>('/portfolio');
    return unwrapData(response.data);
  },
  async demoManifest() {
    const response = await api.get<ApiEnvelope<DemoManifest>>('/demo/manifest');
    return unwrapData(response.data);
  },
  async portfolioAdmin() {
    const response = await api.get<ApiEnvelope<PortfolioData>>('/portfolio_admin');
    return unwrapData(response.data);
  },
  async updatePortfolioProfile(input: Partial<PortfolioProfile> | FormData) {
    const body = input instanceof FormData ? input : { portfolio_profile: input };
    const response = await api.patch<ApiEnvelope<PortfolioProfile>>('/portfolio_admin/profile', body);
    return unwrapData(response.data);
  },
  async createPortfolioProject(input: Partial<PortfolioProject> | FormData) {
    const body = input instanceof FormData ? input : { portfolio_project: input };
    return create<PortfolioProject>('/portfolio_admin/projects', body);
  },
  async updatePortfolioProject(id: number, input: Partial<PortfolioProject> | FormData) {
    const body = input instanceof FormData ? input : { portfolio_project: input };
    const response = await api.patch<ApiEnvelope<PortfolioProject>>(`/portfolio_admin/projects/${id}`, body);
    return unwrapData(response.data);
  },
  async deletePortfolioProject(id: number) {
    await api.delete(`/portfolio_admin/projects/${id}`);
  },
  async createPortfolioFeature(projectId: number, input: Partial<PortfolioFeature> | FormData) {
    const body = input instanceof FormData ? input : { portfolio_feature: input };
    return create<PortfolioFeature>(`/portfolio_admin/projects/${projectId}/features`, body);
  },
  async updatePortfolioFeature(id: number, input: Partial<PortfolioFeature> | FormData) {
    const body = input instanceof FormData ? input : { portfolio_feature: input };
    const response = await api.patch<ApiEnvelope<PortfolioFeature>>(`/portfolio_admin/features/${id}`, body);
    return unwrapData(response.data);
  },
  async deletePortfolioFeature(id: number) {
    await api.delete(`/portfolio_admin/features/${id}`);
  },
  async updatePortfolioOrder(input: { projects?: Array<{ id: number; position: number }>; features?: Array<{ id: number; position: number; tour_position?: number }> }) {
    const response = await api.patch<ApiEnvelope<PortfolioData>>('/portfolio_admin/order', input);
    return unwrapData(response.data);
  },
  async activity() {
    const response = await api.get<ApiEnvelope<unknown>>('/activity');
    return unwrapData(response.data);
  },
  async momentum() {
    const response = await api.get<ApiEnvelope<unknown>>('/daily_momentum');
    return unwrapData(response.data);
  },
  async search(query: string) {
    return collection<EntityRecord>('/search', { q: query });
  },
  async projects() {
    const response = await api.get<ApiEnvelope<Project[]>>('/projects', { params: { per_page: 100 } });
    return unwrapData(response.data);
  },
  async project(id: number) {
    const response = await api.get<ApiEnvelope<Project>>(`/projects/${id}`);
    return unwrapData(response.data);
  },
  async createProject(input: Record<string, unknown>) {
    return create<Project>('/projects', { project: input });
  },
  async updateProject(id: number, input: Record<string, unknown>) {
    return update<Project>(`/projects/${id}`, { project: input });
  },
  async deleteProject(id: number) {
    await api.delete(`/projects/${id}`);
  },
  createProjectUser(input: Record<string, unknown>) {
    return create<EntityRecord>('/project_users', { project_user: input });
  },
  updateProjectUser(id: number, input: Record<string, unknown>) {
    return update<EntityRecord>(`/project_users/${id}`, { project_user: input });
  },
  async deleteProjectUser(id: number) {
    await api.delete(`/project_users/${id}`);
  },
  async sprints(projectId: number) {
    const response = await api.get<ApiEnvelope<Sprint[]>>(`/projects/${projectId}/sprints`, { params: { per_page: 100 } });
    return unwrapData(response.data);
  },
  createSprint(input: Record<string, unknown>) { return create<Sprint>('/sprints', { sprint: input }); },
  updateSprint(id: number, input: Record<string, unknown>) { return update<Sprint>(`/sprints/${id}`, { sprint: input }); },
  async deleteSprint(id: number) { await api.delete(`/sprints/${id}`); },
  async importSprintTasks(id: number) { await api.post(`/sprints/${id}/import_tasks`); },
  async exportSprintTasks(id: number) { await api.post(`/sprints/${id}/export_tasks`); },
  async exportSprintLogs(id: number) { await api.post(`/sprints/${id}/export_logs`); },
  async importBacklog(projectId: number) { await api.post('/tasks/import_backlog', { project_id: projectId }); },
  async tasks(params: { mine?: boolean; project_id?: number; sprint_id?: number; status?: string; page?: number; per_page?: number } = {}) {
    const response = await api.get<ApiEnvelope<Task[]>>('/tasks', { params: { per_page: 100, ...params } });
    return response.data;
  },
  async createTask(input: Record<string, unknown>) {
    return create<Task>('/tasks', { task: input });
  },
  async updateTask(id: number, statusOrInput: TaskStatus | Record<string, unknown>) {
    const task = typeof statusOrInput === 'string' ? { status: statusOrInput } : statusOrInput;
    return update<Task>(`/tasks/${id}`, { task });
  },
  async deleteTask(id: number) {
    await api.delete(`/tasks/${id}`);
  },
  async workLogs(page = 1) {
    const response = await api.get<ApiEnvelope<WorkLog[]>>('/work_logs', { params: { page, per_page: 30 } });
    return response.data;
  },
  async createWorkLog(input: WorkLogInput) {
    return create<WorkLog>('/work_logs', { work_log: input });
  },
  async updateWorkLog(id: number, input: WorkLogInput) {
    return update<WorkLog>(`/work_logs/${id}`, { work_log: input });
  },
  async deleteWorkLog(id: number) {
    await api.delete(`/work_logs/${id}`);
  },
  async workOptions() {
    const response = await api.get<ApiEnvelope<WorkOptions>>('/work_options');
    return unwrapData(response.data);
  },
  calendarEvents(params: Record<string, unknown> = {}) {
    return collection<CalendarEvent>('/calendar_events', params);
  },
  createCalendarEvent(input: Record<string, unknown>) {
    return create<unknown>('/calendar_events', { calendar_event: input });
  },
  updateCalendarEvent(id: number, input: Record<string, unknown>) {
    return update<CalendarEvent>(`/calendar_events/${id}`, { calendar_event: input });
  },
  async deleteCalendarEvent(id: number) {
    await api.delete(`/calendar_events/${id}`);
  },
  createEventReminder(calendarEventId: number, input: { channel: string; minutes_before: number }) {
    return create<EventReminder>(`/calendar_events/${calendarEventId}/event_reminders`, { event_reminder: input });
  },
  updateEventReminder(id: number, input: { channel: string; minutes_before: number }) {
    return update<EventReminder>(`/event_reminders/${id}`, { event_reminder: input });
  },
  async deleteEventReminder(id: number) {
    await api.delete(`/event_reminders/${id}`);
  },
  posts(page = 1) {
    return collection<Post>('/posts', { page, per_page: 20 });
  },
  createPost(input: { message: string; image?: { uri: string; name: string; type: string } }) {
    const form = new FormData();
    form.append('post[message]', input.message);
    if (input.image) form.append('post[image]', input.image as never);
    return create<Post>('/posts', form);
  },
  updatePost(id: number, message: string) { return update<Post>(`/posts/${id}`, { post: { message } }); },
  async deletePost(id: number) { await api.delete(`/posts/${id}`); },
  postComments(id: number) { return collection<Comment>(`/posts/${id}/comments`); },
  createComment(id: number, body: string) { return create<Comment>(`/posts/${id}/comments`, { comment: { body } }); },
  async deleteComment(postId: number, id: number) { await api.delete(`/posts/${postId}/comments/${id}`); },
  likePost(id: number) {
    return create<Post>(`/posts/${id}/like`, {});
  },
  async unlikePost(id: number) {
    const response = await api.delete<ApiEnvelope<Post>>(`/posts/${id}/unlike`);
    return unwrapData(response.data);
  },
  teams() { return collection<Team>('/teams'); },
  teamInsights(id: number) { return endpoints.rawResource<TeamInsights>(`/teams/${id}/insights`); },
  createTeam(input: { name: string; description?: string }) { return create<Team>('/teams', { team: input }); },
  updateTeam(id: number, input: { name: string; description?: string }) { return update<Team>(`/teams/${id}`, { team: input }); },
  async deleteTeam(id: number) { await api.delete(`/teams/${id}`); },
  createTeamUser(input: { team_id: number; user_id: number; role: string; status: string }) { return create<EntityRecord>('/team_users', { team_user: input }); },
  updateTeamUser(id: number, input: { role: string; status: string }) { return update<EntityRecord>(`/team_users/${id}`, { team_user: input }); },
  async deleteTeamUser(id: number) { await api.delete(`/team_users/${id}`); },
  createSkillEndorsement(userSkillId: number, teamId: number) { return create<EntityRecord>('/skill_endorsements', { skill_endorsement: { user_skill_id: userSkillId, team_id: teamId } }); },
  async deleteSkillEndorsement(id: number) { await api.delete(`/skill_endorsements/${id}`); },
  learningGoals() { return collection<LearningGoal>('/learning_goals'); },
  createLearningGoal(input: Record<string, unknown>) { return create<LearningGoal>('/learning_goals', { learning_goal: input }); },
  updateLearningGoal(id: number, input: Record<string, unknown>) { return update<LearningGoal>(`/learning_goals/${id}`, { learning_goal: input }); },
  async deleteLearningGoal(id: number) { await api.delete(`/learning_goals/${id}`); },
  createLearningCheckpoint(input: { learning_goal_id: number; title: string; resource_url?: string }) { return create<LearningCheckpoint>('/learning_checkpoints', { learning_checkpoint: input }); },
  updateLearningCheckpoint(id: number, input: { title?: string; resource_url?: string; completed?: boolean }) { return update<LearningCheckpoint>(`/learning_checkpoints/${id}`, { learning_checkpoint: input }); },
  async deleteLearningCheckpoint(id: number) { await api.delete(`/learning_checkpoints/${id}`); },
  users(params: Record<string, unknown> = {}) { return collection<EntityRecord>('/users', { per_page: 100, ...params }); },
  departments() { return collection<Department>('/departments'); },
  async department(id: number) {
    const response = await api.get<ApiEnvelope<Department> | Department>(`/departments/${id}`);
    return unwrapData(response.data);
  },
  createDepartment(input: { name: string; description?: string; manager_id?: number | null }) { return create<Department>('/departments', { department: input }); },
  updateDepartment(id: number, input: { name: string; description?: string; manager_id?: number | null }) { return update<Department>(`/departments/${id}`, { department: input }); },
  async deleteDepartment(id: number) { await api.delete(`/departments/${id}`); },
  async updateDepartmentMembers(id: number, userIds: number[]) {
    const response = await api.patch<ApiEnvelope<{ department: Department; users: EntityRecord[] }> | { department: Department; users: EntityRecord[] }>(`/departments/${id}/update_members`, { user_ids: userIds });
    return unwrapData(response.data);
  },
  knowledgeItems(active?: boolean) { return collection<EntityRecord>('/knowledge_items', { limit: 120, ...(active === undefined ? {} : { active }) }); },
  knowledgeBookmarks() { return collection<EntityRecord>('/knowledge_bookmarks'); },
  createKnowledgeBookmark(input: Record<string, unknown>) {
    return create<EntityRecord>('/knowledge_bookmarks', input);
  },
  async deleteKnowledgeBookmark(id: number) { await api.delete(`/knowledge_bookmarks/${id}`); },
  async markKnowledgeBookmarkReviewed(id: number) {
    const response = await api.post<ApiEnvelope<EntityRecord> | EntityRecord>(`/knowledge_bookmarks/${id}/mark_reviewed`);
    return unwrapData(response.data);
  },
  async archiveKnowledgeItem(id: number) {
    const response = await api.patch<ApiEnvelope<EntityRecord>>(`/knowledge_items/${id}/archive`);
    return unwrapData(response.data);
  },
  vaultItems(params: Record<string, unknown> = {}) { return collection<EntityRecord>('/items', params); },
  issues(projectId: number) { return collection<EntityRecord>('/issues', { project_id: projectId }); },
  createIssue(input: Record<string, unknown>, image?: { uri: string; name: string; type: string }) {
    if (!image) return create<EntityRecord>('/issues', { issue: input });
    const form = new FormData();
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(`issue[${key}]`, String(value));
    });
    form.append('issue[media_files][]', image as never);
    return create<EntityRecord>('/issues', form);
  },
  updateIssue(id: number, input: Record<string, unknown>, image?: { uri: string; name: string; type: string }) {
    if (!image) return update<EntityRecord>(`/issues/${id}`, { issue: input });
    const form = new FormData();
    Object.entries(input).forEach(([key, value]) => {
      if (value !== undefined && value !== null) form.append(`issue[${key}]`, String(value));
    });
    form.append('issue[media_files][]', image as never);
    return update<EntityRecord>(`/issues/${id}`, form);
  },
  async deleteIssue(id: number, projectId: number) { await api.delete(`/issues/${id}`, { params: { project_id: projectId } }); },
  async importIssues(projectId: number, sheet?: string) {
    const response = await api.post<ApiEnvelope<Record<string, unknown>> | Record<string, unknown>>('/issues/import_from_sheet', { project_id: projectId, ...(sheet ? { sheet } : {}) });
    return unwrapData(response.data);
  },
  conversations(page = 1) { return collection<Conversation>('/conversations', { page, per_page: 30 }); },
  async conversation(id: number) {
    const response = await api.get<ApiEnvelope<Conversation>>(`/conversations/${id}`);
    return unwrapData(response.data);
  },
  messages(conversationId: number, before?: number) {
    return collection<Message>(`/conversations/${conversationId}/messages`, { limit: 50, ...(before ? { before_id: before } : {}) });
  },
  createMessage(conversationId: number, form: FormData) {
    return create<Message>(`/conversations/${conversationId}/messages`, form);
  },
  reactToMessage(conversationId: number, messageId: number, emoji: string) {
    return create<Message>(`/conversations/${conversationId}/messages/${messageId}/reactions`, { emoji });
  },
  async removeMessageReaction(conversationId: number, messageId: number, emoji: string) {
    await api.delete(`/conversations/${conversationId}/messages/${messageId}/reactions`, { data: { emoji } });
  },
  async setConversationMuted(id: number, muted: boolean) {
    const response = muted
      ? await api.patch<ApiEnvelope<Conversation>>(`/conversations/${id}/mute`, { duration: 'forever' })
      : await api.delete<ApiEnvelope<Conversation>>(`/conversations/${id}/mute`);
    return unwrapData(response.data);
  },
  startCall(conversationId: number, callType: 'audio' | 'video') {
    return create<{ call_session: CallSession }>(`/conversations/${conversationId}/calls`, { call_type: callType });
  },
  async joinCall(id: number) {
    const response = await api.post<ApiEnvelope<import('./types').LiveKitCredentials>>(`/calls/${id}/join`);
    return unwrapData(response.data);
  },
  async callAction(id: number, action: 'ack_ring' | 'decline' | 'leave' | 'end') {
    const response = await api.post<ApiEnvelope<{ call_session: CallSession }>>(`/calls/${id}/${action}`);
    return unwrapData(response.data);
  },
  startDirectConversation(userId: number) {
    return create<Conversation>('/conversations/start_direct', { user_id: userId });
  },
  pdfDocuments() { return collection<PdfDocument>('/pdf_documents'); },
  async pdfDocument(id: number) {
    const response = await api.get<ApiEnvelope<PdfDocument>>(`/pdf_documents/${id}`);
    return unwrapData(response.data);
  },
  uploadPdf(file: { uri: string; name: string; mimeType?: string | null }, title?: string) {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/pdf' } as never);
    if (title) form.append('title', title);
    return create<PdfDocument>('/pdf_documents', form);
  },
  async renamePdf(id: number, title: string) {
    const response = await api.patch<ApiEnvelope<PdfDocument>>(`/pdf_documents/${id}`, { title });
    return unwrapData(response.data);
  },
  async deletePdf(id: number) { await api.delete(`/pdf_documents/${id}`); },
  createPdfOperation(input: Record<string, unknown> | FormData) {
    return create<PdfOperation>('/pdf_document_operations', input);
  },
  async pdfOperation(id: number) {
    const response = await api.get<ApiEnvelope<PdfOperation>>(`/pdf_document_operations/${id}`);
    return unwrapData(response.data);
  },
  async pdfHistoryAction(id: number, action: 'undo' | 'redo' | 'restore_original') {
    const response = await api.post<ApiEnvelope<PdfDocument>>(`/pdf_documents/${id}/${action}`);
    return unwrapData(response.data);
  },
  notifications(page = 1) {
    return api.get<ApiEnvelope<Notification[]>>('/notifications', { params: { page, per_page: 20 } }).then((response) => response.data);
  },
  async readNotification(id: number) {
    return update<Notification>(`/notifications/${id}/read`, {});
  },
  async readAllNotifications() {
    await api.patch('/notifications/read_all');
  },
  sessions() { return collection<MobileSession>('/mobile_sessions'); },
  async revokeSession(id: number) { await api.delete(`/mobile_sessions/${id}`); },
  async registerDevice(device: Record<string, unknown>) {
    const response = await api.put<ApiEnvelope<EntityRecord>>('/mobile_device', { device });
    return unwrapData(response.data);
  },
  async realtimeToken() {
    const response = await api.post<ApiEnvelope<{ token: string; expires_at: number; url: string }>>('/realtime/token');
    return unwrapData(response.data);
  },
  async startImpersonation(userId: number) {
    return create<AccessSession>('/impersonation', { user_id: userId });
  },
  async stopImpersonation() {
    const response = await api.delete<ApiEnvelope<AccessSession>>('/impersonation');
    return unwrapData(response.data);
  },
  resource(path: string, params: Record<string, unknown> = {}) { return collection<EntityRecord>(path, params); },
  async rawResource<T = unknown>(path: string, params: Record<string, unknown> = {}) {
    const response = await api.get<ApiEnvelope<T>>(path, { params });
    return unwrapData(response.data);
  },
  async kekaRefresh() {
    const response = await api.post<ApiEnvelope<Record<string, unknown>>>('/keka/refresh');
    return unwrapData(response.data);
  },
  createResource(path: string, wrapper: string, input: Record<string, unknown>) {
    return create<EntityRecord>(path, { [wrapper]: input });
  },
  updateResource(path: string, id: number, wrapper: string, input: Record<string, unknown>) {
    return update<EntityRecord>(`${path}/${id}`, { [wrapper]: input });
  },
  async deleteResource(path: string, id: number) { await api.delete(`${path}/${id}`); },
};
