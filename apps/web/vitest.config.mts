import { defineConfig } from 'vitest/config';

export default defineConfig({
  // tsconfig says jsx: "preserve" (for Next); tests need it compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: { 'server-only': new URL('./test/server-only-stub.ts', import.meta.url).pathname },
  },
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
  },
});
