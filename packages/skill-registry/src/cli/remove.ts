import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';
import { skillLockfileSchema } from '../contracts/skill-lock.js';
export function registerSkillRemoveCommand(program: Command): void {
  program
    .command('remove')
    .alias('rm')
    .description('Remove a skill')
    .argument('<slug>', 'Skill slug')
    .option('--global', 'Global', false)
    .action(async (slug: string, opts: { global: boolean }) => {
      const cwd = process.cwd();
      const scope = opts.global ? 'global' : 'project';
      const lockPath =
        scope === 'global'
          ? path.join(process.env.HOME ?? cwd, '.trapmap', 'skills.lock')
          : path.join(cwd, '.trapmap', 'skills.lock');
      const installRoot =
        scope === 'global'
          ? path.join(process.env.HOME ?? cwd, '.trapmap', 'skills', slug)
          : path.join(cwd, '.trapmap', 'skills', slug);
      await rm(installRoot, { recursive: true, force: true });
      try {
        const raw = await readFile(lockPath, 'utf-8');
        const lock = skillLockfileSchema.parse(JSON.parse(raw));
        delete lock.entries[slug];
        lock.generatedAt = new Date().toISOString();
        await writeFile(lockPath, JSON.stringify(lock, null, 2), 'utf-8');
      } catch {}
      console.log(`Removed ${slug}`);
    });
}
