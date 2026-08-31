import type { Command } from 'commander';
import { RegistryService } from '../services/registry-service.js';
import { InstallService } from '../services/install-service.js';
export function registerSkillAddCommand(program: Command): void {
  program
    .command('add')
    .description('Add a skill from registry')
    .argument('<source>', 'Skill source')
    .option('--agent <agent>', 'Target agent', 'trapmap')
    .option('--global', 'Global scope', false)
    .option('--json', 'JSON', false)
    .action(async (source: string, opts: { agent: string; global: boolean; json: boolean }) => {
      const registry = new RegistryService();
      const installer = new InstallService(registry);
      const agents =
        opts.agent === 'all' ? ['claude-code', 'codex', 'cursor', 'trapmap'] : [opts.agent];
      const result = await installer.install(source, {
        scope: opts.global ? 'global' : 'project',
        agentTargets: agents,
      });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else
        console.log(
          `Installed ${result.slug}@${result.version ?? 'unknown'} -> ${result.installedPath}`,
        );
    });
}
