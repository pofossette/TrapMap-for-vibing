import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/persistence/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.TRAPMAP_DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
