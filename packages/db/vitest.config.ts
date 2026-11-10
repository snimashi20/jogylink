import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The tests start a real in-memory PostgreSQL (PGlite) and run every migration before the
    // first test. On a busy laptop (Docker, dev servers) that can take more than Vitest's default
    // 10 seconds, which fails the whole file. Same limits as apps/api.
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
