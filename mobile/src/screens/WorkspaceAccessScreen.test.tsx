import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { endpoints } from '../api/endpoints';
import { WorkspaceAccessScreen } from './WorkspaceAccessScreen';
let mockAllowed = true;
jest.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: {id:1,roles:['owner'],permissions:mockAllowed?['invitations.manage','offboarding.manage']:[],demo_account:false},signOut:jest.fn() }) }));
jest.mock('../components/Screen', () => ({ Screen: ({children}:any) => children }));
jest.mock('../api/endpoints', () => ({ endpoints: {
  workspaceInvitations: jest.fn(async()=>({data:[]})),
  users: jest.fn(async()=>({data:[{id:2,name:'Alex',workspace_membership:{id:7,status:'active',roles:['member']}}]})),
  rawResource: jest.fn(async()=>['member','owner']),
  inviteWorkspaceMember: jest.fn(async()=>({id:3,delivery_status:'queued'})),
  resendWorkspaceInvitation:jest.fn(),revokeWorkspaceInvitation:jest.fn(),
  previewWorkspaceOffboarding:jest.fn(async()=>({name:'Alex',needs_transfer:false,retained:'Company records are retained.',successors:[]})),
  offboardWorkspaceMember:jest.fn(async()=>({offboarded:true,retained:true,cleanup_status:'not_required'})),
} }));
const clients: QueryClient[] = [];
const setup = () => {const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});clients.push(client);return render(<QueryClientProvider client={client}><WorkspaceAccessScreen /></QueryClientProvider>)};
beforeEach(()=>{jest.clearAllMocks();mockAllowed=true;});
afterEach(()=>{cleanup();clients.splice(0).forEach(client=>client.clear());});
test('invites a colleague without collecting a password', async()=>{
  const view=await setup();
  await fireEvent.changeText(view.getByLabelText('Invitation email'),'employee@example.test');
  await fireEvent.press(view.getByText('Send invitation'));
  await waitFor(()=>expect(endpoints.inviteWorkspaceMember).toHaveBeenCalledWith({email:'employee@example.test',role_names:['member']}));
  expect(view.queryByLabelText('Temporary password')).toBeNull();
});
test('requires confirmation before employee offboarding and retains records',async()=>{
  const view=await setup();
  await fireEvent.press(await view.findByText('Review offboarding for Alex'));
  await view.findByText('Company records are retained.');
  await fireEvent.press(view.getByText('Offboard employee'));
  expect(endpoints.offboardWorkspaceMember).not.toHaveBeenCalled();
  await fireEvent.changeText(view.getByLabelText('Type OFFBOARD to confirm'),'OFFBOARD');
  await fireEvent.press(view.getByText('Offboard employee'));
  await waitFor(()=>expect(endpoints.offboardWorkspaceMember).toHaveBeenCalledWith(7,{confirmation:'OFFBOARD',successor_id:null}));
});
test('does not load invitations or offer management controls to ordinary members',async()=>{
  mockAllowed=false;
  const view=await setup();
  expect(view.getByText('Invitation management access is required.')).toBeTruthy();
  expect(endpoints.workspaceInvitations).not.toHaveBeenCalled();
  expect(view.queryByText('Send invitation')).toBeNull();
});
