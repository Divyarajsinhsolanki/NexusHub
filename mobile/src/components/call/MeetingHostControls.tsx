import { useRoomContext } from '@livekit/react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CallSession } from '../../api/types';
import { endpoints } from '../../api/endpoints';
import { apiErrorMessage } from '../../api/client';
import { enableAudioOnly, resumeRemoteVideo, qualityLabel } from '../../../../app/javascript/lib/meetingConnection';

export function MeetingHostControls({callSession}:{callSession:CallSession}) {
  const room=useRoomContext();
  const [call,setCall]=useState(callSession);
  const [quality,setQuality]=useState('unknown');
  const [connection,setConnection]=useState(String(room.state));
  const [audioOnly,setAudioOnly]=useState(false);
  const audioRef=useRef(false);
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const [error,setError]=useState('');
  useEffect(()=>setCall(callSession),[callSession]);
  useEffect(()=>{
    const localVideo=(publication:any)=>{if(audioRef.current && publication.kind==='video'){audioRef.current=false;setAudioOnly(false);resumeRemoteVideo(room);}};
    const refresh=()=>{setQuality(String(room.localParticipant.connectionQuality || 'unknown'));setConnection(String(room.state));};
    const added=()=>{if(audioRef.current)room.remoteParticipants.forEach(p=>p.videoTrackPublications.forEach(publication=>publication.setSubscribed(false)));};
    room.on('localTrackPublished' as any,localVideo);
    room.on('connectionQualityChanged' as any,refresh);room.on('connectionStateChanged' as any,refresh);
    ['trackPublished','participantConnected','reconnected'].forEach(event=>room.on(event as any,added));refresh();
    return()=>{room.off('localTrackPublished' as any,localVideo);room.off('connectionQualityChanged' as any,refresh);room.off('connectionStateChanged' as any,refresh);['trackPublished','participantConnected','reconnected'].forEach(event=>room.off(event as any,added));};
  },[room]);
  const run=async(action:()=>Promise<void>)=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(apiErrorMessage(e));}finally{busyRef.current=false;setBusy(false);}};
  const fallback=()=>run(async()=>{if(audioRef.current){resumeRemoteVideo(room);audioRef.current=false;setAudioOnly(false);}else{await enableAudioOnly(room);audioRef.current=true;setAudioOnly(true);}});
  const action=(userId:number,name:string,kind:'mute'|'remove'|'transfer_host'|'approve'|'reject')=>{
    const execute=()=>{void run(async()=>{const result=await endpoints.hostCallAction(call.id,kind,userId);setCall(result.call_session);});};
    if(['mute','approve','reject'].includes(kind))execute();else Alert.alert(kind==='remove'?`Remove ${name}?`:`Transfer host to ${name}?`,kind==='remove'?'They will be disconnected and cannot obtain another token for this call.':'You will lose host controls.',[{text:'Cancel',style:'cancel'},{text:kind==='remove'?'Remove':'Transfer',style:kind==='remove'?'destructive':'default',onPress:execute}]);
  };
  return <View style={styles.container}><View style={styles.row}><Text accessibilityLiveRegion="polite" style={[styles.quality,{color:['poor','lost'].includes(quality)?'#fde68a':'#86efac'}]}>Connection: {qualityLabel(quality,connection)}</Text>{call.call_type==='video'?<Pressable accessibilityRole="button" accessibilityLabel={audioOnly?'Resume remote video':'Use audio only'} disabled={busy||connection!=='connected'} onPress={()=>{void fallback();}} style={styles.button}><Text style={styles.label}>{audioOnly?'Resume remote video':'Use audio only'}</Text></Pressable>:null}{call.can_end?<Pressable accessibilityRole="button" accessibilityLabel="Host controls" onPress={()=>setOpen(value=>!value)} style={styles.button}><Text style={styles.label}>Host controls{call.participants.some(p=>p.status==='waiting')?` (${call.participants.filter(p=>p.status==='waiting').length} waiting)`:''}</Text></Pressable>:null}</View>{['poor','lost'].includes(quality)&&!audioOnly?<Text style={styles.hint}>Weak connection. Use audio only to reduce bandwidth.</Text>:null}{audioOnly?<Text style={styles.hint}>Camera and sharing are off. Restore video manually when ready.</Text>:null}{error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}{open&&call.can_end?<ScrollView style={styles.list}>{call.participants.filter(p=>['joined','waiting'].includes(p.status)&&p.user_id!==(call.host_id||call.initiator_id)&&!p.removed).map(p=><View key={p.user_id} style={styles.person}><Text style={styles.name}>{p.name}</Text><View style={styles.row}>{(p.status==='waiting' ? ['approve','reject'] as const : ['mute','remove','transfer_host'] as const).map(kind=><Pressable key={kind} accessibilityRole="button" accessibilityLabel={`${kind==='transfer_host'?'Make host':kind} ${p.name}`} disabled={busy} onPress={()=>action(p.user_id,p.name,kind)} style={styles.button}><Text style={styles.label}>{kind==='transfer_host'?'Make host':kind==='mute'?'Mute':kind==='approve'?'Approve':kind==='reject'?'Deny':'Remove'}</Text></Pressable>)}</View></View>)}</ScrollView>:null}</View>;
}
const styles=StyleSheet.create({container:{paddingVertical:6,borderTopWidth:1,borderTopColor:'#ffffff18'},row:{flexDirection:'row',flexWrap:'wrap',gap:6,alignItems:'center',justifyContent:'center'},quality:{fontSize:11},button:{minHeight:44,borderRadius:12,backgroundColor:'#ffffff18',paddingHorizontal:10,justifyContent:'center'},label:{color:'#fff',fontSize:11,fontWeight:'800'},hint:{color:'#cbd5e1',fontSize:11,textAlign:'center',marginTop:4},error:{color:'#fca5a5',fontSize:12,padding:8},list:{maxHeight:160},person:{padding:8,backgroundColor:'#ffffff0c',borderRadius:10,marginTop:6},name:{color:'#fff',fontSize:13,marginBottom:6}});
