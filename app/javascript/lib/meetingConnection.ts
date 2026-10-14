// Audio-only mode changes subscriptions and local video; microphone stays untouched.
export async function enableAudioOnly(room: any) {
  await room.localParticipant.setCameraEnabled(false);
  await room.localParticipant.setScreenShareEnabled(false);
  room.remoteParticipants.forEach((participant: any) => participant.videoTrackPublications.forEach((publication: any) => publication.setSubscribed(false)));
}
export function resumeRemoteVideo(room: any) {
  room.remoteParticipants.forEach((participant: any) => participant.videoTrackPublications.forEach((publication: any) => publication.setSubscribed(true)));
  // Do not automatically turn the user's camera or screen sharing back on.
}
export function qualityLabel(quality: string, state: string) {
  if (state !== 'connected') return state === 'reconnecting' ? 'Reconnecting' : 'Disconnected';
  return ({excellent:'Excellent',good:'Good',poor:'Poor',lost:'Lost'} as Record<string,string>)[quality] || 'Measuring';
}
