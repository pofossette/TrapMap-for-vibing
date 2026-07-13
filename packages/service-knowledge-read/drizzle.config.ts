import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/service-knowledge-read/src/schema.ts',
  out: './packages/service-knowledge-read/drizzle',
  dbCredentials: { url: process.env.TRAPMAP_DATABASE_URL ?? '' },
});
