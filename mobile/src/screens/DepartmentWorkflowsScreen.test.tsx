import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { beforeEach, expect, jest, test } from '@jest/globals';
import { DepartmentWorkflowsScreen } from './DepartmentWorkflowsScreen';
import { endpoints } from '../api/endpoints';
const mockDepartment={id:1,name:'Engineering',capabilities:{view_content:true,manage_content:true,approve_requests:true}};
let mockDemo=false;
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({id:'1'}),useRouter:()=>({back:jest.fn()})}));
jest.mock('../auth/AuthProvider',()=>({useAuth:()=>({user:{id:2,demo_account:mockDemo},refreshUser:jest.fn(async()=>undefined)})}));
jest.mock('../components/Screen',()=>({Screen:({children,header}:any)=><>{header}{children}</>}));
jest.mock('../api/endpoints',()=>({endpoints:{department:jest.fn(async()=>mockDepartment),departmentEntries:jest.fn(async()=>({data:[],meta:{}})),departmentRequests:jest.fn(async()=>({data:[],meta:{}})),departmentComments:jest.fn(async()=>({data:[],meta:{}})),saveDepartmentEntry:jest.fn(async()=>({id:3})),createDepartmentRequest:jest.fn(async()=>({id:4})),createDepartmentComment:jest.fn(async()=>({id:5}))}}));
beforeEach(()=>{jest.clearAllMocks();mockDemo=false;});
async function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{gcTime:Infinity}}});const screen=await render(<QueryClientProvider client={client}><DepartmentWorkflowsScreen/></QueryClientProvider>);return {screen,close:async()=>{await screen.unmount();client.clear();}};}
test('native editor saves a goal with progress',async()=>{
 const {screen,close}=await setup();
 await waitFor(()=>expect(screen.getByRole('button',{name:'Add goal'})).toBeTruthy());
 await fireEvent.press(screen.getByRole('button',{name:'Add goal'}));
 await fireEvent.changeText(screen.getByLabelText('Title'),'Launch release');
 await fireEvent.changeText(screen.getByLabelText('Progress (%)'),'25');
 await fireEvent.press(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(endpoints.saveDepartmentEntry).toHaveBeenCalledWith(1,expect.objectContaining({kind:'goal',title:'Launch release',progress:25}),undefined));
 await close();
});
test('native requests submit a reason and demo accounts hide write controls',async()=>{
 const {screen,close}=await setup();
 await fireEvent.press(screen.getByRole('button',{name:'Requests'}));
 await fireEvent.changeText(screen.getByLabelText('Reason to join or transfer'),'New team');
 await fireEvent.press(screen.getByRole('button',{name:'Request to join / transfer here'}));
 await waitFor(()=>expect(endpoints.createDepartmentRequest).toHaveBeenCalledWith(1,'New team'));
 await close();mockDemo=true;
 const demo=await setup();
 await waitFor(()=>expect(endpoints.department).toHaveBeenCalled());
 expect(demo.screen.queryByRole('button',{name:'Add goal'})).toBeNull();
 await demo.close();
});

test('members can discuss an announcement without management controls',async()=>{
 jest.mocked(endpoints.department).mockResolvedValueOnce({...mockDepartment,capabilities:{view_content:true,manage_content:false,approve_requests:false}} as never);
 jest.mocked(endpoints.departmentEntries).mockImplementation(async(_id,kind)=>({data:kind==='announcement'?[{id:6,kind:'announcement',title:'News',body:'Team update',author_name:'Head',status:'active',progress:0,pinned:true,url:null,due_date:null,lock_version:0,created_at:'2026-10-14'}]:[],meta:{}}));
 const {screen,close}=await setup();
 await waitFor(()=>expect(screen.getByText('Engineering')).toBeTruthy());
 await fireEvent.press(screen.getByRole('button',{name:'Announcements'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Comments'})).toBeTruthy());
 expect(screen.queryByRole('button',{name:'Edit'})).toBeNull();
 await fireEvent.press(screen.getByRole('button',{name:'Comments'}));
 await fireEvent.changeText(screen.getByLabelText('Add comment'),'Useful update');
 await fireEvent.press(screen.getByRole('button',{name:'Post comment'}));
 await waitFor(()=>expect(endpoints.createDepartmentComment).toHaveBeenCalledWith(1,6,'Useful update'));
 await close();
});
