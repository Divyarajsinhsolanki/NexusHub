import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    maxWorkers: 2,
    include: ['app/javascript/**/*.test.{js,ts,jsx,tsx}'],
  },
});
