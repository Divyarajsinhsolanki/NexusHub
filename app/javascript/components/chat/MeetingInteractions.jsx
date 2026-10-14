import React, { useEffect, useRef, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { Hand, MessageCircle, X } from 'lucide-react';
import { MeetingInteractionSession, MEETING_REACTIONS } from '../../lib/meetingInteractionSession';

export default function MeetingInteractions() {
  const room = useRoomContext();
  const session = useRef(null);
  const [state,setState]=useState({messages:[],hands:[],reactions:[],raised:false,connected:false,messageCount:0});
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [read,setRead]=useState(0);
  const bottom=useRef(null);
  useEffect(()=>{ const current=new MeetingInteractionSession(room); session.current=current; current.start(); const unsubscribe=current.subscribe(setState); return()=>{unsubscribe();current.dispose();session.current=null;}; },[room]);
  useEffect(()=>{if(open){setRead(state.messageCount);bottom.current?.scrollIntoView?.({block:'nearest'});}},[open,state.messages]);
  const act=async(action)=>{setError('');try{await action();}catch(e){setError(e.message || 'Unable to send. Try again.');}};
  const send=async(event)=>{event.preventDefault();if(busy)return;setBusy(true);try{await session.current.sendChat(draft);setDraft('');setError('');}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <section className="shrink-0 border-t border-white/10 bg-slate-950 px-3 py-2 text-white" aria-label="Meeting interactions">
    {state.reactions.length>0 && <div aria-live="polite" className="flex flex-wrap justify-center gap-2 py-2">{state.reactions.map(reaction=><span key={reaction.id} className="rounded-full bg-white/10 px-3 py-1 text-sm">{reaction.emoji} {reaction.name}</span>)}</div>}
    {state.hands.length>0 && <p aria-live="polite" className="max-h-16 overflow-y-auto pb-2 text-xs text-amber-200">✋ {state.hands.map(person=>person.name).join(', ')}</p>}
    <div className="flex flex-wrap items-center justify-center gap-2"><button onClick={()=>setOpen(value=>!value)} aria-expanded={open} className="flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm"><MessageCircle size={18}/>Chat{!open && state.messageCount>read ? ` (${state.messageCount-read})` : ''}</button><button disabled={!state.connected} aria-pressed={state.raised} onClick={()=>act(()=>session.current.toggleHand())} className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm disabled:opacity-40 ${state.raised?'bg-amber-500 text-black':'bg-white/10'}`}><Hand size={18}/>{state.raised?'Lower hand':'Raise hand'}</button>{MEETING_REACTIONS.map(emoji=><button key={emoji} aria-label={`React ${emoji}`} disabled={!state.connected} onClick={()=>act(()=>session.current.react(emoji))} className="min-h-11 min-w-11 rounded-xl bg-white/10 text-xl disabled:opacity-40">{emoji}</button>)}</div>
    {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    {open && <div className="mt-2 rounded-xl border border-white/10 p-3"><header className="flex items-center justify-between"><div><h3 className="text-sm font-bold">Meeting chat</h3><p className="text-xs text-slate-400">Room only · Messages aren’t saved after leaving.</p></div><button aria-label="Close meeting chat" onClick={()=>setOpen(false)} className="p-3"><X size={18}/></button></header><div role="log" aria-live="polite" className="max-h-40 space-y-2 overflow-y-auto py-3">{state.messages.map(message=><div key={message.id} className="rounded-lg bg-white/5 p-2"><p className="text-xs text-sky-300">{message.name}</p><p className="whitespace-pre-wrap break-words text-sm">{message.text}</p></div>)}{!state.messages.length && <p className="text-xs text-slate-400">Send a message to people in this meeting.</p>}<div ref={bottom}/></div><form onSubmit={send} className="flex gap-2"><input aria-label="Meeting message" value={draft} maxLength={1000} onChange={event=>setDraft(event.target.value)} disabled={busy} className="min-w-0 flex-1 rounded-lg bg-white/10 px-3 py-2 text-sm" placeholder="Message this meeting…"/><button disabled={busy || !state.connected || !draft.trim()} className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-bold disabled:opacity-40">{busy?'Sending…':'Send'}</button></form></div>}
  </section>;
}
