import { expect, jest, test } from '@jest/globals';
import { api } from './client';
import { endpoints } from './endpoints';
jest.mock('./client', () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }));
test('invitations carry only email and company-approved role choices', async () => {
  jest.mocked(api.post).mockResolvedValue({data:{data:{id:1,delivery_status:'queued'}}});
  await endpoints.inviteWorkspaceMember({email:'employee@example.test',role_names:['member']});
  expect(api.post).toHaveBeenCalledWith('/workspace_invitations',{workspace_invitation:{email:'employee@example.test',role_names:['member']}});
});
test('public token acceptance uses the native envelope and recipient password', async () => {
  jest.mocked(api.post).mockResolvedValue({data:{data:{accepted:true}}});
  expect(await endpoints.acceptWorkspaceInvitation('secret-token',{password:'ChosenPass!42',password_confirmation:'ChosenPass!42'})).toEqual({accepted:true});
  expect(api.post).toHaveBeenCalledWith('/workspace_invitations/accept',{invitation_token:'secret-token',account:{password:'ChosenPass!42',password_confirmation:'ChosenPass!42'}});
});
test('offboarding fetches one preview and sends confirmation without deleting the person', async () => {
  jest.mocked(api.get).mockResolvedValue({data:{data:{needs_transfer:true,successors:[]}}});
  expect(await endpoints.previewWorkspaceOffboarding(7)).toEqual({needs_transfer:true,successors:[]});
  jest.mocked(api.post).mockResolvedValue({data:{data:{offboarded:true,retained:true}}});
  await endpoints.offboardWorkspaceMember(7,{confirmation:'OFFBOARD',successor_id:3});
  expect(api.post).toHaveBeenCalledWith('/workspace_memberships/7/offboarding',{offboarding:{confirmation:'OFFBOARD',successor_id:3}});
  expect(api.delete).not.toHaveBeenCalled();
});
