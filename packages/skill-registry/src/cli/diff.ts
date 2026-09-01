import type { Command } from 'commander';
import { MergeService } from '../services/merge-service.js';
import { RegistryService } from '../services/registry-service.js';
export function registerSkillDiffCommand(program: Command): void {
  program
    .command('diff')
    .description('Show diff between local and remote skill')
    .argument('<source>', 'Skill source')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (source: string, opts: { global: boolean; json: boolean }) => {
      const registry = new RegistryService();
      const bundle = await registry.fetchBundle(source);
      const svc = new MergeService();
      const cwd = process.cwd();
      const scope = opts.global ? 'global' : 'project';
      const localDir =
        scope === 'global'
          ? `${process.env.HOME ?? cwd}/.trapmap/skills/${bundle.slug}`
          : `${cwd}/.trapmap/skills/${bundle.slug}`;
      const baseDir = `${cwd}/.trapmap/.cache/skills/${bundle.slug}`;
      const check = await svc.check(baseDir, localDir, bundle);
      if (opts.json) console.log(JSON.stringify(check, null, 2));
      else {
        console.log(
          `Diff ${bundle.slug} -> hasLocalEdits=${check.hasLocalEdits} canFastForward=${check.canFastForward}`,
        );
        for (const f of check.diff.files) console.log(`  ${f.status} ${f.path}`);
      }
    });
}
