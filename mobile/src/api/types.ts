export type ApiMeta = {
  current_page?: number;
  next_page?: number | null;
  total_pages?: number;
  total_count?: number;
  per_page?: number;
  unread_count?: number;
  next_cursor?: string | null;
  has_more?: boolean;
  [key: string]: unknown;
};

export type ApiEnvelope<T> = { data: T; meta?: ApiMeta };
export type EntityRecord = Record<string, unknown> & { id: number };

export type Workspace = { id: number; name: string; slug: string };

export type UserPreferences = {
  color_theme?: string;
  dark_mode?: boolean;
  landing_page?: string;
  notification_preferences?: Record<string, boolean>;
};

export type User = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  job_title: string;
  bio?: string | null;
  avatar_color: string;
  color_theme?: string;
  dark_mode?: boolean;
  profile_picture?: string | null;
  demo_account?: boolean;
  roles: string[];
  workspace: Workspace;
  preferences?: UserPreferences;
  permissions?: string[];
  features?: Record<string, boolean>;
  impersonation?: { active: boolean; owner?: Person | null };
};

export type AuthSession = {
  user: User;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: number;
  refresh_token_expires_at: number;
  impersonating?: boolean;
};

export type AccessSession = {
  user: User;
  access_token: string;
  access_token_expires_at: number;
  impersonating: boolean;
};

export type MobileConfig = {
  app_name: string;
  minimum_version: string;
  recommended_version: string;
  maintenance: boolean;
  demo_available?: boolean;
  portfolio_available?: boolean;
  features: Record<string, boolean>;
  web_url: string;
};

export type PortfolioFeature = {
  id: number;
  category: string;
  title: string;
  summary: string;
  demo_path?: string | null;
  alt_text?: string | null;
  screenshot_url?: string | null;
  position?: number;
  tour_position?: number;
  review_notes?: string | null;
  published?: boolean;
};

export type PortfolioCaseStudy = {
  problem?: string | null;
  role?: string | null;
  constraints?: string[];
  decisions?: string[];
  trade_offs?: string[];
  outcomes?: string[];
  [key: string]: unknown;
};

export type PortfolioSeo = {
  title?: string | null;
  description?: string | null;
  canonical_path?: string | null;
  canonical_url?: string | null;
  image_url?: string | null;
  [key: string]: unknown;
};

export type PortfolioProject = {
  id: number;
  title: string;
  slug: string;
  tagline?: string | null;
  summary: string;
  description?: string | null;
  stack: string[];
  metrics?: Array<string | Record<string, unknown>>;
  engineering_highlights?: string[];
  case_study?: PortfolioCaseStudy | null;
  seo?: PortfolioSeo | null;
  repository_url?: string | null;
  live_url?: string | null;
  cover_image_url?: string | null;
  featured?: boolean;
  published?: boolean;
  position?: number;
  features: PortfolioFeature[];
};

export type PortfolioProfile = {
  id?: number;
  full_name: string;
  headline: string;
  location?: string | null;
  summary: string;
  skills: string[];
  metrics?: Array<string | Record<string, unknown>>;
  social_links?: Record<string, string>;
  architecture?: string[];
  engineering_highlights?: string[];
  avatar_url?: string | null;
  resume_url?: string | null;
  published?: boolean;
};

export type PortfolioData = { profile: PortfolioProfile | null; projects: PortfolioProject[]; seo?: PortfolioSeo | null };

export type DemoTourGroup = {
  key: string;
  title: string;
  summary: string;
  route: string;
  step: number;
  review_notes?: string | null;
  screenshot_url?: string | null;
};

export type DemoManifest = {
  workspace: Workspace;
  duration: string;
  total_steps: number;
  recommended_route?: string | null;
  groups: DemoTourGroup[];
};

export type MobileSession = {
  id: number;
  device_name?: string | null;
  current: boolean;
  impersonating: boolean;
  last_used_at?: string | null;
  expires_at: string;
  revoked_at?: string | null;
  created_at: string;
};

export type Person = {
  id: number;
  name: string;
  avatar_color?: string;
  profile_picture?: string | null;
};

export type TaskStatus = 'todo' | 'inprogress' | 'completed';

export type Task = {
  id: number;
  task_id?: string | null;
  title: string;
  description?: string | null;
  type: string;
  status: TaskStatus;
  priority?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  estimated_hours?: string | number | null;
  project_id?: number | null;
  sprint_id?: number | null;
  task_url?: string | null;
  order?: number | null;
  developer_id?: number | null;
  assigned_to_user?: number | null;
  qa_assigned?: string | null;
  internal_qa?: string | null;
  blocker?: boolean;
  demo?: boolean;
  swag_point?: string | number | null;
  story_point?: string | number | null;
  dev_hours?: string | number | null;
  code_review_hours?: string | number | null;
  dev_to_qa_hours?: string | number | null;
  qa_hours?: string | number | null;
  automation_qa_hours?: string | number | null;
  total_hours?: string | number | null;
  assignee?: Person | null;
};

export type HomeData = {
  summary: {
    open_tasks: number;
    due_today: number;
    active_projects: number;
    work_minutes_today: number;
    unread_notifications: number;
  };
  tasks: Task[];
};

export type Project = {
  id: number;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status: 'upcoming' | 'running' | 'completed';
  sprint_count: number;
  task_count: number;
  users?: EntityRecord[];
  sheet_integration_enabled?: boolean;
  sheet_id?: string | null;
  issue_sheet_id?: string | null;
  issue_sheet_name?: string | null;
  qa_mode_enabled?: boolean;
};

