import {
  InstallService,
  MergeService,
  RegistryService,
  UpdateService,
} from '@trapmap/skill-registry';
import type { Command } from 'commander';

export function registerRegistryCommands(program: Command): void {
  const registry = program
    .command('registry')
    .description('Skill package registry (skills.sh / GitHub / ai-pkgs / local)');

  // trapmap skill add <source> — mirrors ai-pkgs skills add + ccswitch install
  registry
    .command('add')
    .argument(
      '<source>',
      'Skill source: owner/repo, skills.sh/<slug>, github:owner/repo, ./local-path',
    )
    .option('--agent <agent>', 'Target agent (claude-code, codex, cursor, trapmap, all)', 'trapmap')
    .option('--global', 'Global scope', false)
    .option('--json', 'JSON output', false)
    .action(async (source: string, opts: { agent: string; global: boolean; json: boolean }) => {
      const svc = new RegistryService();
      const installer = new InstallService(svc);
      const agents =
        opts.agent === 'all' ? ['claude-code', 'codex', 'cursor', 'trapmap'] : [opts.agent];
      const result = await installer.install(source, {
        scope: opts.global ? 'global' : 'project',
        agentTargets: agents,
      });
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else
        console.log(
          `Installed ${result.slug}@${result.version ?? 'unknown'} -> ${result.installedPath} (${result.filesWritten} files)`,
        );
    });

  registry
    .command('search')
    .argument('<query>', 'Search query')
    .option('--limit <n>', 'Limit', '10')
    .option('--json', 'JSON output', false)
    .action(async (query: string, opts: { limit: string; json: boolean }) => {
      const svc = new RegistryService();
      const all = await svc.searchAll({ query, limit: Number.parseInt(opts.limit, 10) });
      if (opts.json) console.log(JSON.stringify(all, null, 2));
      else {
        for (const r of all) {
          console.log(`\n[${r.registry}]`);
          for (const e of r.entries)
            console.log(`  - ${e.slug} ${e.latestVersion ?? ''} — ${e.description ?? ''}`);
        }
        if (all.length === 0) console.log('No results');
      }
    });

  registry
    .command('list')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (opts: { global: boolean; json: boolean }) => {
      const { readFile } = await import('node:fs/promises');
      const { skillLockfileSchema } = await import('@trapmap/skill-registry');
      const path = await import('node:path');
      const lockPath = opts.global
        ? path.join(process.env.HOME ?? process.cwd(), '.trapmap', 'skills.lock')
        : path.join(process.cwd(), '.trapmap', 'skills.lock');
      try {
        const raw = await readFile(lockPath, 'utf-8');
        const lock = skillLockfileSchema.parse(JSON.parse(raw));
        const entries = Object.values(lock.entries) as Array<{
          slug: string;
          version: string;
          scope: string;
          source: { canonical: string };
        }>;
        if (opts.json) console.log(JSON.stringify(entries, null, 2));
        else
          for (const e of entries)
            console.log(`${e.slug}@${e.version} (${e.scope}) ${e.source.canonical}`);
      } catch {
        console.log('No lockfile');
      }
    });

  registry
    .command('outdated')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (opts: { global: boolean; json: boolean }) => {
      const svc = new RegistryService();
      const installer = new InstallService(svc);
      const updater = new UpdateService(svc, installer);
      const outdated = await updater.checkOutdated(
        process.cwd(),
        opts.global ? 'global' : 'project',
      );
      if (opts.json) console.log(JSON.stringify(outdated, null, 2));
      else if (outdated.length === 0) console.log('All skills up to date');
      else for (const o of outdated) console.log(`${o.slug} ${o.current} -> ${o.latest}`);
    });

  registry
    .command('update')
    .argument('[slug]', 'Specific slug or all')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (slug: string | undefined, opts: { global: boolean; json: boolean }) => {
      const svc = new RegistryService();
      const installer = new InstallService(svc);
      const updater = new UpdateService(svc, installer);
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

  registry
    .command('status')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (opts: { global: boolean; json: boolean }) => {
      const svc2 = new MergeService();
      const result = await svc2.status(process.cwd(), opts.global ? 'global' : 'project');
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else
        for (const r of result) console.log(`${r.slug}: ${r.hasLocalEdits ? 'modified' : 'clean'}`);
    });
}

// Top-level trapmap skill add (ai-pkgs parity: trapmap skill add <source>)
export function registerSkillAddTopLevel(skill: Command): void {
  skill
    .command('add')
    .description('Add a skill from registry (skills.sh, GitHub, ai-pkgs, local)')
    .argument('<source>', 'Skill source')
    .option('--agent <agent>', 'Target agent', 'trapmap')
    .option('--global', 'Global', false)
    .option('--json', 'JSON', false)
    .action(async (source: string, opts: { agent: string; global: boolean; json: boolean }) => {
      const { RegistryService: RS } = await import('@trapmap/skill-registry');
      const { InstallService: IS } = await import('@trapmap/skill-registry');
      const svc = new RS();
      const installer = new IS(svc);
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
