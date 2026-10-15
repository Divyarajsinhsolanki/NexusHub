import { describe, expect, it, vi } from 'vitest';
vi.mock('../config/features', () => ({ portfolioEnabled: true }));
import { canAccessWorkspacePath, workspaceLandingPath, hasWorkspacePermission } from './workspaceAccess';

describe('workspace access', () => {
  it.each(['member', 'admin', 'owner'])('allows %s to read the people directory', (name) => {
    expect(canAccessWorkspacePath({ roles: [{ name }] }, '/users')).toBe(true);
  });
  it.each([
    ['member', false, false], ['admin', true, false], ['owner', true, true],
  ])('matches admin and support access for %s', (name, admin, impersonation) => {
    const user = { roles: [{ name }] };
    expect(canAccessWorkspacePath(user, '/admin')).toBe(admin);
    expect(canAccessWorkspacePath(user, '/admin/login-as-user')).toBe(impersonation);
  });
  it('allows site administration and controlled support', () => {
    expect(canAccessWorkspacePath({ site_admin: true }, '/admin')).toBe(true);
    expect(canAccessWorkspacePath({ site_admin: true }, '/admin/portfolio')).toBe(true);
    expect(canAccessWorkspacePath({ site_admin: true }, '/admin/login-as-user')).toBe(true);
  });
  it('resolves supported landing pages and defaults to the workspace', () => {
    expect(workspaceLandingPath({ landing_page: 'calendar' })).toBe('/planning');
    expect(workspaceLandingPath({ landing_page: 'pdf' })).toBe('/pdf-master');
    expect(workspaceLandingPath({ landing_page: 'users' })).toBe('/users');
    expect(workspaceLandingPath({ landing_page: 'admin' })).toBe('/home');
    expect(workspaceLandingPath(null)).toBe('/home');
  });
});

it('uses server permissions and denies suspended members even with owner roles', () => {
  const user = { roles: [{ name: 'owner' }], permissions: [], workspace_membership: { status: 'active' } };
  expect(hasWorkspacePermission(user, 'users.manage')).toBe(false);
  expect(canAccessWorkspacePath(user, '/admin')).toBe(false);
  const suspended = { ...user, permissions: ['admin.manage', 'users.manage'], workspace_membership: { status: 'suspended' } };
  expect(hasWorkspacePermission(suspended, 'users.manage')).toBe(false);
  expect(canAccessWorkspacePath(suspended, '/projects')).toBe(false);
});
