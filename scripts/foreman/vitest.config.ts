import { defineConfig } from 'vitest/config';

// Level design probes for FOREMAN (`pnpm probe`): slow searches kept out of CI.
export default defineConfig({
  test: {
    include: ['scripts/foreman/**/*.tune.test.ts'],
    environment: 'node',
    testTimeout: 3_600_000,
  },
});
