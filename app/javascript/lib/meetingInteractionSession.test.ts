import { afterEach, expect, it, vi } from 'vitest';
import { MeetingInteractionSession, HAND_ATTRIBUTE, MEETING_TOPIC, type MeetingTransport } from './meetingInteractionSession';
afterEach(()=>vi.useRealTimers());
function fixture() {
  const handlers=new Map<string,Set<(...args:any[])=>void>>();
  const local={identity:'local',name:'Ada',attributes:{} as Record<string,string>,publishData:vi.fn(async()=>{}),setAttributes:vi.fn(async(attrs:Record<string,string>)=>{Object.assign(local.attributes,attrs);})};
  const remote={identity:'remote',name:'Grace',attributes:{[HAND_ATTRIBUTE]:'true'}};
  const room:MeetingTransport={state:'connected',localParticipant:local,remoteParticipants:new Map([['remote',remote]]),on:(event,fn)=>{if(!handlers.has(event))handlers.set(event,new Set());handlers.get(event)!.add(fn);},off:(event,fn)=>handlers.get(event)?.delete(fn)};
  const emit=(event:string,...args:any[])=>handlers.get(event)?.forEach(fn=>fn(...args));
  const session=new MeetingInteractionSession(room);session.start();
  const packet=(payload:unknown,participant:typeof remote|undefined=remote,topic=MEETING_TOPIC)=>emit('dataReceived',new TextEncoder().encode(JSON.stringify(payload)),participant,undefined,topic);
  return {room,local,remote,emit,session,packet,handlers};
}
it('shares reliable chat across platforms using authenticated sender identity and ignores spoofed or duplicate packets',async()=>{
 const {session,local,packet}=fixture();
 await session.sendChat(' Hello ');
 expect(local.publishData).toHaveBeenCalledWith(expect.any(Uint8Array),{reliable:true,topic:MEETING_TOPIC});
 const encoded=JSON.parse(new TextDecoder().decode(local.publishData.mock.calls[0][0]));
 expect(encoded).toMatchObject({v:1,type:'chat',text:'Hello'});
 packet({v:1,type:'chat',id:'remote-1',text:'Welcome',name:'Host',sender:'local'});
 packet({v:1,type:'chat',id:'remote-1',text:'Welcome'});
 packet({v:1,type:'chat',id:'invalid',text:'x'.repeat(1001)});
 packet({v:1,type:'chat',id:'wrong-topic',text:'Ignore'},undefined,'other');
 expect(session.snapshot().messages).toHaveLength(2);
 expect(session.snapshot().messages[1]).toMatchObject({name:'Grace',sender:'remote',text:'Welcome'});
 session.dispose();
});
it('syncs hands for late joiners and clears departed participants',async()=>{
 const {session,room,emit}=fixture();
 expect(session.snapshot().hands).toEqual([{identity:'remote',name:'Grace'}]);
 await session.toggleHand();expect(session.snapshot().raised).toBe(true);
 await session.toggleHand();expect(session.snapshot().raised).toBe(false);
 room.remoteParticipants.clear();emit('participantDisconnected');expect(session.snapshot().hands).toEqual([]);
 room.state='reconnecting';emit('connectionStateChanged');expect(session.snapshot().connected).toBe(false);
 await expect(session.sendChat('Offline')).rejects.toThrow('Reconnect');session.dispose();
});
it('keeps failed messages unsent and expires reactions without leaking timers',async()=>{
 vi.useFakeTimers();
 const {session,local}=fixture();
 local.publishData.mockRejectedValueOnce(new Error('Network'));
 await expect(session.sendChat('Draft')).rejects.toThrow('Network');expect(session.snapshot().messages).toEqual([]);
 await session.react('👏');expect(session.snapshot().reactions).toHaveLength(1);
 await expect(session.react('👏')).rejects.toThrow('Wait');
 vi.advanceTimersByTime(5000);expect(session.snapshot().reactions).toEqual([]);
 await session.react('🎉');session.dispose();expect(vi.getTimerCount()).toBe(0);
});
it('bounds long conversations and reactions and removes room listeners on leave',()=>{
 vi.useFakeTimers();const {session,packet,handlers}=fixture();
 for(let i=0;i<250;i++)packet({v:1,type:'chat',id:`chat-${i}`,text:String(i)});
 expect(session.snapshot().messages).toHaveLength(200);expect(session.snapshot().messageCount).toBe(250);
 for(let i=0;i<20;i++)packet({v:1,type:'reaction',id:`reaction-${i}`,text:'👍'});
 expect(session.snapshot().reactions).toHaveLength(8);expect(vi.getTimerCount()).toBe(8);
 session.dispose();expect([...handlers.values()].every(set=>set.size===0)).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
