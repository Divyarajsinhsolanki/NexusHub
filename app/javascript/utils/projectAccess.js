// Match ProjectMemberRoute: workspace visibility does not grant project membership.
export const canOpenProjectWorkspace = (project, user) =>
  user?.id != null && Boolean(project) && (project.can_access === true || String(project.owner_id) === String(user.id) || (Array.isArray(project?.users) &&
  project.users.some((member) => member?.id != null && String(member.id) === String(user.id) && (member.status == null || member.status === "active"))));
