import { jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  useNetInfo: () => ({ isConnected: true, isInternetReachable: true }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => undefined),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
  })),
}));

jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ loop: false, volume: 1, play: jest.fn(), pause: jest.fn() }),
  setAudioModeAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-image', () => {
  const React = require('react');
  const { Image } = require('react-native');
  return { Image: (props: object) => React.createElement(Image, props) };
});

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return new Proxy(
    { __esModule: true },
    {
      get: (target, name) => {
        if (name in target) return target[name as keyof typeof target];
        return (props: object) => React.createElement(View, { ...props, testID: `icon-${String(name)}` });
      },
    },
  );
});
