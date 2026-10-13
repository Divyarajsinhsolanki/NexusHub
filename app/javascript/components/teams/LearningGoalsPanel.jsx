import React, { useMemo, useState } from "react";

const LearningGoalsPanel = ({
  goals = [],
  onCreateGoal,
  onDeleteGoal,
  onAddCheckpoint,
  onToggleCheckpoint,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: "", dueDate: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkpointDrafts, setCheckpointDrafts] = useState({});
  const [pendingCheckpointId, setPendingCheckpointId] = useState(null);

  const sortedGoals = useMemo(() => (
    [...goals].sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date) - new Date(b.due_date);
    })
  ), [goals]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateGoal = async (event) => {
    event.preventDefault();
    if (!onCreateGoal) return;
    setIsSubmitting(true);
    try {
      await onCreateGoal({
        title: form.title,
        due_date: form.dueDate,
        description: form.description,
      });
      setForm({ title: "", dueDate: "", description: "" });
      setShowModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCheckpoint = async (goalId) => {
    if (!onAddCheckpoint) return;
    const text = (checkpointDrafts[goalId] || "").trim();
    if (text.length === 0) return;

    setPendingCheckpointId(`add-${goalId}`);
    try {
      await onAddCheckpoint(goalId, { title: text });
      setCheckpointDrafts((prev) => ({ ...prev, [goalId]: "" }));
    } finally {
      setPendingCheckpointId(null);
    }
  };

  const toggleCheckpoint = async (checkpoint) => {
    if (!onToggleCheckpoint) return;
    setPendingCheckpointId(checkpoint.id);
    try {
      await onToggleCheckpoint(checkpoint.id, !checkpoint.completed);
    } finally {
      setPendingCheckpointId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Your Learning Goals</h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">Track progress toward the skills you want to level up.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[var(--theme-color)] text-white px-4 py-2 rounded-lg hover:brightness-110 transition-colors flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add Goal
        </button>
      </div>

      {sortedGoals.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-2xl p-8 text-center text-zinc-500 dark:text-zinc-400 border border-dashed border-zinc-300 dark:border-zinc-700">
          <p className="font-medium">You haven&apos;t created any learning goals yet.</p>
          <p className="text-sm">Add a goal to stay accountable and celebrate progress.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedGoals.map((goal) => (
            <div key={goal.id} className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-2xl p-5 border border-zinc-200 dark:border-zinc-800">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-3">
                <div>
                  <h3 className="font-semibold text-lg text-zinc-800 dark:text-zinc-100">{goal.title}</h3>
                  {goal.description && <p className="text-zinc-600 dark:text-zinc-400 text-sm mt-1 max-w-2xl">{goal.description}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {goal.due_date && (
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${dueBadgeClass(goal.days_remaining)}`}>
                      Due: {new Date(goal.due_date).toLocaleDateString()} ({formatDays(goal.days_remaining)})
                    </span>
                  )}
                  {onDeleteGoal && (
                    <button
                      onClick={() => onDeleteGoal(goal.id)}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between text-sm text-zinc-600 dark:text-zinc-400 mb-1">
                  <span>Progress</span>
                  <span>{goal.progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full ${progressColor(goal.progress)}`}
                    style={{ width: `${goal.progress}%` }}
                  />
                </div>
              </div>

              <div>
                <h4 className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">Checkpoints</h4>
                <ul className="space-y-2">
                  {goal.checkpoints.map((checkpoint) => (
                    <li key={checkpoint.id} className="flex items-start">
                      <input
                        type="checkbox"
                        checked={checkpoint.completed}
                        onChange={() => toggleCheckpoint(checkpoint)}
                        disabled={pendingCheckpointId === checkpoint.id}
                        className="mt-1 h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                      <div className="ml-3 text-sm">
                        <span className={checkpoint.completed ? "line-through text-zinc-500 dark:text-zinc-400" : "text-zinc-800 dark:text-zinc-100"}>
                          {checkpoint.title}
                        </span>
                        {checkpoint.resource_url && (
                          <a
                            href={checkpoint.resource_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-indigo-600 hover:underline"
                          >
                            Resource
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
                {onAddCheckpoint && (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={checkpointDrafts[goal.id] || ""}
                      onChange={(event) => setCheckpointDrafts((prev) => ({ ...prev, [goal.id]: event.target.value }))}
                      placeholder="Add new checkpoint"
                      className="flex-1 border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-[var(--theme-color)] focus:border-[var(--theme-color)]"
                    />
                    <button
                      onClick={() => handleAddCheckpoint(goal.id)}
                      disabled={pendingCheckpointId === `add-${goal.id}`}
                      className="px-3 py-2 bg-[var(--theme-color)] text-white rounded-lg hover:brightness-110 text-sm"
                    >
                      {pendingCheckpointId === `add-${goal.id}` ? "Saving..." : "Add"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-2xl shadow-xl w-full max-w-xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">Create a learning goal</h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:text-zinc-300">✕</button>
            </div>
            <form className="space-y-4" onSubmit={handleCreateGoal}>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Goal title</label>
                <input
                  type="text"
                  name="title"
                  value={form.title}
                  onChange={handleFormChange}
                  placeholder="e.g. Master Docker"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-[var(--theme-color)] focus:border-[var(--theme-color)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Target completion date</label>
                <input
                  type="date"
                  name="dueDate"
                  value={form.dueDate}
                  onChange={handleFormChange}
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-[var(--theme-color)] focus:border-[var(--theme-color)]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Description</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleFormChange}
                  rows={3}
                  placeholder="Add a note about why this goal matters"
                  className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-[var(--theme-color)] focus:border-[var(--theme-color)]"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-zinc-700 dark:text-zinc-300 hover:bg-gray-300"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[var(--theme-color)] text-white hover:brightness-110"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save Goal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const progressColor = (progress) => {
  if (progress < 30) return "bg-red-500";
  if (progress < 70) return "bg-amber-500";
  return "bg-green-500";
};

const dueBadgeClass = (daysRemaining) => {
  if (daysRemaining == null) return "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300";
  if (daysRemaining < 0) return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  if (daysRemaining <= 7) return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  if (daysRemaining <= 14) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
};

const formatDays = (days) => {
  if (days == null) return "No due date";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
};

export default LearningGoalsPanel;
