import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { API_URL } from '../api/client';

export type EnvironmentIssue = {
  code: 'invalid_url' | 'loopback_unreachable' | 'insecure_transport';
  detail: string;
  title: string;
};

type ValidationOptions = {
  allowInsecure?: boolean;
  allowLoopback?: boolean;
  physicalDevice?: boolean;
  platform?: string;
};

const allowLoopback = process.env.EXPO_PUBLIC_ALLOW_LOOPBACK === 'true';
const allowInsecure = __DEV__;

export function validateApiEnvironment(
  url = API_URL,
  options: ValidationOptions = {},
): EnvironmentIssue | null {
  return validateReachableUrl(url, ['http:', 'https:'], {
    allowInsecure,
    allowLoopback,
    physicalDevice: Device.isDevice,
    platform: Platform.OS,
    ...options,
  });
}

export function validateLiveKitEnvironment(
  url: string,
  options: ValidationOptions = {},
): EnvironmentIssue | null {
  return validateReachableUrl(url, ['ws:', 'wss:'], {
    allowInsecure,
    allowLoopback,
    physicalDevice: Device.isDevice,
    platform: Platform.OS,
    ...options,
  });
}

function validateReachableUrl(
  value: string,
  schemes: string[],
  options: Required<ValidationOptions>,
): EnvironmentIssue | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      code: 'invalid_url',
      title: 'Invalid mobile server address',
      detail: 'Set a complete NexusHub server URL in the mobile environment.',
    };
  }

  if (!schemes.includes(url.protocol)) {
    return {
      code: 'invalid_url',
      title: 'Unsupported server address',
      detail: `Use ${schemes.join(' or ')} for this connection.`,
    };
  }

  const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname.toLowerCase());
  if (options.platform === 'android' && options.physicalDevice && loopback && !options.allowLoopback) {
    return {
      code: 'loopback_unreachable',
      title: 'Phone cannot reach localhost',
      detail: 'Use your computer LAN address for both Rails and LiveKit, then rebuild or reload the development app.',
    };
  }

  const secure = url.protocol === 'https:' || url.protocol === 'wss:';
  if (!secure && !options.allowInsecure) {
    return {
      code: 'insecure_transport',
      title: 'Secure connection required',
      detail: 'Preview and production builds require HTTPS for Rails and WSS for LiveKit.',
    };
  }

  return null;
}
