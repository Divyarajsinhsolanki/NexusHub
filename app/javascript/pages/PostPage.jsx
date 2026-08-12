import React, { useEffect, useState, useCallback, useContext, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { fetchPostFeed, SchedulerAPI, fetchProjects, getUsers } from "../components/api";
import { AuthContext } from "../context/AuthContext";
import PostForm from "../components/PostForm";
import PostList from "../components/PostList";
import { filterAndSortPosts } from './postFeedUtils';
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";

// --- Icon Imports ---
import {
  FiBell,
  FiCheckCircle,
  FiCheckSquare,
  FiClock,
  FiMessageSquare,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiUsers,
  FiAlertTriangle,
  FiBriefcase,
  FiLoader,
  FiImage,
} from "react-icons/fi";

// --- Reusable Components ---

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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(null);
  const [feedError, setFeedError] = useState('');
  const [stats, setStats] = useState({ totalPosts: 0, activeUsers: 0, recentActivity: '--' });
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [generalTasks, setGeneralTasks] = useState([]);
  const [query, setQuery] = useState('');
  const [feedFilter, setFeedFilter] = useState('all');
  const [feedSort, setFeedSort] = useState('newest');
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

  const applyPostStats = useCallback((nextPosts, totalCount = null) => {
    setStats({
      totalPosts: totalCount ?? nextPosts.length,
      activeUsers: new Set(nextPosts.map((post) => post?.user?.id).filter(Boolean)).size,
      recentActivity: nextPosts.length > 0 ? new Date(nextPosts[0].created_at).toLocaleDateString() : '--',
    });
  }, []);

  const refreshPosts = useCallback(async ({ initial = false } = {}) => {
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);
    setFeedError('');
    try {
      const { data, meta } = await fetchPostFeed({ page: 1, per_page: 20 });
      const sortedPosts = (Array.isArray(data) ? data : []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setPosts(sortedPosts);
      setNextPage(meta?.next_page || null);
      applyPostStats(sortedPosts, meta?.total_count);
    } catch (error) {
      console.error("Error fetching posts:", error);
      setFeedError('Updates could not be loaded. Check your connection and try again.');
      if (initial) setPosts([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [applyPostStats]);

  const loadMorePosts = useCallback(async () => {
    if (!nextPage || isLoadingMore) return;
    setIsLoadingMore(true);
    setFeedError('');
    try {
      const { data, meta } = await fetchPostFeed({ page: nextPage, per_page: 20 });
      setPosts((currentPosts) => {
        const postById = new Map(currentPosts.map((post) => [post.id, post]));
        (Array.isArray(data) ? data : []).forEach((post) => postById.set(post.id, post));
        return [...postById.values()].sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
      });
      if (Number.isFinite(Number(meta?.total_count))) {
        setStats((currentStats) => ({ ...currentStats, totalPosts: Number(meta.total_count) }));
      }
      setNextPage(meta?.next_page || null);
    } catch (error) {
      console.error('Error loading more posts:', error);
      setFeedError('More updates could not be loaded. Please try again.');
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextPage, isLoadingMore]);

  useEffect(() => {
    refreshPosts({ initial: true });
  }, [refreshPosts]);

  const handlePostCreated = useCallback((createdPost) => {
    setPosts((currentPosts) => [createdPost, ...currentPosts.filter((post) => post.id !== createdPost.id)]);
    setStats((currentStats) => ({ ...currentStats, totalPosts: currentStats.totalPosts + 1 }));
  }, []);

  const handlePostDelete = useCallback((postId) => {
    setPosts((currentPosts) => currentPosts.filter((post) => post.id !== postId));
    setStats((currentStats) => ({ ...currentStats, totalPosts: Math.max(currentStats.totalPosts - 1, 0) }));
  }, []);

  useEffect(() => {
    setStats((currentStats) => ({
      ...currentStats,
      activeUsers: new Set(posts.map((post) => post?.user?.id).filter(Boolean)).size,
      recentActivity: posts.length > 0 ? new Date(posts[0].created_at).toLocaleDateString() : '--',
    }));
  }, [posts]);

  const visiblePosts = useMemo(() => filterAndSortPosts({
    posts,
    query,
    filter: feedFilter,
    sort: feedSort,
    userId: user?.id,
  }), [posts, query, feedFilter, feedSort, user?.id]);

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
          Array.isArray(p.users) && p.users.some((u) => String(u.id) === String(user.id))
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
        <meta name="description" content="Team updates, discussions, tasks, and workspace activity" />
        <meta property="og:title" content="Updates Hub" />
        <meta property="og:description" content="Team updates, discussions, tasks, and workspace activity" />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="nexus-updates-page">
        <header className="nexus-updates-header">
          <div className="nexus-updates-title">
            <span>Team communication</span>
            <h1>Updates</h1>
            <p>Share progress, decisions, questions, and blockers with your workspace.</p>
          </div>
          <div className="nexus-updates-actions">
            <button type="button" onClick={() => refreshPosts()} disabled={isRefreshing} className="nexus-secondary-action">
              <FiRefreshCw className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
            <Link to="/notifications" className="nexus-secondary-action"><FiBell /> Notifications</Link>
            <button type="button" onClick={handleQuickPost} className="app-primary-button"><FiPlus /> Write update</button>
          </div>
          <div className="nexus-updates-stats" aria-label="Update summary">
            <div><FiMessageSquare /><span><strong>{stats.totalPosts}</strong> updates</span></div>
            <div><FiUsers /><span><strong>{stats.activeUsers}</strong> contributors loaded</span></div>
            <div><FiClock /><span>Last activity <strong>{stats.recentActivity}</strong></span></div>
          </div>
        </header>

        <div className="nexus-updates-layout">
          <main className="nexus-updates-feed">
            <div ref={postFormRef}>
              <PostForm
                user={user}
                refreshPosts={refreshPosts}
                onPostCreated={handlePostCreated}
              />
            </div>

            <section className="nexus-updates-toolbar" aria-label="Filter updates">
              <label className="nexus-updates-search">
                <FiSearch aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search loaded updates or people"
                  aria-label="Search updates"
                />
              </label>
              <div className="nexus-updates-filters" role="group" aria-label="Update type">
                {[
                  ['all', 'All'],
                  ['mine', 'Mine'],
                  ['media', 'Media', FiImage],
                  ['discussed', 'Discussed'],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFeedFilter(value)}
                    className={feedFilter === value ? 'active' : ''}
                    aria-pressed={feedFilter === value}
                  >
                    {Icon && <Icon aria-hidden="true" />}{label}
                  </button>
                ))}
              </div>
              <select value={feedSort} onChange={(event) => setFeedSort(event.target.value)} aria-label="Sort updates">
                <option value="newest">Newest first</option>
                <option value="active">Most active</option>
                <option value="oldest">Oldest first</option>
              </select>
              <p className="nexus-updates-result-count" aria-live="polite">
                {visiblePosts.length} loaded result{visiblePosts.length === 1 ? '' : 's'}
              </p>
            </section>

            {feedError && (
              <div className="nexus-updates-error" role="alert">
                <span>{feedError}</span>
                <button type="button" onClick={() => refreshPosts()}>Try again</button>
              </div>
            )}

            <AnimatePresence mode="wait">
              {isLoading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="nexus-updates-empty">
                  <FiLoader className="animate-spin" />
                  <p>Loading updates…</p>
                </motion.div>
              ) : visiblePosts.length > 0 ? (
                <motion.div key="feed" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <PostList
                    posts={visiblePosts}
                    refreshPosts={refreshPosts}
                    onPostUpdate={handlePostUpdate}
                    onPostDelete={handlePostDelete}
                  />
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="nexus-updates-empty">
                  <FiMessageSquare />
                  <h2>{posts.length ? 'No updates match these filters' : 'No updates yet'}</h2>
                  <p>{posts.length ? 'Change the search or filter to see more updates.' : 'Share the first update with your team.'}</p>
                  {posts.length ? (
                    <button type="button" onClick={() => { setQuery(''); setFeedFilter('all'); }}>Clear filters</button>
                  ) : (
                    <button type="button" onClick={handleQuickPost}>Write an update</button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {nextPage && !isLoading && (
              <button type="button" onClick={loadMorePosts} disabled={isLoadingMore} className="nexus-updates-load-more">
                {isLoadingMore ? <><FiLoader className="animate-spin" /> Loading…</> : 'Load more updates'}
              </button>
            )}
          </main>

          <aside className="nexus-updates-rail" aria-label="Today at a glance">
            <section className="nexus-updates-rail-card">
              <header><span><FiAlertTriangle /> Today</span><strong>{tasks.length}</strong></header>
              {tasks.length > 0 ? (
                <div className="nexus-updates-rail-list">
                  {tasks.slice(0, 4).map((task) => <DueTaskItem key={task.id} task={task} />)}
                </div>
              ) : (
                <div className="nexus-updates-caught-up"><FiCheckCircle /><span><strong>All caught up</strong><small>No tasks due today.</small></span></div>
              )}
            </section>

            <section className="nexus-updates-rail-card">
              <header><span><FiCheckSquare /> My tasks</span><strong>{generalTasks.length}</strong></header>
              {generalTasks.length > 0 ? (
                <ul className="nexus-updates-task-list">
                  {generalTasks.slice(0, 5).map((task) => <GeneralTaskItem key={task.id} task={task} />)}
                </ul>
              ) : <p className="nexus-updates-rail-empty">No general tasks assigned.</p>}
            </section>

            <section className="nexus-updates-rail-card">
              <header><span><FiBriefcase /> Projects</span><strong>{projects.length}</strong></header>
              {projects.length > 0 ? (
                <div className="nexus-updates-project-list">
                  {projects.slice(0, 5).map((project) => <ProjectItem key={project.id} project={project} />)}
                  {projects.length > 5 && <Link to="/projects" className="nexus-updates-see-all">View all projects</Link>}
                </div>
              ) : <p className="nexus-updates-rail-empty">No projects assigned.</p>}
            </section>

            {birthdays.length > 0 && (
              <section className="nexus-updates-rail-card">
                <header><span>Upcoming birthdays</span></header>
                <ul className="nexus-updates-birthdays">
                  {birthdays.map((birthday) => (
                    <li key={birthday.id}>
                      <span>{[birthday.first_name, birthday.last_name].filter(Boolean).join(' ')}</span>
                      <time>{birthday.nextBirthday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </>
  );
};

export default PostPage;
