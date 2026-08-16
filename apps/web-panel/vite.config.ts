import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, normalizePath } from 'vite';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const packageSrc = normalizePath(path.resolve(packageRoot, 'src'));
const clientCoreSrc = normalizePath(
  path.resolve(packageRoot, '../../packages/client-core/src/index.ts'),
);
const contractsSrc = normalizePath(
  path.resolve(packageRoot, '../../packages/contracts/src/index.ts'),
);

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
          const matchPhys = 'apps/web-panel';

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
              return normalizePath(testPath);
            }
          }
          if (fs.existsSync(target)) {
            return normalizePath(target);
          }
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: [
      {
        find: /^@trapmap\/web-panel\/(.*)$/,
        replacement: `${packageSrc}/$1`,
      },
      {
        find: '@trapmap/web-panel',
        replacement: packageSrc,
      },
      {
        find: '@trapmap/client-core',
        replacement: clientCoreSrc,
      },
      {
        find: '@trapmap/contracts',
        replacement: contractsSrc,
      },
    ],
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
