import { render } from '@testing-library/react-native';
import { expect, jest, test } from '@jest/globals';
import { useAudioPlayer } from 'expo-audio';
import { IncomingRingtone } from './IncomingCallCoordinator';

jest.mock('expo-audio', () => ({ useAudioPlayer: jest.fn() }));

test('answering unmounts the ringtone without touching an already released native player', async () => {
  const pause = jest.fn(() => { throw new Error('Cannot use shared object that was already released'); });
  const play = jest.fn();
  jest.mocked(useAudioPlayer).mockReturnValue({ loop: false, volume: 1, play, pause } as unknown as ReturnType<typeof useAudioPlayer>);
  const screen = await render(<IncomingRingtone callType="audio" />);
  expect(play).toHaveBeenCalled();
  await screen.unmount();
  expect(pause).not.toHaveBeenCalled();
});
