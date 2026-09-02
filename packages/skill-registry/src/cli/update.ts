import type { Command } from 'commander';
import { InstallService } from '../services/install-service.js';
import { RegistryService } from '../services/registry-service.js';
import { UpdateService } from '../services/update-service.js';
export function registerSkillUpdateCommand(program: Command): void {
  program
    .command('update')
    .description('Update skills')
    .argument('[slug]', 'Specific slug or all')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (slug: string | undefined, opts: { global: boolean; json: boolean }) => {
      const registry = new RegistryService();
      const installer = new InstallService(registry);
      const updater = new UpdateService(registry, installer);
      const scope = opts.global ? 'global' : 'project';
      const results = slug
        ? [await updater.update(slug, { scope })]
        : await updater.updateAll(process.cwd(), scope);
      if (opts.json) console.log(JSON.stringify(results, null, 2));
      else
        for (const r of results)
          console.log(
            r.updated
              ? `Updated ${r.slug} ${r.from} -> ${r.to}`
              : `Skip ${r.slug}: ${r.reason ?? 'up to date'}`,
          );
    });
}
