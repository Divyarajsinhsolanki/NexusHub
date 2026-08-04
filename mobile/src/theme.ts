import { createContext, createElement, PropsWithChildren, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';

import { useAuth } from './auth/AuthProvider';

const shared = {
  primary: '#2563eb',
  primaryPressed: '#1d4ed8',
  success: '#15803d',
  warning: '#b45309',
  danger: '#b91c1c',
  white: '#ffffff',
};

export const themePresets = [
  { name: 'Blue', key: 'blue', value: '#3b82f6' },
  { name: 'Indigo', key: 'indigo', value: '#6366f1' },
  { name: 'Emerald', key: 'emerald', value: '#10b981' },
  { name: 'Violet', key: 'violet', value: '#8b5cf6' },
  { name: 'Rose', key: 'rose', value: '#f43f5e' },
  { name: 'Amber', key: 'amber', value: '#f59e0b' },
  { name: 'Slate', key: 'slate', value: '#475569' },
];

const themePresetMap = Object.fromEntries(themePresets.map((preset) => [preset.key, preset.value]));

export const lightTheme = {
  ...shared,
  isDark: false,
  background: '#f4f6f8',
  surface: '#ffffff',
  surfaceRaised: '#ffffff',
  surfaceMuted: '#e9edf2',
  surfacePressed: '#eef2f7',
  primarySoft: '#dbeafe',
  text: '#172033',
  textMuted: '#667085',
  border: '#d9dee7',
  shadow: 'rgba(15, 23, 42, 0.14)',
  tabBar: '#ffffff',
};

export const darkTheme = {
  ...shared,
  isDark: true,
  background: '#111315',
  surface: '#1b1e22',
  surfaceRaised: '#20242a',
  surfaceMuted: '#252a30',
  surfacePressed: '#303640',
  primarySoft: '#1e3a5f',
  text: '#f2f4f7',
  textMuted: '#a4acb9',
  border: '#343a43',
  shadow: 'rgba(0, 0, 0, 0.42)',
  tabBar: '#181b1f',
};

export type AppTheme = typeof lightTheme;

const AppThemeContext = createContext<AppTheme | null>(null);

export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const { user } = useAuth();
  const preferences = user?.preferences;
  const darkMode = preferences?.dark_mode ?? user?.dark_mode ?? systemScheme === 'dark';
  const primary = resolvePrimary(preferences?.color_theme || user?.color_theme);
  const theme = useMemo(() => {
    const base = darkMode ? darkTheme : lightTheme;
    return {
      ...base,
      primary,
      primaryPressed: darken(primary, 0.18),
    };
  }, [darkMode, primary]);

  return createElement(AppThemeContext.Provider, { value: theme }, children);
}

export function useAppTheme(): AppTheme {
  const provided = useContext(AppThemeContext);
  const systemScheme = useColorScheme();
  return provided || (systemScheme === 'dark' ? darkTheme : lightTheme);
}

function resolvePrimary(value?: string | null) {
  if (!value) return shared.primary;
  if (value.startsWith('#')) return value;
  return themePresetMap[value] || shared.primary;
}

function darken(hex: string, amount: number) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : shared.primary;
  const value = normalized.replace('#', '');
  const channels = [0, 2, 4].map((index) => {
    const channel = parseInt(value.slice(index, index + 2), 16);
    return Math.max(0, Math.round(channel * (1 - amount))).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}
