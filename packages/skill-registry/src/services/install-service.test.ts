import { describe, expect, it } from 'vitest';
import { RegistryService } from './registry-service.js';
import { InstallService } from './install-service.js';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { skillLockfileSchema } from '../contracts/skill-lock.js';

describe('InstallService', () => {
  it('installs from local path and writes lockfile', async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), 'trapmap-test-'));
    // create a fake local skill
    const skillDir = path.join(tmp, 'my-skill');
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), '# My Skill\nversion: 1.0.0', 'utf-8');
    const registry = new RegistryService();
    const installer = new InstallService(registry);
    const result = await installer.install(skillDir, {
      cwd: tmp,
      scope: 'project',
      agentTargets: ['trapmap'],
    });
    expect(result.slug).toBe('my-skill');
    expect(result.filesWritten).toBeGreaterThan(0);
    const lockRaw = await readFile(path.join(tmp, '.trapmap', 'skills.lock'), 'utf-8');
    const lock = skillLockfileSchema.parse(JSON.parse(lockRaw));
    expect(lock.entries['my-skill']).toBeDefined();
    await rm(tmp, { recursive: true, force: true });
  });
});
