// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ScheduledMeetings from './ScheduledMeetings';
import api from '../api';
vi.mock('../api',()=>({default:{get:vi.fn(),post:vi.fn(),patch:vi.fn()}}));
vi.mock('../UserMultiSelect',()=>({default:()=>null}));
beforeEach(()=>{HTMLDialogElement.prototype.showModal=vi.fn(function(){this.setAttribute('open','');});api.get.mockResolvedValue({data:{data:[],meta:{}}});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('keeps a failed scheduling draft visible and posts timezone-aware dates on retry',async()=>{
 api.post.mockRejectedValueOnce({response:{data:{message:'Save failed'}}}).mockResolvedValueOnce({data:{id:1}});
 render(<MemoryRouter><ScheduledMeetings user={{id:1}} onClose={()=>{}}/></MemoryRouter>);
 await screen.findByRole('button',{name:'Schedule meeting'});
 fireEvent.click(screen.getByRole('button',{name:'Schedule meeting'}));
 fireEvent.change(screen.getByLabelText('Title'),{target:{value:'Design review'}});
 fireEvent.click(screen.getByRole('button',{name:'Save meeting'}));
 await screen.findByText('Save failed');expect(screen.getByLabelText('Title').value).toBe('Design review');
 fireEvent.click(screen.getByRole('button',{name:'Save meeting'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2));
 expect(api.post.mock.calls[1][1].starts_at).toMatch(/Z$/);
});
