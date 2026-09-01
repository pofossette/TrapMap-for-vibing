import type { Command } from 'commander';
import { MergeService } from '../services/merge-service.js';
export function registerSkillStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Show working tree status for skills')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (opts: { global: boolean; json: boolean }) => {
      const svc = new MergeService();
      const result = await svc.status(process.cwd(), opts.global ? 'global' : 'project');
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else
        for (const r of result) console.log(`${r.slug}: ${r.hasLocalEdits ? 'modified' : 'clean'}`);
    });
}
