import type { Project } from '../api/types';
export const canOpenProject = (project: Project | undefined, user: { id: number } | null | undefined) =>
  Boolean(user && project?.users?.some((member) => String(member.id) === String(user.id) && member.status !== 'removed' && member.status !== 'rejected'));
