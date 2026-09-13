import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.mts', 'tests/integration/**/*.test.mts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
