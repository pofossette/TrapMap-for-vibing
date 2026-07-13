import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/service-identity-access/src/schema.ts',
  out: './packages/service-identity-access/drizzle',
  dbCredentials: { url: process.env.TRAPMAP_DATABASE_URL ?? '' },
});
