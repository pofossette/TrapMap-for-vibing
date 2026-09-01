import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { skillLockfileSchema } from '../contracts/skill-lock.js';
export function registerSkillListCommand(program: Command): void {
  program
    .command('list')
    .description('List installed skills')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (opts: { global: boolean; json: boolean }) => {
      const lockPath = opts.global
        ? path.join(process.env.HOME ?? process.cwd(), '.trapmap', 'skills.lock')
        : path.join(process.cwd(), '.trapmap', 'skills.lock');
      try {
        const raw = await readFile(lockPath, 'utf-8');
        const lock = skillLockfileSchema.parse(JSON.parse(raw));
        const entries = Object.values(lock.entries);
        if (opts.json) console.log(JSON.stringify(entries, null, 2));
        else
          for (const e of entries)
            console.log(`${e.slug}@${e.version} (${e.scope}) ${e.source.canonical}`);
      } catch {
        console.log(opts.json ? '[]' : 'No lockfile found');
      }
    });
}
