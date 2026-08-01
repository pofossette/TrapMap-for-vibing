import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { type BackendTargetAction, resolveBackendTargetCommands } from '../run-backend-target';

const packageJsonPath = fileURLToPath(new URL('../../package.json', import.meta.url));

async function rootScripts(): Promise<Record<string, string>> {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    scripts: Record<string, string>;
  };
  return packageJson.scripts;
}

describe('backend target build entrypoints', () => {
  it.each([
    ['build:light', 'build', 'light'],
    ['build:heavy', 'build', 'heavy'],
    ['test:light-target', 'test', 'light'],
    ['test:heavy-target', 'test', 'heavy'],
  ] as const)('maps %s through the registry runner', async (scriptName, action, targetName) => {
    const scripts = await rootScripts();

    expect(scripts[scriptName]).toBe(
      `pnpm exec tsx --tsconfig tsconfig.base.json scripts/run-backend-target.ts ${action} ${targetName}`,
    );
  });

  it('maps light to the local host and local verification evidence only', () => {
    expect(resolveBackendTargetCommands('light', 'build')).toEqual([
      ['pnpm', '--filter', '@trapmap/host-local', 'build'],
    ]);
    expect(resolveBackendTargetCommands('light', 'test')).toEqual([
      ['pnpm', 'test:deployment-smoke'],
      ['pnpm', 'test:runtime-foundations'],
    ]);
  });

  it('does not start distributed workers for the light target', () => {
    const commands = resolveBackendTargetCommands('light', 'test').flat().join(' ');

    expect(commands).not.toContain('@trapmap/host-distributed');
    expect(commands).not.toContain('worker');
    expect(commands).not.toContain('distributed');
  });

  it('maps heavy to gateway-only distributed verification evidence', () => {
    expect(resolveBackendTargetCommands('heavy', 'build')).toEqual([
      ['pnpm', '--filter', '@trapmap/host-distributed', 'build'],
    ]);
    expect(resolveBackendTargetCommands('heavy', 'test')).toEqual([
      ['pnpm', 'test:deployment-smoke'],
      ['pnpm', 'test:runtime-foundations'],
      ['pnpm', 'test:discovery-closeout'],
      ['pnpm', 'test:distributed-closeout'],
      ['pnpm', 'test:runtime-closeout'],
    ]);
  });

  it('keeps heavy gateway-only without client internal service URLs', () => {
    const commands = resolveBackendTargetCommands('heavy', 'test').flat().join(' ');

    expect(commands).not.toMatch(/https?:\/\//);
    expect(commands).not.toContain('knowledge-write');
    expect(commands).not.toContain('identity-access');
  });

  it.each<readonly [string, BackendTargetAction]>([
    ['unknown', 'build'],
    ['toString', 'build'],
    ['light', 'unknown' as BackendTargetAction],
  ])('rejects unknown target input (%s)', (targetName, action) => {
    expect(() => resolveBackendTargetCommands(targetName, action)).toThrow(
      'Unknown backend target',
    );
  });
});
