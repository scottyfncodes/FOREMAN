import { defineConfig } from 'vitest/config';

// Slow design searches for the house campaign (`pnpm par`), kept out of CI.
export default defineConfig({ test: { include: ['scripts/golf/**/*.tune.test.ts'], environment: 'node', testTimeout: 7_200_000 } });
