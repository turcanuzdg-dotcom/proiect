import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'server/test/**/*.test.ts', 'web/src/**/*.test.ts', 'web/src/**/*.test.tsx', 'punte/src/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
