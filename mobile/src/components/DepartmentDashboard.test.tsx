import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { DepartmentDashboard } from './DepartmentDashboard';
import { endpoints } from '../api/endpoints';
import type { Department } from '../api/types';
jest.mock('../api/endpoints',()=>({endpoints:{updateDepartment:jest.fn(async()=>({}))}}));
const department:Department={id:1,name:'Engineering',users_count:1,members:[{id:3,full_name:'Alex',email:'alex@example.test'}],dashboard:{members_count:1,active_projects:2,open_tasks:3,overdue_tasks:1,due_this_week:2,scope:'Only accessible projects',workload:[]}};
test('native dashboard allows authorized head assignment',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity},mutations:{gcTime:Infinity}}});
 const screen=await render(<QueryClientProvider client={client}><DepartmentDashboard department={department} canAssignHead/></QueryClientProvider>);
 expect(screen.getByText('Open tasks')).toBeTruthy();
 await fireEvent(screen.getByLabelText('Department head'),'valueChange',3);
 await waitFor(()=>expect(endpoints.updateDepartment).toHaveBeenCalledWith(1,{manager_id:3}));
 await screen.unmount();client.clear();
});
test('head selector is hidden without administrative permission',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity},mutations:{gcTime:Infinity}}});
 const screen=await render(<QueryClientProvider client={client}><DepartmentDashboard department={department} canAssignHead={false}/></QueryClientProvider>);
 expect(screen.queryByLabelText('Department head')).toBeNull();
 await screen.unmount();client.clear();
});
