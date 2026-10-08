import Avatar from "../ui/Avatar";
import React, { useMemo, useState } from "react";

const PROFICIENCY_OPTIONS = [
  { value: "expert", label: "Expert" },
  { value: "advanced", label: "Advanced" },
  { value: "intermediate", label: "Intermediate" },
  { value: "beginner", label: "Beginner" },
];

const SkillEndorsementsPanel = ({
  skills = [],
  availableSkills = [],
  teamExperts = [],
  recentEndorsements = [],
  onAddSkill,
  onUpdateSkill,
  onRemoveSkill,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ mode: "existing", skillId: "", name: "", proficiency: "intermediate" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingSkillId, setPendingSkillId] = useState(null);

  const availableSkillOptions = useMemo(() => (
    availableSkills.filter((skill) => !skills.some((userSkill) => userSkill.skill_id === skill.id))
  ), [availableSkills, skills]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateSkill = async (event) => {
    event.preventDefault();
    if (!onAddSkill) return;

    setIsSubmitting(true);
    try {
      const payload = {
        proficiency: form.proficiency,
      };
      if (form.mode === "existing" && form.skillId) {
        payload.skill_id = Number(form.skillId);
      } else if (form.name.trim().length > 0) {
        payload.name = form.name.trim();
      }

      await onAddSkill(payload);
      setForm({ mode: "existing", skillId: "", name: "", proficiency: form.proficiency });
      setShowModal(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateProficiency = async (skillId, proficiency) => {
    if (!onUpdateSkill) return;
    setPendingSkillId(skillId);
    try {
      await onUpdateSkill(skillId, { proficiency });
    } finally {
      setPendingSkillId(null);
    }
  };

  const handleRemoveSkill = async (skillId) => {
    if (!onRemoveSkill) return;
    setPendingSkillId(skillId);
    try {
      await onRemoveSkill(skillId);
    } finally {
      setPendingSkillId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Your Skills &amp; Endorsements</h2>
            <p className="text-gray-500 text-sm">Keep your profile up to date so your teammates know where you shine.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Add Skill
          </button>
        </div>

        {skills.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-500">
            <p className="font-medium">You haven&apos;t added any skills yet.</p>
            <p className="text-sm">Start by adding a skill to let others know how you can help.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {skills.map((skill) => (
              <div key={skill.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-lg">{skill.name}</h3>
                    <p className="text-gray-600 text-sm">
                      {skill.endorsements_count} endorsement{skill.endorsements_count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRemoveSkill(skill.id)}
                    disabled={pendingSkillId === skill.id}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    {pendingSkillId === skill.id ? "Removing..." : "Remove"}
                  </button>
                </div>
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Proficiency</label>
                  <select
                    value={skill.proficiency}
                    onChange={(event) => handleUpdateProficiency(skill.id, event.target.value)}
                    disabled={pendingSkillId === skill.id}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    {PROFICIENCY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Team Experts</h2>
          {teamExperts.length === 0 ? (
            <p className="text-gray-500 text-sm">We&apos;ll highlight top experts once endorsements start rolling in.</p>
          ) : (
            <div className="space-y-4">
              {teamExperts.map((expert) => (
                <div key={`${expert.user_id}-${expert.skill_name}`} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <Avatar name={expert.name} src={expert.profile_picture} color={expert.avatar_color} className="mr-3 h-10 w-10 shrink-0" />
                    <div>
                      <h3 className="font-semibold">{expert.name}</h3>
                      <p className="text-gray-600 text-sm">{expert.job_title}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium">
                      {expert.skill_name}
                    </span>
                    <span className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-sm font-medium flex items-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      {expert.endorsements_count} endorsement{expert.endorsements_count === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Skill Endorsements</h2>
          {recentEndorsements.length === 0 ? (
            <p className="text-gray-500 text-sm">No endorsements yet. Recognize a teammate to get things started.</p>
          ) : (
            <div className="space-y-4">
              {recentEndorsements.map((endorsement) => (
                <div key={endorsement.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center mb-3">
                    <div className="mr-3 flex shrink-0 -space-x-2">
                      <Avatar name={endorsement.endorser.name} src={endorsement.endorser.profile_picture} color={endorsement.endorser.avatar_color} className="h-10 w-10 ring-2 ring-white" />
                      <Avatar name={endorsement.endorsee.name} src={endorsement.endorsee.profile_picture} color={endorsement.endorsee.avatar_color} className="h-10 w-10 ring-2 ring-white" />
                    </div>
                    <div>
                      <p className="font-medium">{endorsement.endorser.name}</p>
                      <p className="text-gray-500 text-sm">Endorsed {endorsement.endorsee.name}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full text-sm font-medium">
                      {endorsement.skill_name}
                    </span>
                    <span className="text-gray-500 text-sm">{endorsement.created_at_human} ago</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Add a new skill</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <form className="space-y-4" onSubmit={handleCreateSkill}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Skill Source</label>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="mode"
                      value="existing"
                      checked={form.mode === "existing"}
                      onChange={(event) => setForm((prev) => ({ ...prev, mode: event.target.value }))}
                    />
                    Existing skill
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="mode"
                      value="new"
                      checked={form.mode === "new"}
                      onChange={(event) => setForm((prev) => ({ ...prev, mode: event.target.value }))}
                    />
                    Create new
                  </label>
                </div>
              </div>

              {form.mode === "existing" ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Select skill</label>
                  <select
                    name="skillId"
                    value={form.skillId}
                    onChange={handleFormChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  >
                    <option value="" disabled>Choose a skill</option>
                    {availableSkillOptions.map((skill) => (
                      <option key={skill.id} value={skill.id}>{skill.name}</option>
                    ))}
                  </select>
                  {availableSkillOptions.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">All available skills are already in your profile. Switch to &quot;Create new&quot; to add another.</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Skill name</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleFormChange}
                    placeholder="e.g. GraphQL"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proficiency</label>
                <select
                  name="proficiency"
                  value={form.proficiency}
                  onChange={handleFormChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  {PROFICIENCY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : "Save Skill"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default SkillEndorsementsPanel;
