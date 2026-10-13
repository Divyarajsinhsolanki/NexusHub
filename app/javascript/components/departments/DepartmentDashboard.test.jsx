// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import api from '../api';
import DepartmentDashboard from './DepartmentDashboard';
vi.mock('../api',()=>({default:{patch:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
const department={id:7,capabilities:{manage_roles:true},dashboard:{members_count:1,active_projects:2,open_tasks:3,overdue_tasks:1,due_this_week:2,scope:'Visible projects only',workload:[{user_id:9,name:'Alex',role:'member',open_tasks:3,overdue_tasks:1,estimated_hours:6,allocation_percentage:120,availability:'overallocated'}]}};
test('search and workload totals display and roles save through the department endpoint',async()=>{
 const updated=vi.fn();api.patch.mockResolvedValue({data:department});
 render(<DepartmentDashboard department={department} onUpdated={updated}/>);
 expect(screen.getByText('120%')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Role for Alex'),{target:{value:'manager'}});
 await waitFor(()=>expect(updated).toHaveBeenCalledWith(department));
 expect(api.patch).toHaveBeenCalledWith('/departments/7/update_role',{user_id:9,role:'manager'});
 fireEvent.change(screen.getByLabelText('Search department workload'),{target:{value:'other'}});
 expect(screen.getByText('No members match your search.')).toBeTruthy();
});
test('read-only users cannot change roles',()=>{
 render(<DepartmentDashboard department={department} readOnly/>);
 expect(screen.queryByLabelText('Role for Alex')).toBeNull();
 expect(screen.getByText('member')).toBeTruthy();
});
