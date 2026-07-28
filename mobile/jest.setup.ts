import { jest } from '@jest/globals';

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
  })),
}));

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
