// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import MeetingInteractions from './MeetingInteractions';
const {room,publish}=vi.hoisted(()=>{
 const publish=vi.fn(async()=>{});
 const room={state:'connected',localParticipant:{identity:'local',name:'Ada',attributes:{},publishData:publish,setAttributes:vi.fn(async attrs=>Object.assign(room.localParticipant.attributes,attrs))},remoteParticipants:new Map([['remote',{identity:'remote',name:'Grace',attributes:{'nexushub.hand':'true'}}]]),on:vi.fn(),off:vi.fn()};
 return {room,publish};
});
vi.mock('@livekit/components-react',()=>({useRoomContext:()=>room}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('keeps failed sends as drafts and displays shared raised hands',async()=>{
 render(<MeetingInteractions/>);
 expect(screen.getByText('✋ Grace')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Raise hand'}));
 await screen.findByRole('button',{name:'Lower hand'});
 fireEvent.click(screen.getByRole('button',{name:'Chat'}));
 fireEvent.change(screen.getByLabelText('Meeting message'),{target:{value:'Hello meeting'}});
 publish.mockRejectedValueOnce(new Error('Offline'));
 fireEvent.click(screen.getByRole('button',{name:'Send'}));
 await screen.findByText('Offline');expect(screen.getByLabelText('Meeting message').value).toBe('Hello meeting');
 fireEvent.click(screen.getByRole('button',{name:'Send'}));
 await waitFor(()=>expect(screen.getByLabelText('Meeting message').value).toBe(''));
 expect(screen.getByText('Hello meeting')).toBeTruthy();
});
