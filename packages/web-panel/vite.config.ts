import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const getPackageRoot = () => {
  const cwd = process.cwd();
  if (cwd.endsWith('packages/web-panel')) {
    return cwd;
  }
  return path.resolve(cwd, 'packages/web-panel');
};

const packageRoot = getPackageRoot();

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'trapmap-alias-fix',
      enforce: 'pre',
      resolveId(source) {
        if (source.includes('@trapmap/web-panel') || source.includes('packages/web-panel')) {
          let subPath = '';
          const matchPackage = '@trapmap/web-panel';
          const matchPhys = 'packages/web-panel';

          if (source.includes(matchPackage)) {
            const idx = source.indexOf(matchPackage);
            subPath = source.substring(idx + matchPackage.length);
          } else if (source.includes(matchPhys)) {
            const idx = source.indexOf(matchPhys);
            subPath = source.substring(idx + matchPhys.length);
            if (subPath.startsWith('/src')) {
              subPath = subPath.substring('/src'.length);
            }
          }

          if (subPath.startsWith('/')) {
            subPath = subPath.substring(1);
          }

          if (!subPath || subPath === 'src' || subPath.startsWith('node_modules')) {
            return null;
          }

          const target = path.resolve(packageRoot, 'src', subPath);
          for (const ext of [
            '.tsx',
            '.ts',
            '.jsx',
            '.js',
            '/index.tsx',
            '/index.ts',
            '/index.jsx',
            '/index.js',
          ]) {
            const testPath = target.endsWith('/') ? target.slice(0, -1) + ext : target + ext;
            if (fs.existsSync(testPath)) {
              return testPath;
            }
          }
          if (fs.existsSync(target)) {
            return target;
          }
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: {
      '@trapmap/web-panel/app': path.resolve(packageRoot, 'src/app'),
      '@trapmap/web-panel/pages': path.resolve(packageRoot, 'src/pages'),
      '@trapmap/web-panel/shared': path.resolve(packageRoot, 'src/shared'),
      '@trapmap/web-panel/stores': path.resolve(packageRoot, 'src/stores'),
      '@trapmap/web-panel/services': path.resolve(packageRoot, 'src/services'),
      '@trapmap/web-panel/features': path.resolve(packageRoot, 'src/features'),
      '@trapmap/web-panel': path.resolve(packageRoot, 'src'),
    },
  },
  optimizeDeps: {
    exclude: ['@trapmap/web-panel'],
  },
  server: {
    port: 4173,
  },
  preview: {
    port: 4173,
  },
});
