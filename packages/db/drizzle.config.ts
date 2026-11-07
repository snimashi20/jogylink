import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  // Migrations live in the repo-level database/ folder (see database/README.md)
  out: '../../database/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://jogylink:change-me@localhost:5432/jogylink',
  },
});
