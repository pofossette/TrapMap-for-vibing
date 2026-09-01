import type { Command } from 'commander';
import { InstallService } from '../services/install-service.js';
import { RegistryService } from '../services/registry-service.js';
export function registerSkillInstallCommand(program: Command): void {
  program
    .command('install')
    .description('Install all skills from lockfile')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (opts: { global: boolean; json: boolean }) => {
      const registry = new RegistryService();
      const installer = new InstallService(registry);
      const results = await installer.installFromLockfile({
        scope: opts.global ? 'global' : 'project',
      });
      if (opts.json) console.log(JSON.stringify(results, null, 2));
      else console.log(`Installed ${results.length} skills`);
    });
}
