import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/service-knowledge-write/src/schema.ts',
  out: './packages/service-knowledge-write/drizzle',
  dbCredentials: { url: process.env.TRAPMAP_DATABASE_URL ?? '' },
});
