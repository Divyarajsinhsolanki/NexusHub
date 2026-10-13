import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Avatar from "../ui/Avatar";

const SkillDirectory = ({
  members = [],
  skills = [],
  roles = [],
  availabilityOptions = [],
  onToggleEndorse,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [roleFilter, setRoleFilter] = useState("All");
  const [availabilityFilter, setAvailabilityFilter] = useState("All");
  const [pendingSkillId, setPendingSkillId] = useState(null);

  const skillNames = useMemo(() => skills.map((skill) => skill.name), [skills]);

  const toggleSkill = (skillName) => {
    setSelectedSkills((prev) =>
      prev.includes(skillName)
        ? prev.filter((name) => name !== skillName)
        : [...prev, skillName]
    );
  };

  const normalizedMembers = useMemo(() => (
    members.map((member) => ({
      ...member,
      searchable: `${member.name || ""} ${member.job_title || ""} ${(member.skills || []).map(skill => skill.name).join(" ")}`.toLowerCase(),
      skillNames: (member.skills || []).map((skill) => skill.name),
    }))
  ), [members]);

  const filteredMembers = useMemo(() => normalizedMembers.filter((member) => {
    const matchesSearch =
      searchTerm.trim() === "" ||
      member.searchable.includes(searchTerm.trim().toLowerCase());

    const matchesSkills =
      selectedSkills.length === 0 ||
      selectedSkills.every((skill) => member.skillNames.includes(skill));

    const matchesRole = roleFilter === "All" || member.job_title === roleFilter;

    const matchesAvailability =
      availabilityFilter === "All" || member.availability_status === availabilityFilter;

    return matchesSearch && matchesSkills && matchesRole && matchesAvailability;
  }), [normalizedMembers, searchTerm, selectedSkills, roleFilter, availabilityFilter]);

  const handleEndorse = async (skill) => {
    if (!onToggleEndorse) return;
    setPendingSkillId(skill.id);
    try {
      await onToggleEndorse({
        userSkillId: skill.id,
        endorsed: skill.endorsed_by_current_user,
        endorsementId: skill.current_user_endorsement_id,
      });
    } finally {
      setPendingSkillId(null);
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 sm:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Find Team Experts</h2>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-1">Search by name, role, skill or availability to find the right collaborator.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-2">
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Search by name or role</label>
          <input
            aria-label="Search experts"
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search team members..."
            className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-[var(--theme-color)] focus:border-[var(--theme-color)]"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Filter by Role</label>
          <select
            aria-label="Filter experts by role"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-[var(--theme-color)] focus:border-[var(--theme-color)]"
          >
            {["All", ...roles].map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Availability</label>
          <select
            aria-label="Filter experts by availability"
            value={availabilityFilter}
            onChange={(event) => setAvailabilityFilter(event.target.value)}
            className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-4 py-2 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-[var(--theme-color)] focus:border-[var(--theme-color)]"
          >
            {[{ value: "All", label: "All" }, ...availabilityOptions].map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">Filter by Skills</label>
        <div className="flex flex-wrap gap-2">
          {skillNames.map((skillName) => {
            const isSelected = selectedSkills.includes(skillName);
            return (
              <button
                key={skillName}
                aria-pressed={isSelected}
                onClick={() => toggleSkill(skillName)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  isSelected ? "bg-[var(--theme-color)] text-white" : "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100 hover:bg-gray-200"
                }`}
              >
                {skillName}
                {isSelected && <span className="ml-1">×</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between items-center">
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">
          {filteredMembers.length} {filteredMembers.length === 1 ? "expert found" : "experts found"}
        </p>
        {(selectedSkills.length > 0 || searchTerm || roleFilter !== "All" || availabilityFilter !== "All") && (
          <button type="button" onClick={() => { setSelectedSkills([]); setSearchTerm(""); setRoleFilter("All"); setAvailabilityFilter("All"); }} className="min-h-11 px-3 text-sm font-semibold text-[var(--theme-color)]">Clear filters</button>
        )}
      </div>

      <div className="space-y-4">
        {filteredMembers.length === 0 && (
          <div className="text-center py-12">
            <div className="bg-gray-200 border-2 border-dashed rounded-xl w-16 h-16 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-1">No experts found</h3>
            <p className="text-zinc-500 dark:text-zinc-400">Try adjusting your filters to discover more team members.</p>
          </div>
        )}
        {filteredMembers.map((member) => (
          <div key={member.id} className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-5 hover:shadow-md transition-shadow">
            <div className="flex flex-col md:flex-row md:items-center justify-between">
              <div className="flex items-center mb-4 md:mb-0">
                <div className="bg-indigo-100 rounded-full p-1 mr-4">
                  <Avatar
                    name={member.name}
                    src={member.profile_picture}
                    className="w-12 h-12 text-lg"
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{member.name}</h3>
                  <p className="text-zinc-600 dark:text-zinc-400">{member.job_title}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${availabilityBadgeClass(member.availability_status)}`}>
                  {member.availability_label}
                </span>
                <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 px-3 py-1 rounded-full text-sm font-medium">
                  {member.current_projects_count} project{member.current_projects_count === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <h4 className="font-medium text-zinc-700 dark:text-zinc-300 mb-2">Top Skills</h4>
              <div className="flex flex-wrap gap-2">
                {(member.skills || []).map((skill) => {
                  const endorsed = skill.endorsed_by_current_user;
                  return (
                    <div
                      key={`${member.id}-${skill.id}`}
                      className="flex items-center bg-zinc-50 dark:bg-zinc-800/60 px-3 py-1 rounded-full space-x-2"
                    >
                      <div>
                        <span className="font-medium mr-1">{skill.name}</span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">{skill.endorsements_count} endorsement{skill.endorsements_count === 1 ? "" : "s"}</span>
                      </div>
                      {onToggleEndorse && (
                        <button
                          type="button"
                          onClick={() => handleEndorse(skill)}
                          disabled={pendingSkillId !== null}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border transition-colors ${
                            endorsed
                              ? "border-green-500 text-green-600 bg-green-50"
                              : "border-indigo-500 text-indigo-600 hover:bg-indigo-50"
                          }`}
                        >
                          {pendingSkillId === skill.id
                            ? "Saving..."
                            : endorsed ? "Endorsed" : "Endorse"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Link to={`/profile/${member.id}`} className="min-h-11 text-[var(--theme-color)] font-medium flex items-center">
                View Full Profile
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H5a1 1 0 110-2h7.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const availabilityBadgeClass = (status) => {
  switch (status) {
    case "available_now":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200";
    case "available_soon":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
    case "fully_booked":
      return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
    default:
      return "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300";
  }
};

export default SkillDirectory;
