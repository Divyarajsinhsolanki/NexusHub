import { describe, expect, test } from '@jest/globals';

import { validateApiEnvironment, validateLiveKitEnvironment } from './runtimeEnvironment';

const physicalAndroid = { allowInsecure: true, allowLoopback: false, physicalDevice: true, platform: 'android' };

describe('physical-device environment validation', () => {
  test('rejects loopback Rails and LiveKit hosts on physical Android', () => {
    expect(validateApiEnvironment('http://localhost:3000/api', physicalAndroid)?.code).toBe('loopback_unreachable');
    expect(validateLiveKitEnvironment('ws://127.0.0.1:7880', physicalAndroid)?.code).toBe('loopback_unreachable');
    expect(validateApiEnvironment('http://[::1]:3000/api', physicalAndroid)?.code).toBe('loopback_unreachable');
  });

  test('accepts LAN development hosts when insecure development is explicit', () => {
    expect(validateApiEnvironment('http://192.168.1.42:3000/api', physicalAndroid)).toBeNull();
    expect(validateLiveKitEnvironment('ws://192.168.1.42:7880', physicalAndroid)).toBeNull();
  });

  test('requires secure transports outside development', () => {
    const release = { ...physicalAndroid, allowInsecure: false };
    expect(validateApiEnvironment('http://192.168.1.42:3000/api', release)?.code).toBe('insecure_transport');
    expect(validateLiveKitEnvironment('wss://media.example.test', release)).toBeNull();
  });
});
