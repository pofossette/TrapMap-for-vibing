import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/service-governance-review/src/schema.ts',
  out: './packages/service-governance-review/drizzle',
  dbCredentials: { url: process.env.TRAPMAP_DATABASE_URL ?? '' },
});
