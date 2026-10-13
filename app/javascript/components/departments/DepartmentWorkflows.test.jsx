// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import api from '../api';
import DepartmentWorkflows from './DepartmentWorkflows';
vi.mock('../api',()=>({default:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),delete:vi.fn()}}));
const department={id:1,capabilities:{view_content:true,manage_content:true,approve_requests:true}};
beforeEach(()=>{vi.resetAllMocks();api.get.mockResolvedValue({data:{data:[],meta:{}}});api.post.mockResolvedValue({data:{id:5}});});
afterEach(cleanup);
test('creates a goal with progress and a due date',async()=>{
 render(<DepartmentWorkflows department={department} user={{id:2}}/>);
 await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
 fireEvent.click(screen.getByRole('button',{name:'Add goal'}));
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Launch release'}});
 fireEvent.change(screen.getByLabelText('Progress (%)'),{target:{value:'25'}});
 fireEvent.change(screen.getByLabelText('Due date'),{target:{value:'2026-11-01'}});
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/departments/1/entries',{entry:expect.objectContaining({kind:'goal',title:'Launch release',progress:25,due_date:'2026-11-01'})}));
});
test('nonmembers can request membership but cannot load private content',async()=>{
 render(<DepartmentWorkflows department={{id:1,capabilities:{view_content:false}}} user={{id:2}}/>);
 expect(api.get).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('tab',{name:'Requests'}));
 await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
 fireEvent.change(screen.getByLabelText('Reason to join or transfer'),{target:{value:'Help design'}});
 fireEvent.click(screen.getByRole('button',{name:'Request to join / transfer here'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/departments/1/requests',{reason:'Help design'}));
});
test('demo users cannot create content or membership requests',async()=>{
 render(<DepartmentWorkflows department={department} user={{id:2,demo_account:true}}/>);
 await waitFor(()=>expect(screen.queryByRole('status')).toBeNull());
 expect(screen.queryByRole('button',{name:'Add goal'})).toBeNull();
 fireEvent.click(screen.getByRole('tab',{name:'Requests'}));
 expect(screen.queryByRole('button',{name:'Request to join / transfer here'})).toBeNull();
});
