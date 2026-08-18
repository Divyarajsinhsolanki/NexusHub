import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';

describe('LiveKit native bootstrap', () => {
  test('registers React Native globals before Expo Router evaluates routes', () => {
    const entry = fs.readFileSync(path.join(process.cwd(), 'index.js'), 'utf8');
    const globals = entry.indexOf('registerGlobals()');
    const notifications = entry.indexOf("require('./src/notifications/backgroundTask')");
    const router = entry.indexOf("require('expo-router/entry')");

    expect(globals).toBeGreaterThanOrEqual(0);
    expect(notifications).toBeGreaterThan(globals);
    expect(router).toBeGreaterThan(notifications);
  });
});
