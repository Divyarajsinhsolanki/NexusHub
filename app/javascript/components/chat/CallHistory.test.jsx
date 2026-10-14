// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CallHistory, { formatCallDuration } from './CallHistory';
import { fetchCallHistory } from '../api';
vi.mock('../api',()=>({fetchCallHistory:vi.fn()}));
beforeEach(()=>{ HTMLDialogElement.prototype.showModal=vi.fn(function(){this.setAttribute('open','');}); });
afterEach(()=>{cleanup();vi.clearAllMocks();});
const row={id:1,title:'Ada',call_type:'video',direction:'incoming',status:'ended',duration_seconds:65,created_at:'2026-10-14T00:00:00Z',can_callback:true};
it('paginates and calls back with the original record while retaining errors for retry',async()=>{
 fetchCallHistory.mockImplementation(page=>Promise.resolve({data:{data:page===1?[row]:[{...row,id:2,title:'Grace',can_callback:false}],meta:{next_page:page===1?2:null}}}));
 const close=vi.fn();const callback=vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined);
 render(<CallHistory onClose={close} onCallback={callback}/>);
 expect(await screen.findByText(/1m 5s/)).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Load older calls'}));
 await screen.findByText('Grace');
 expect(screen.getByRole('button',{name:'Call back Grace'}).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Call back Ada'}));
 await screen.findByText('Offline');expect(close).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Call back Ada'}));
 await waitFor(()=>expect(close).toHaveBeenCalledOnce());
 expect(callback).toHaveBeenLastCalledWith(row);
});
it('formats zero and hour durations',()=>{
 expect(formatCallDuration(0)).toBe('0m 0s');expect(formatCallDuration(3661)).toBe('1h 1m 1s');
});
