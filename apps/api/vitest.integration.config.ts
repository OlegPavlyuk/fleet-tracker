import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/__tests__/integration/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 90_000,
    pool: 'forks',
  },
});
