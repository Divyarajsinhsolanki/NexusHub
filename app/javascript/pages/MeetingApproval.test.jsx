// @vitest-environment jsdom
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import Meeting from './Meeting';
vi.mock('../context/AuthContext',()=>({AuthContext:React.createContext({user:{id:2}})}));
vi.mock('../lib/chatCable',()=>({subscribeToCall:()=>({unsubscribe:()=>{}})}));
vi.mock('../components/chat/CallRoom',()=>({default:()=> <p>Media connected</p>}));
vi.mock('../components/api',()=>({fetchMeeting:vi.fn(async()=>({data:{call_session:{id:1,status:'active',call_type:'video',participants:[],initiator_name:'Ada'}}})),joinMeeting:vi.fn(async()=>({data:{admission_pending:true,call_session:{id:1,status:'active',call_type:'video',current_participant:{user_id:2,status:'waiting'}}}})),leaveCall:vi.fn(async()=>({})),endCall:vi.fn()}));
afterEach(cleanup);
it('shows a cancelable waiting state without mounting media before approval',async()=>{
 render(<MemoryRouter initialEntries={['/meet/room']}><Routes><Route path="/meet/:publicId" element={<Meeting/>}/></Routes></MemoryRouter>);
 fireEvent.click(await screen.findByRole('button',{name:'Join meeting'}));
 expect(await screen.findByRole('button',{name:'Waiting for host approval…'})).toBeTruthy();
 expect(screen.queryByText('Media connected')).toBeNull();expect(screen.getByRole('button',{name:'Waiting for host approval…'}).disabled).toBe(true);
 expect(screen.getByRole('button',{name:'Cancel join request'})).toBeTruthy();
});
