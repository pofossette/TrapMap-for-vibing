import type { Command } from 'commander';
import { RegistryService } from '../services/registry-service.js'; import { InstallService } from '../services/install-service.js'; import { UpdateService } from '../services/update-service.js';
export function registerSkillOutdatedCommand(program: Command): void {
  program.command('outdated').description('Check for outdated skills').option('--global', 'Global', false).option('--json', 'JSON', false).action(async (opts: { global: boolean; json: boolean }) => {
    const registry = new RegistryService(); const installer = new InstallService(registry); const updater = new UpdateService(registry, installer);
    const outdated = await updater.checkOutdated(process.cwd(), opts.global ? 'global' : 'project');
    if (opts.json) console.log(JSON.stringify(outdated, null, 2)); else if (outdated.length===0) console.log('All skills up to date'); else for (const o of outdated) console.log(`${o.slug} ${o.current} -> ${o.latest}`);
  });
}
