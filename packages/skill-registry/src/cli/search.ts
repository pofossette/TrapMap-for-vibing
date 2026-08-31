import type { Command } from 'commander';
import { RegistryService } from '../services/registry-service.js';
export function registerSkillRegistrySearchCommand(program: Command): void {
  program
    .command('search-registry')
    .description('Search skills across registries')
    .argument('<query>', 'Search query')
    .option('--limit <n>', 'Max results', '10')
    .option('--json', 'JSON', false)
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
}
