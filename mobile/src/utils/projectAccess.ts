import type { Project } from '../api/types';
type User = { id: number; demo_account?: boolean } | null | undefined;
const member = (project: Project | undefined, user: User) => user && project?.users?.find(person => String(person.id) === String(user.id) && (person.status == null || person.status === 'active'));
export const canOpenProject = (project: Project | undefined, user: User) => Boolean(user && project && (project.can_access === true || String(project.owner_id) === String(user.id) || member(project, user)));
export const canEditProject = (project: Project | undefined, user: User) => Boolean(user && !user.demo_account && project && (project.can_edit ?? (String(project.owner_id) === String(user.id) || Boolean(member(project, user) && member(project, user)?.role !== 'viewer'))));
export const canManageProject = (project: Project | undefined, user: User) => Boolean(user && !user.demo_account && project?.can_manage);
