// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Meeting from './Meeting';
import { fetchMeeting, endCall } from '../components/api';
vi.mock('../components/api', () => ({ fetchMeeting: vi.fn(), endCall: vi.fn(), joinMeeting: vi.fn(), leaveCall: vi.fn() }));
vi.mock('../lib/chatCable', () => ({ subscribeToCall: () => ({unsubscribe:vi.fn()}) }));
vi.mock('../components/chat/CallRoom', () => ({default: ({onEnd}) => <div><p>Connected room</p><button onClick={onEnd}>End for everyone</button></div>}));
afterEach(() => {cleanup();vi.clearAllMocks();});
it('keeps media connected and displays a retryable error when ending fails', async () => {
 const call={id:1,status:'active',call_type:'video',can_end:true};
 fetchMeeting.mockResolvedValue({data:{call_session:call}});
 endCall.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({data:{call_session:{...call,status:'ended'}}});
 render(<MemoryRouter initialEntries={[{pathname:'/meet/test',state:{callSession:call,credentials:{participant_token:'token',server_url:'wss://test'}}}]}><Routes><Route path="/meet/:publicId" element={<Meeting/>}/></Routes></MemoryRouter>);
 await screen.findByText('Connected room');
 fireEvent.click(screen.getByRole('button',{name:'End for everyone'}));
 expect(await screen.findByRole('alert')).toBeTruthy();
 expect(screen.getByText('Connected room')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'End for everyone'}));
 await waitFor(()=>expect(screen.queryByText('Connected room')).toBeNull());
 expect(screen.getByText('This meeting has ended.')).toBeTruthy();
});
