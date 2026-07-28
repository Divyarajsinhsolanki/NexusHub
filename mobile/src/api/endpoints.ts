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
  EntityRecord,
  HomeData,
  Message,
  MobileConfig,
  MobileSession,
  Notification,
  PdfDocument,
  PdfOperation,
  Post,
  Project,
  Sprint,
  Task,
  TaskStatus,
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

async function collection<T>(path: string, params: Record<string, unknown> = {}): Promise<CollectionResult<T>> {
  const response = await api.get<ApiEnvelope<unknown>>(path, { params });
  const raw = response.data.data;
  const embeddedMeta = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? ((raw as Record<string, unknown>).pagination as ApiMeta | undefined)
    : undefined;
  return { data: normalizeCollection<T>(raw), meta: response.data.meta || embeddedMeta, raw };
}

async function create<T>(path: string, body: unknown) {
  const response = await api.post<ApiEnvelope<T>>(path, body);
  return response.data.data;
}

async function update<T>(path: string, body: unknown) {
  const response = await api.patch<ApiEnvelope<T>>(path, body);
  return response.data.data;
}

export const endpoints = {
  async config() {
    const response = await api.get<ApiEnvelope<MobileConfig>>('/mobile_config');
    return response.data.data;
  },
  async login(email: string, password: string) {
    const response = await api.post<ApiEnvelope<AuthSession>>('/auth/login', {
      auth: { email, password, device_name: 'Nexus Hub mobile' },
    });
    return response.data.data;
  },
  async google(idToken: string) {
    const response = await api.post<ApiEnvelope<AuthSession>>('/auth/google', {
      id_token: idToken,
      device_name: 'Nexus Hub mobile',
    });
    return response.data.data;
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
    return response.data.data;
  },
  async updateMe(input: Record<string, unknown> | FormData) {
    const response = await api.patch<ApiEnvelope<User>>('/me', input instanceof FormData ? input : { auth: input });
    return response.data.data;
  },
  async home() {
    const response = await api.get<ApiEnvelope<HomeData>>('/home');
    return response.data.data;
  },
  async activity() {
    const response = await api.get<ApiEnvelope<unknown>>('/activity');
    return response.data.data;
  },
  async momentum() {
    const response = await api.get<ApiEnvelope<unknown>>('/daily_momentum');
    return response.data.data;
  },
  async search(query: string) {
    return collection<EntityRecord>('/search', { q: query });
  },
  async projects() {
    const response = await api.get<ApiEnvelope<Project[]>>('/projects', { params: { per_page: 100 } });
    return response.data.data;
  },
  async project(id: number) {
    const response = await api.get<ApiEnvelope<Project>>(`/projects/${id}`);
    return response.data.data;
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
  async sprints(projectId: number) {
    const response = await api.get<ApiEnvelope<Sprint[]>>(`/projects/${projectId}/sprints`, { params: { per_page: 100 } });
    return response.data.data;
  },
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
    return response.data.data;
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
    return response.data.data;
  },
  teams() { return collection<EntityRecord>('/teams'); },
  users(params: Record<string, unknown> = {}) { return collection<EntityRecord>('/users', { per_page: 100, ...params }); },
  departments() { return collection<EntityRecord>('/departments'); },
  knowledgeItems() { return collection<EntityRecord>('/knowledge_items', { limit: 120 }); },
  knowledgeBookmarks() { return collection<EntityRecord>('/knowledge_bookmarks'); },
  createKnowledgeBookmark(input: Record<string, unknown>) {
    return create<EntityRecord>('/knowledge_bookmarks', input);
  },
  async deleteKnowledgeBookmark(id: number) { await api.delete(`/knowledge_bookmarks/${id}`); },
  async archiveKnowledgeItem(id: number) {
    const response = await api.patch<ApiEnvelope<EntityRecord>>(`/knowledge_items/${id}/archive`);
    return response.data.data;
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
  conversations(page = 1) { return collection<Conversation>('/conversations', { page, per_page: 30 }); },
  async conversation(id: number) {
    const response = await api.get<ApiEnvelope<Conversation>>(`/conversations/${id}`);
    return response.data.data;
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
    return response.data.data;
  },
  startCall(conversationId: number, callType: 'audio' | 'video') {
    return create<{ call_session: CallSession }>(`/conversations/${conversationId}/calls`, { call_type: callType });
  },
  async joinCall(id: number) {
    const response = await api.post<ApiEnvelope<import('./types').LiveKitCredentials>>(`/calls/${id}/join`);
    return response.data.data;
  },
  async callAction(id: number, action: 'ack_ring' | 'decline' | 'leave' | 'end') {
    const response = await api.post<ApiEnvelope<{ call_session: CallSession }>>(`/calls/${id}/${action}`);
    return response.data.data;
  },
  startDirectConversation(userId: number) {
    return create<Conversation>('/conversations/start_direct', { user_id: userId });
  },
  pdfDocuments() { return collection<PdfDocument>('/pdf_documents'); },
  async pdfDocument(id: number) {
    const response = await api.get<ApiEnvelope<PdfDocument>>(`/pdf_documents/${id}`);
    return response.data.data;
  },
  uploadPdf(file: { uri: string; name: string; mimeType?: string | null }, title?: string) {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType || 'application/pdf' } as never);
    if (title) form.append('title', title);
    return create<PdfDocument>('/pdf_documents', form);
  },
  async renamePdf(id: number, title: string) {
    const response = await api.patch<ApiEnvelope<PdfDocument>>(`/pdf_documents/${id}`, { title });
    return response.data.data;
  },
  async deletePdf(id: number) { await api.delete(`/pdf_documents/${id}`); },
  createPdfOperation(input: Record<string, unknown> | FormData) {
    return create<PdfOperation>('/pdf_document_operations', input);
  },
  async pdfOperation(id: number) {
    const response = await api.get<ApiEnvelope<PdfOperation>>(`/pdf_document_operations/${id}`);
    return response.data.data;
  },
  async pdfHistoryAction(id: number, action: 'undo' | 'redo' | 'restore_original') {
    const response = await api.post<ApiEnvelope<PdfDocument>>(`/pdf_documents/${id}/${action}`);
    return response.data.data;
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
    return response.data.data;
  },
  async realtimeToken() {
    const response = await api.post<ApiEnvelope<{ token: string; expires_at: number; url: string }>>('/realtime/token');
    return response.data.data;
  },
  async startImpersonation(userId: number) {
    return create<AccessSession>('/impersonation', { user_id: userId });
  },
  async stopImpersonation() {
    const response = await api.delete<ApiEnvelope<AccessSession>>('/impersonation');
    return response.data.data;
  },
  resource(path: string, params: Record<string, unknown> = {}) { return collection<EntityRecord>(path, params); },
  async rawResource<T = unknown>(path: string, params: Record<string, unknown> = {}) {
    const response = await api.get<ApiEnvelope<T>>(path, { params });
    return response.data.data;
  },
  async kekaRefresh() {
    const response = await api.post<ApiEnvelope<Record<string, unknown>>>('/keka/refresh');
    return response.data.data;
  },
  createResource(path: string, wrapper: string, input: Record<string, unknown>) {
    return create<EntityRecord>(path, { [wrapper]: input });
  },
  updateResource(path: string, id: number, wrapper: string, input: Record<string, unknown>) {
    return update<EntityRecord>(`${path}/${id}`, { [wrapper]: input });
  },
  async deleteResource(path: string, id: number) { await api.delete(`${path}/${id}`); },
};
