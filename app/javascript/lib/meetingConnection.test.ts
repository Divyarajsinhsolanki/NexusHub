import { expect, it, vi } from 'vitest';
import { enableAudioOnly, resumeRemoteVideo, qualityLabel } from './meetingConnection';
it('drops camera, screen sharing and remote video while preserving microphone privacy on resume',async()=>{
 const publication={setSubscribed:vi.fn()};
 const room={localParticipant:{setCameraEnabled:vi.fn(async()=>{}),setScreenShareEnabled:vi.fn(async()=>{}),setMicrophoneEnabled:vi.fn()},remoteParticipants:new Map([['remote',{videoTrackPublications:new Map([['video',publication]])}]])};
 await enableAudioOnly(room);
 expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledWith(false);
 expect(room.localParticipant.setScreenShareEnabled).toHaveBeenCalledWith(false);
 expect(publication.setSubscribed).toHaveBeenCalledWith(false);
 resumeRemoteVideo(room);expect(publication.setSubscribed).toHaveBeenLastCalledWith(true);
 expect(room.localParticipant.setCameraEnabled).toHaveBeenCalledTimes(1);expect(room.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled();
});
it('reports real quality and reconnect status honestly',()=>{
 expect(qualityLabel('poor','connected')).toBe('Poor');expect(qualityLabel('unknown','connected')).toBe('Measuring');expect(qualityLabel('excellent','reconnecting')).toBe('Reconnecting');
});
