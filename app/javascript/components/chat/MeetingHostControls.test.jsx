// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MeetingHostControls from './MeetingHostControls';
import { hostCallAction } from '../api';
const {room}=vi.hoisted(()=>({room:{state:'connected',localParticipant:{connectionQuality:'poor',setCameraEnabled:vi.fn(async()=>{}),setScreenShareEnabled:vi.fn(async()=>{})},remoteParticipants:new Map(),on:vi.fn(),off:vi.fn()}}));
vi.mock('@livekit/components-react',()=>({useRoomContext:()=>room}));
vi.mock('../api',()=>({hostCallAction:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('uses authorized host actions and updates permissions after transfer',async()=>{
 const call={id:1,host_id:1,initiator_id:1,can_end:true,call_type:'video',participants:[{user_id:2,name:'Grace',status:'joined'}]};
 hostCallAction.mockResolvedValue({data:{call_session:{...call,host_id:2,can_end:false}}});
 vi.spyOn(window,'confirm').mockReturnValue(true);
 render(<MeetingHostControls callSession={call}/>);
 expect(screen.getByText('Connection: Poor')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Host controls'}));
 fireEvent.click(screen.getByRole('button',{name:'Make host'}));
 await waitFor(()=>expect(hostCallAction).toHaveBeenCalledWith(1,'transfer_host',2));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Host controls'})).toBeNull());
});
