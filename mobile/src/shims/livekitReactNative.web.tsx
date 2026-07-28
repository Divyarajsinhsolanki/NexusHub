import { PropsWithChildren } from 'react';
import { View } from 'react-native';

export const AudioSession = { startAudioSession: async () => undefined, stopAudioSession: async () => undefined };
export function LiveKitRoom({ children }: PropsWithChildren) { return <>{children}</>; }
export function VideoTrack({ style }: { style?: object }) { return <View style={style} />; }
export function useTracks() { return []; }
export function isTrackReference() { return false; }
export function useLocalParticipant() {
  return {
    localParticipant: { setMicrophoneEnabled: async () => undefined, setCameraEnabled: async () => undefined },
    isMicrophoneEnabled: false,
    isCameraEnabled: false,
  };
}
export function registerGlobals() {}
