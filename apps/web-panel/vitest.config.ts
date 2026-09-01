import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    globals: true,
    setupFiles: [],
  },
  resolve: {
    alias: {
      '@trapmap/web-panel': path.resolve(__dirname, 'src'),
    },
  },
});
