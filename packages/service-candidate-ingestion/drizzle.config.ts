import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/service-candidate-ingestion/src/schema.ts',
  out: './packages/service-candidate-ingestion/drizzle',
  dbCredentials: { url: process.env.TRAPMAP_DATABASE_URL ?? '' },
});
