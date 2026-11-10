import { defineConfig } from 'vitest/config';

// Only the plain-TypeScript logic (src/auth) is unit-tested here. Screens are checked by
// bundling the app and looking at them, because they need the React Native runtime.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
