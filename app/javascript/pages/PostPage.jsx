import React, { useEffect, useState, useCallback, useContext, useRef } from "react";
import { Link } from "react-router-dom";
import { fetchPosts, SchedulerAPI, fetchProjects, getUsers } from "../components/api";
import { AuthContext } from "../context/AuthContext";
import PostForm from "../components/PostForm";
import PostList from "../components/PostList";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import QuickActions from "../components/quick_actions/QuickActions";

// --- Icon Imports ---
import {
  FiArchive,
  FiBell,
  FiBookOpen,
  FiCalendar,
  FiCheckCircle,
  FiCheckSquare,
  FiClock,
  FiFolder,
  FiMessageCircle,
  FiMessageSquare,
  FiPlus,
  FiSearch,
  FiUsers,
  FiZap,
  FiAlertTriangle,
  FiBriefcase,
  FiLoader,
} from "react-icons/fi";

// --- Reusable Components ---

const workspaceShortcuts = [
  {
    title: "Calendar",
    description: "Events, reminders, and Google links",
    to: "/calendar",
    icon: FiCalendar,
    accent: "from-sky-500 to-cyan-400",
  },
  {
    title: "Momentum",
    description: "Daily focus, wins, and team pulse",
    to: "/momentum",
    icon: FiZap,
    accent: "from-amber-500 to-orange-400",
  },
  {
    title: "Work Log",
    description: "Hours, priorities, tags, and notes",
    to: "/worklog",
    icon: FiCheckSquare,
    accent: "from-emerald-500 to-teal-400",
  },
  {
    title: "Chat",
    description: "Team conversations and task links",
    to: "/chat",
    icon: FiMessageCircle,
    accent: "from-violet-500 to-fuchsia-400",
  },
  {
    title: "Knowledge",
    description: "Bookmarks, learning goals, and news",
    to: "/knowledge",
    icon: FiBookOpen,
    accent: "from-indigo-500 to-blue-400",
  },
  {
    title: "Vault",
    description: "Project docs, credentials, and updates",
    to: "/vault",
    icon: FiArchive,
    accent: "from-slate-600 to-slate-400",
  },
];

