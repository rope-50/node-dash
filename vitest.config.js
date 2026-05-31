import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.js (which sets root: 'client' for the build) so
// tests resolve from the repo root and discover the tests/ directory.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
  },
});
