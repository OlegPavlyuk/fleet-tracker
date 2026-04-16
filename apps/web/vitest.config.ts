import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    css: false,
    pool: 'forks', // each test file in its own process — prevents React act() conflicts when running alongside other workspaces
    exclude: ['**/node_modules/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
    },
  },
});