const ShortcutCard = ({ shortcut }) => {
  const Icon = shortcut.icon;

  return (
    <Link
      to={shortcut.to}
      className="group rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm transition-all hover:-translate-y-1 hover:border-[rgb(var(--theme-color-rgb)/0.35)] hover:shadow-xl"
    >
      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${shortcut.accent} text-white shadow-lg shadow-slate-200 transition-transform group-hover:scale-105`}>
        <Icon className="text-xl" />
      </div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-900">{shortcut.title}</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">{shortcut.description}</p>
        </div>
        <span className="mt-1 text-xs font-semibold text-[var(--theme-color)] opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100">Open</span>
      </div>
    </Link>
  );
};

const StatCard = ({ icon, label, value, color }) => (
  <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
    <div className={`rounded-lg p-3 ${color}`}>
      {icon}
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  </div>
);

const DueTaskItem = ({ task }) => (
    <div className="bg-white p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all">
        <p className="font-semibold text-slate-800 truncate">
            {task.project ? (
                <Link
                    to={`/projects/${task.project.id}/dashboard?tab=todo`}
                    className="text-[var(--theme-color)] hover:underline"
                >
                    {task.task_id}
                </Link>
            ) : (
                <span className="text-[var(--theme-color)]">{task.task_id}</span>
            )}
            {task.title && ` - ${task.title}`}
        </p>
        {task.project && (
            <p className="text-xs text-slate-500 truncate">Project: {task.project.name}</p>
        )}
        <p className="text-xs text-red-600 font-medium">Due: {new Date(task.end_date).toLocaleDateString()}</p>
        {task.project && (
            <Link
                to={`/projects/${task.project.id}/dashboard?tab=todo`}
                className="mt-2 inline-block text-xs font-medium text-white bg-[var(--theme-color)] px-2 py-1 rounded hover:bg-[rgb(var(--theme-color-rgb)/0.9)]"
            >
                View Todo Board
            </Link>
        )}
    </div>
);

const GeneralTaskItem = ({ task }) => (
    <li className="flex items-center gap-2">
        <span className="text-xs text-slate-500 w-20">
            {task.end_date ? new Date(task.end_date).toLocaleDateString() : '--'}
        </span>
        <span className="font-medium text-slate-700 truncate">{task.title || task.task_id}</span>
    </li>
);

const ProjectItem = ({ project }) => (
    <Link
        to={`/projects/${project.id}/dashboard`}
        className="bg-white p-4 rounded-lg border border-slate-200 flex items-center gap-3 hover:bg-slate-50 transition-colors"
    >
        <div className="p-2 bg-slate-100 rounded-md">
            <FiBriefcase className="text-slate-500" />
        </div>
        <div className="min-w-0">
            <p className="font-semibold text-slate-700 truncate">{project.name}</p>
            <p className="text-xs text-slate-500 truncate">
                {project.start_date}
                {project.end_date && ` - ${project.end_date}`}
                {project.status && ` • ${project.status}`}
            </p>
        </div>
    </Link>
);


// --- Main Page Component ---

const PostPage = () => {
  const { user } = useContext(AuthContext);
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ totalPosts: 0, activeUsers: 0, recentActivity: '--' });
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [generalTasks, setGeneralTasks] = useState([]);
  const postFormRef = useRef(null);

  const handleQuickPost = useCallback(() => {
    if (postFormRef.current) {
      postFormRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      const textarea = postFormRef.current.querySelector("textarea");
      if (textarea) {
        textarea.focus();
      }
    }
  }, []);

  const handlePostUpdate = useCallback((postId, updater) => {
    setPosts((prevPosts) =>
      prevPosts.map((post) => {
        if (post.id !== postId) return post;
        const updatedPost = typeof updater === 'function' ? updater(post) : updater;
        return updatedPost ?? post;
      })
    );
  }, [setPosts]);

  const refreshPosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await fetchPosts();
      const sortedPosts = (Array.isArray(data) ? data : []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setPosts(sortedPosts);
      
      setStats({
        totalPosts: sortedPosts.length,
        activeUsers: new Set(sortedPosts.map(post => post.user.id)).size,
        recentActivity: sortedPosts.length > 0 ? new Date(sortedPosts[0].created_at).toLocaleDateString() : '--'
      });
    } catch (error) {
      console.error("Error fetching posts:", error);
      setPosts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshPosts();
  }, [refreshPosts]);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];

    // Run the main data fetches in parallel for performance
    Promise.all([
      fetchProjects(),
      getUsers(),
      SchedulerAPI.getTasks({ assigned_to_user: user.id })
    ])
      .then(([projectsResp, usersResp, tasksResp]) => {
        const userData = usersResp.data;
        const projectsData = Array.isArray(projectsResp.data) ? projectsResp.data : [];
        const tasksData = Array.isArray(tasksResp.data) ? tasksResp.data : [];

        // Filter user projects
        const userProjects = projectsData.filter((p) =>
          p.users.some((u) => u.id === user.id)
        );
        setProjects(userProjects);

        // Filter tasks due today
        const due = tasksData
          .filter((t) => t.end_date === today && t.status !== 'completed')
          .map((t) => ({
            ...t,
            project: userProjects.find((p) => p.id === t.project_id)
          }));
        const uniqueDue = due.filter(
          (t, idx, arr) => idx === arr.findIndex((u) => u.id === t.id)
        );
        setTasks(uniqueDue);

        // Filter upcoming birthdays
        const dateToday = new Date();
        const upcoming = (Array.isArray(userData) ? userData : [])
          .filter((u) => u.date_of_birth)
          .map((u) => {
            const dob = new Date(u.date_of_birth);
            const next = new Date(dateToday.getFullYear(), dob.getMonth(), dob.getDate());
            if (next < dateToday) next.setFullYear(next.getFullYear() + 1);
            return { ...u, nextBirthday: next };
          })
          .filter((u) => (u.nextBirthday - dateToday) / (1000 * 60 * 60 * 24) <= 30)
          .sort((a, b) => a.nextBirthday - b.nextBirthday)
          .slice(0, 5);
        setBirthdays(upcoming);
      })
      .catch(() => {
        setProjects([]);
        setTasks([]);
        setBirthdays([]);
      });

    // Fetch general tasks separately (different filter)
    SchedulerAPI.getTasks({ type: 'general', assigned_to_user: user.id })
      .then(({ data }) => {
        const tasks = Array.isArray(data) ? data : [];
        const uniqueTasks = tasks.filter(
          (t, idx, arr) => idx === arr.findIndex((u) => u.id === t.id)
        );
        setGeneralTasks(uniqueTasks);
      })
      .catch(() => setGeneralTasks([]));
  }, [user]);

  return (
    <>
      <Helmet>
        <title>Updates Hub</title>
        <meta name="description" content="Team updates, shortcuts, tasks, and workspace activity" />
        <meta property="og:title" content="Updates Hub" />
        <meta property="og:description" content="Team updates, shortcuts, tasks, and workspace activity" />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/70 font-sans">
      
        <div className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
          <section className="mb-6 overflow-hidden rounded-[1.5rem] border border-white/70 bg-slate-950 shadow-2xl shadow-slate-200 sm:mb-8 sm:rounded-[2rem]">
            <div className="relative px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.45),_transparent_35%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.4),_transparent_35%)]" />
              <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
                <div>
                  <h1 className="max-w-3xl text-[clamp(2rem,8vw,3rem)] font-black tracking-tight text-white sm:text-5xl">
                    Welcome back, {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'User'} — run your day from Updates.
                  </h1>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleQuickPost}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl sm:w-auto"
                    >
                      <FiPlus /> Write update
                    </button>
                    <Link
                      to="/notifications"
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/20 sm:w-auto"
                    >
                      <FiBell /> Check notifications
                    </Link>
                    <Link
                      to="/projects"
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-white/20 sm:w-auto"
                    >
                      <FiFolder /> Projects
                    </Link>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur sm:grid-cols-3">
                  <div className="rounded-2xl bg-white/95 p-4 text-center">
                    <p className="text-3xl font-black text-slate-900">{stats.totalPosts}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Posts</p>
                  </div>
                  <div className="rounded-2xl bg-white/95 p-4 text-center">
                    <p className="text-3xl font-black text-slate-900">{tasks.length}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Due Today</p>
                  </div>
                  <div className="rounded-2xl bg-white/95 p-4 text-center">
                    <p className="text-3xl font-black text-slate-900">{projects.length}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Projects</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mb-8 rounded-[2rem] border border-slate-200/80 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--theme-color)]">Shortcuts</p>
                <h2 className="text-2xl font-black text-slate-900">Jump to new features faster</h2>
              </div>
              <p className="max-w-xl text-sm text-slate-500">One-click access to the most useful areas added around updates: planning, logging, chat, knowledge, and vault tools.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              {workspaceShortcuts.map((shortcut) => (
                <ShortcutCard key={shortcut.title} shortcut={shortcut} />
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        
        {/* Left Sidebar: At a Glance */}
        <aside className="lg:col-span-3">
            <div className="space-y-8 sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto">
                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <FiAlertTriangle className="text-red-500"/>
                        At a Glance
                    </h2>
                    {tasks.length > 0 ? (
                        <div className="space-y-3">
                            <p className="text-sm text-slate-600 mb-2">You have <span className="font-bold text-red-600">{tasks.length} task(s) due today</span>.</p>
                            {tasks.slice(0, 4).map((task) => <DueTaskItem key={task.id} task={task} />)}
                        </div>
                    ) : (
                        <div className="text-center py-4 bg-green-50 rounded-lg border border-green-200">
                            <FiCheckCircle className="mx-auto text-green-500 text-3xl mb-2"/>
                            <p className="text-sm font-medium text-green-700">All caught up!</p>
                            <p className="text-xs text-green-600">No tasks due today.</p>
                        </div>
                    )}
                </div>
                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <FiCheckSquare className="text-slate-600"/>
                        My Tasks
                    </h2>
                    {generalTasks.length > 0 ? (
                        <ul className="space-y-3">
                            {generalTasks.map((t) => (
                                <GeneralTaskItem key={t.id} task={t} />
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-500 text-center py-4">No tasks found.</p>
                    )}
                </div>
                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <FiBriefcase className="text-slate-600"/>
                        My Projects
                    </h2>
                     {projects.length > 0 ? (
                        <div className="space-y-3">
                            {projects.map((p) => <ProjectItem key={p.id} project={p} />)}
                        </div>
                     ) : (
                        <p className="text-sm text-slate-500 text-center py-4">No projects found.</p>
                     )}
                </div>
            </div>
        </aside>

        {/* Main Content Feed */}
        <div className="lg:col-span-6">
            <main className="space-y-8">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Community feed</p>
                      <h2 className="mt-1 text-2xl font-black text-slate-900">Share and read team updates</h2>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"><FiMessageSquare /> Posts</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"><FiSearch /> Comments</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5"><FiUsers /> Team pulse</span>
                    </div>
                  </div>
                </div>
                <div ref={postFormRef}>
                  <PostForm refreshPosts={refreshPosts} />
                </div>
                
                <AnimatePresence>
                    {isLoading ? (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-20 text-center">
                            <FiLoader className="animate-spin text-[var(--theme-color)] text-4xl mb-4" />
                            <p className="text-slate-600 font-medium">Loading Community Feed...</p>
                        </motion.div>
                    ) : posts.length > 0 ? (
                        <PostList
                          posts={posts}
                          refreshPosts={refreshPosts}
                          onPostUpdate={handlePostUpdate}
                        />
                    ) : (
                         <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                            <div className="mx-auto w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                                <FiMessageSquare className="text-slate-400 text-3xl" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 mb-2">It's quiet in here...</h3>
                            <p className="text-slate-500 max-w-md mx-auto">
                                Be the first to share something with the community! Your post will appear here.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>

        {/* Right Sidebar: Community Stats and Birthdays */}
        <aside className="lg:col-span-3">
            <div className="space-y-8 sticky top-24 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-hide pr-1">
                <QuickActions onCreatePost={handleQuickPost} />

                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Community Stats</h2>
                    <div className="space-y-4">
                        <StatCard icon={<FiMessageSquare className="text-[var(--theme-color)]"/>} label="Total Posts" value={stats.totalPosts} color="bg-[rgb(var(--theme-color-rgb)/0.1)]" />
                        <StatCard icon={<FiUsers className="text-purple-500"/>} label="Active Users" value={stats.activeUsers} color="bg-purple-100" />
                        <StatCard icon={<FiClock className="text-green-500"/>} label="Last Activity" value={stats.recentActivity} color="bg-green-100" />
                    </div>
                </div>
                <div className="p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-800 mb-4">Upcoming Birthdays</h2>
                    {birthdays.length > 0 ? (
                        <ul className="space-y-3">
                            {birthdays.map((b) => (
                                <li key={b.id} className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">{[b.first_name, b.last_name].filter(Boolean).join(' ')}</span>
                                    <span className="text-sm text-slate-500">{b.nextBirthday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-500">No upcoming birthdays.</p>
                    )}
                </div>
            </div>
        </aside>

          </div>
        </div>
      </div>
    </>
  );
};

export default PostPage;
