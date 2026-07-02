import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@trapmap/web-panel': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 4173,
  },
  preview: {
    port: 4173,
  },
});
