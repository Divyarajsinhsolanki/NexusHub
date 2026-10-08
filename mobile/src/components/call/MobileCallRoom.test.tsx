import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { expect, jest, test, beforeEach } from '@jest/globals';
import { Alert, Platform } from 'react-native';
import { Track } from 'livekit-client';
import { MobileCallRoom } from './MobileCallRoom';
import type { LiveKitCredentials } from '../../api/types';

let mockSharing = false;
let mockTracks: any[] = [];
const mockSetScreenShare = jest.fn<(enabled: boolean) => Promise<void>>();
jest.mock('@livekit/react-native', () => ({
  AudioSession: { startAudioSession: jest.fn(async () => undefined), stopAudioSession: jest.fn(async () => undefined) },
  LiveKitRoom: ({ children }: any) => children,
  VideoTrack: ({ trackRef, objectFit }: any) => {
    const { Text } = require('react-native');
    return <Text>{trackRef.participant.name} {objectFit}</Text>;
  },
  isTrackReference: (track: any) => Boolean(track.publication),
  useConnectionState: () => 'connected',
  useLocalParticipant: () => ({
    localParticipant: { setScreenShareEnabled: mockSetScreenShare },
    isMicrophoneEnabled: true, isCameraEnabled: false, isScreenShareEnabled: mockSharing,
  }),
  useParticipants: () => [],
  useTracks: () => mockTracks,
}));
jest.mock('../../theme', () => ({ useAppTheme: () => ({ primary: '#2563eb', background: '#ffffff', text: '#000000', border: '#cccccc' }) }));
jest.mock('../../observability/callDiagnostics', () => ({ captureCallError: jest.fn(), recordCallBreadcrumb: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
const credentials = { server_url: 'wss://example.test', participant_token: 'test', call_session: { id: 1, call_type: 'audio', participants: [], share_url: 'https://example.test/meet/1' } } as unknown as LiveKitCredentials;
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, "OS", "android");
  mockTracks = [];
  mockSharing = false;
  mockSetScreenShare.mockResolvedValue(undefined);
});
test('starts and stops screen sharing', async () => {
  const screen = await render(<MobileCallRoom credentials={credentials} onEnd={() => {}} onLeave={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share screen' }));
  await waitFor(() => expect(mockSetScreenShare).toHaveBeenCalledWith(true));
  mockSharing = true;
  await screen.rerender(<MobileCallRoom credentials={credentials} onEnd={() => {}} onLeave={() => {}} />);
  expect(screen.getByText('Your screen is being shared')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Stop sharing' }));
  await waitFor(() => expect(mockSetScreenShare).toHaveBeenCalledWith(false));
});
test('shows a remote shared screen in a voice call without cropping', async () => {
  mockTracks = [{ source: Track.Source.ScreenShare, publication: {}, participant: { identity: 'remote', name: 'Teammate' } }];
  const screen = await render(<MobileCallRoom credentials={credentials} onEnd={() => {}} onLeave={() => {}} />);
  expect(screen.getByText('Teammate contain')).toBeTruthy();
  expect(screen.getByText('Teammate · Screen')).toBeTruthy();
});
test('reports rejected capture and lets the user retry', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockSetScreenShare.mockRejectedValueOnce(new Error('Cancelled'));
  const screen = await render(<MobileCallRoom credentials={credentials} onEnd={() => {}} onLeave={() => {}} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Share screen' }));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('Screen sharing unavailable', expect.any(String)));
  await fireEvent.press(screen.getByRole('button', { name: 'Share screen' }));
  await waitFor(() => expect(mockSetScreenShare).toHaveBeenCalledTimes(2));
  alert.mockRestore();
});
