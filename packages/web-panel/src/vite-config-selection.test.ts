// @vitest-environment node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(currentDir, '..');

describe('vite config selection', () => {
  it('loads a config that exposes the web-panel self aliases', async () => {
    const config = await resolveConfig({ root: packageRoot }, 'serve');

    expect(config.configFile).not.toBe(path.resolve(packageRoot, 'vite.config.js'));

    const aliasReplacements = config.resolve.alias.map((entry) => entry.replacement);

    expect(aliasReplacements).toContain(path.resolve(packageRoot, 'src'));
    expect(aliasReplacements).toContain(path.resolve(packageRoot, 'src/app'));
    expect(aliasReplacements).toContain(path.resolve(packageRoot, 'src/stores'));
  });
});
