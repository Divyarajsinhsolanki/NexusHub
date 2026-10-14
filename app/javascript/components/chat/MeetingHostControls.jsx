import React, { useEffect, useRef, useState } from 'react';
import { useRoomContext } from '@livekit/components-react';
import { hostCallAction } from '../api';
import { enableAudioOnly, resumeRemoteVideo, qualityLabel } from '../../lib/meetingConnection';
export default function MeetingHostControls({callSession}) {
  const room=useRoomContext();
  const [quality,setQuality]=useState('unknown');
  const [connection,setConnection]=useState(room.state);
  const [audioOnly,setAudioOnly]=useState(false);
  const audioRef=useRef(false);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const [error,setError]=useState('');
  const [call,setCall]=useState(callSession);
  useEffect(()=>setCall(callSession),[callSession]);
  useEffect(()=>{
    const localVideo=(publication)=>{if(audioRef.current && publication.kind==='video'){audioRef.current=false;setAudioOnly(false);resumeRemoteVideo(room);}};
    const refresh=()=>{setQuality(room.localParticipant.connectionQuality || 'unknown');setConnection(room.state);};
    const added=()=>{if(audioRef.current)resumeDisabled();};
    const resumeDisabled=()=>room.remoteParticipants.forEach(p=>p.videoTrackPublications.forEach(publication=>publication.setSubscribed(false)));
    room.on('localTrackPublished',localVideo);
    ['connectionQualityChanged','connectionStateChanged'].forEach(event=>room.on(event,refresh));
    ['trackPublished','participantConnected','reconnected'].forEach(event=>room.on(event,added));refresh();
    return()=>{room.off('localTrackPublished',localVideo);['connectionQualityChanged','connectionStateChanged'].forEach(event=>room.off(event,refresh));['trackPublished','participantConnected','reconnected'].forEach(event=>room.off(event,added));};
  },[room]);
  const run=async(action)=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(e?.response?.data?.message || e.message || 'Unable to complete action.');}finally{busyRef.current=false;setBusy(false);}};
  const fallback=()=>run(async()=>{if(audioRef.current){resumeRemoteVideo(room);audioRef.current=false;setAudioOnly(false);}else{await enableAudioOnly(room);audioRef.current=true;setAudioOnly(true);}});
  const action=(target,kind)=>{
    if(!['mute','approve','reject'].includes(kind) && !window.confirm(kind==='remove'?`Remove ${target.name} from this call?`:`Transfer host to ${target.name}? You will lose host controls.`))return;
    return run(async()=>{const {data}=await hostCallAction(call.id,kind,target.user_id);setCall(data.call_session);});
  };
  return <div className="shrink-0 border-t border-white/10 bg-slate-950 px-3 py-2 text-white"><div className="flex flex-wrap items-center justify-center gap-2"><span role="status" className={`text-xs ${['poor','lost'].includes(quality)?'text-amber-200':'text-emerald-200'}`}>Connection: {qualityLabel(quality,connection)}</span>{call.call_type==='video' && <button disabled={busy || connection!=='connected'} onClick={fallback} className="min-h-11 rounded-xl bg-white/10 px-3 text-xs disabled:opacity-40">{audioOnly?'Resume remote video':'Use audio only'}</button>}{call.can_end && <button onClick={()=>setOpen(value=>!value)} aria-expanded={open} className="min-h-11 rounded-xl bg-white/10 px-3 text-xs">Host controls{call.participants.some(p=>p.status==='waiting') ? ` (${call.participants.filter(p=>p.status==='waiting').length} waiting)` : ''}</button>}</div>{['poor','lost'].includes(quality) && !audioOnly && <p className="text-center text-xs text-amber-200">Weak connection. Use audio only to reduce bandwidth.</p>}{audioOnly && <p className="text-center text-xs text-slate-400">Audio only · Camera and sharing are off. Video can be restored manually.</p>}{error && <p role="alert" className="text-sm text-red-300">{error}</p>}{open && call.can_end && <div className="max-h-40 space-y-2 overflow-y-auto py-2">{call.participants.filter(p=>['joined','waiting'].includes(p.status) && p.user_id!==(call.host_id || call.initiator_id) && !p.removed).map(p=><div key={p.user_id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 p-2"><span className="min-w-0 flex-1 text-sm">{p.name}</span>{(p.status==='waiting' ? [['approve','Approve'],['reject','Deny']] : [['mute','Mute'],['remove','Remove'],['transfer_host','Make host']]).map(([kind,label])=><button key={kind} disabled={busy} onClick={()=>action(p,kind)} className="min-h-11 rounded-lg bg-white/10 px-3 text-xs disabled:opacity-40">{label}</button>)}</div>)}</div>}</div>;
}
