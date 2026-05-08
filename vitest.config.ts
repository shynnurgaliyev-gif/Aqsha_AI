import { defineConfig } from 'vitest/config';

/**
 * Single root config for the whole monorepo.
 *
 * Tests live in __tests__ folders next to source they cover. Pure functions
 * only — DB-dependent code is intentionally not unit-tested here (would need
 * a test database; covered by integration smoke tests instead).
 */
export default defineConfig({
  test: {
    include: [
      'packages/**/__tests__/**/*.test.ts',
      'apps/**/__tests__/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
    ],
    environment: 'node',
    globals: false,
    reporters: ['default'],
    // Tests should be fast — no test should hit the network or filesystem.
    testTimeout: 5_000,
  },
});
