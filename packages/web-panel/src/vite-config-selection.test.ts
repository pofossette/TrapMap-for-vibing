// @vitest-environment node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizePath, resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(currentDir, '..');

describe('vite config selection', () => {
  it('loads a config that exposes the web-panel self aliases', async () => {
    const config = await resolveConfig({ root: packageRoot }, 'serve');

    expect(config.configFile).not.toBe(path.resolve(packageRoot, 'vite.config.js'));

    const aliasReplacements = config.resolve.alias.map((entry) => entry.replacement);
    const packageSrc = normalizePath(path.resolve(packageRoot, 'src'));
    const clientCoreSrc = normalizePath(path.resolve(packageRoot, '../client-core/src/index.ts'));
    const contractsSrc = normalizePath(path.resolve(packageRoot, '../contracts/src/index.ts'));

    expect(aliasReplacements).toContain(packageSrc);
    expect(aliasReplacements).toContain(`${packageSrc}/$1`);
    expect(aliasReplacements).toContain(clientCoreSrc);
    expect(aliasReplacements).toContain(contractsSrc);
  });
});
