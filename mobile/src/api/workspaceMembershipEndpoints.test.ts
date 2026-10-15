import { expect, jest, test } from '@jest/globals';
import { api } from './client';
import { endpoints } from './endpoints';
jest.mock('./client', () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }));
test('lists company memberships using the mobile envelope', async () => {
  const member = { id: 1, workspace_id: 2, user_id: 3, status: 'active', roles: ['member'] };
  jest.mocked(api.get).mockResolvedValue({ data: { data: [member] } });
  expect((await endpoints.workspaceMemberships()).data).toEqual([member]);
  expect(api.get).toHaveBeenCalledWith('/workspace_memberships', { params: {} });
});
test('sends role and suspension changes in the owner-authorized membership shape', async () => {
  const member = { id: 1, workspace_id: 2, status: 'suspended', roles: ['member'] };
  jest.mocked(api.patch).mockResolvedValue({ data: { data: member } });
  const change = { status: 'suspended' as const, role_names: ['member'] };
  expect(await endpoints.updateWorkspaceMembership(1, change)).toEqual(member);
  expect(api.patch).toHaveBeenCalledWith('/workspace_memberships/1', { workspace_membership: change });
});