export type Sprint = {
  id: number;
  project_id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  progress: number;
  task_count: number;
};

export type WorkOption = { id: number; name: string; color?: string | null };
export type WorkOptions = {
  categories: WorkOption[];
  priorities: WorkOption[];
  tags: Array<{ id: number; name: string }>;
};

export type WorkLog = {
  id: number;
  title: string;
  description?: string | null;
  log_date: string;
  start_time: string;
  end_time: string;
  actual_minutes: number;
  category?: WorkOption | null;
  priority?: WorkOption | null;
  tags: Array<{ id: number; name: string }>;
};

export type WorkLogInput = {
  title: string;
  description?: string;
  log_date: string;
  start_time: string;
  end_time: string;
  actual_minutes: number;
  category_id?: number | null;
  priority_id?: number | null;
  tags: string[];
};

export type CalendarEvent = EntityRecord & {
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  event_type?: string;
  location_or_meet_link?: string | null;
  visibility?: string;
  status?: string;
  recurrence_rule?: string;
  project_id?: number | null;
  project_name?: string | null;
  event_reminders?: EventReminder[];
  google_event_url?: string | null;
};

export type EventReminder = {
  id: number;
  calendar_event_id: number;
  channel: 'in_app' | 'email' | 'slack';
  minutes_before: number;
  send_at?: string | null;
  sent_at?: string | null;
  state?: string;
};

export type TeamMember = EntityRecord & {
  team_user_id: number;
  name: string;
  email: string;
  role: 'admin' | 'member' | 'viewer';
  status: 'invited' | 'requested' | 'accepted' | 'rejected' | 'pending';
  job_title?: string | null;
  availability_status?: string | null;
  availability_label?: string | null;
  current_projects_count?: number;
  avatar_color?: string;
  profile_picture?: string | null;
  skills?: Array<EntityRecord & { name: string; proficiency?: string; proficiency_label?: string; endorsements_count?: number; endorsed_by_current_user?: boolean; current_user_endorsement_id?: number | null }>;
};

export type Team = EntityRecord & {
  name: string;
  description?: string | null;
  users: TeamMember[];
};

export type TeamInsights = {
  team: { id: number; name: string };
  members: TeamMember[];
  skills: Array<{ id: number; name: string }>;
  roles: string[];
  skill_gap?: {
    strengths?: Array<Record<string, string | number>>;
    opportunities?: Array<Record<string, string | number>>;
  };
  team_experts?: Array<Record<string, unknown>>;
  recent_endorsements?: Array<Record<string, unknown>>;
};

export type LearningCheckpoint = EntityRecord & {
  learning_goal_id?: number;
  title: string;
  completed: boolean;
  resource_url?: string | null;
};

export type LearningGoal = EntityRecord & {
  title: string;
  description?: string | null;
  due_date?: string | null;
  progress: number;
  team_id?: number | null;
  days_remaining?: number | null;
  checkpoints: LearningCheckpoint[];
};

export type DepartmentMember = EntityRecord & {
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  job_title?: string | null;
  profile_picture_url?: string | null;
};

export type Department = EntityRecord & {
  name: string;
  description?: string | null;
  users_count: number;
  manager_id?: number | null;
  manager?: { id: number; full_name: string; profile_picture_url?: string | null } | null;
  members_preview?: DepartmentMember[];
  members?: DepartmentMember[];
};

export type Post = EntityRecord & {
  message: string;
  image_url?: string | null;
  created_at: string;
  likes_count: number;
  liked_by_current_user: boolean;
  comments_count: number;
  comments?: Comment[];
  user: { id: number; first_name: string; last_name: string; profile_picture?: string | null };
};

export type Comment = EntityRecord & {
  body: string;
  created_at: string;
  can_delete?: boolean;
  user: { id: number; first_name: string; last_name: string; profile_picture?: string | null };
};

export type Conversation = EntityRecord & {
  name?: string;
  title?: string;
  conversation_type?: string;
  muted?: boolean;
  unread_count?: number;
  last_message?: EntityRecord | null;
  participants?: EntityRecord[];
  active_call?: CallSession | null;
};

export type Message = EntityRecord & {
  body?: string;
  content?: string;
  user_id?: number;
  user_name?: string;
  user_profile_picture?: string | null;
  created_at: string;
  user?: EntityRecord;
  sender?: EntityRecord;
  attachments?: EntityRecord[];
  reactions?: Record<string, number> | EntityRecord[];
  reacted_emojis?: string[];
};

export type CallSession = {
  id: number;
  conversation_id: number;
  call_type: 'audio' | 'video';
  status: string;
  initiator_id: number;
  initiator_name: string;
  started_at?: string | null;
  ended_at?: string | null;
  participants: Array<{ user_id: number; name: string; status: string }>;
};

export type LiveKitCredentials = {
  server_url: string;
  participant_token: string;
  call_session: CallSession;
};

export type PdfOperation = EntityRecord & {
  kind: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string | null;
  document?: PdfDocument | null;
  artifacts?: EntityRecord[];
};

export type Notification = {
  id: number;
  action: string;
  message: string;
  actor: Person;
  read_at?: string | null;
  created_at: string;
  notifiable_type: string;
  notifiable_id: number;
  deep_link: string;
};

export type PdfDocument = EntityRecord & {
  title: string;
  original_filename?: string;
  page_count?: number;
  byte_size?: number;
  content_url?: string;
  download_url?: string;
  current_version_id?: number;
  encrypted?: boolean;
  can_undo?: boolean;
  can_redo?: boolean;
  updated_at?: string;
};

export type CollectionResult<T> = { data: T[]; meta?: ApiMeta; raw?: unknown };
