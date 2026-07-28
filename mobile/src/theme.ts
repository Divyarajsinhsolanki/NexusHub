import { useColorScheme } from 'react-native';

const shared = {
  primary: '#2563eb',
  primaryPressed: '#1d4ed8',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  white: '#ffffff',
};

export const lightTheme = {
  ...shared,
  background: '#f4f6f8',
  surface: '#ffffff',
  surfaceMuted: '#e9edf2',
  text: '#172033',
  textMuted: '#667085',
  border: '#d9dee7',
  tabBar: '#ffffff',
};

export const darkTheme = {
  ...shared,
  background: '#111315',
  surface: '#1b1e22',
  surfaceMuted: '#252a30',
  text: '#f2f4f7',
  textMuted: '#a4acb9',
  border: '#343a43',
  tabBar: '#181b1f',
};

export type AppTheme = typeof lightTheme;

export function useAppTheme(): AppTheme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
