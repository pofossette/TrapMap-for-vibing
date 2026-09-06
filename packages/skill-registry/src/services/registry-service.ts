import { AiPkgsCompatAdapter } from '../adapters/ai-pkgs-compat.js';
import { GithubAdapter } from '../adapters/github.js';
import { LocalAdapter } from '../adapters/local.js';
import type { RegistryAdapter, RegistrySearchQuery } from '../adapters/registry-adapter.js';
import { SkillsShAdapter } from '../adapters/skills-sh.js';
import type { SkillRegistryEntry, SkillSource } from '../contracts/skill-source.js';
import { skillSourceSchema } from '../contracts/skill-source.js';

/**
 * Registry service — orchestrates multiple RegistryAdapters, mirroring ai-pkgs multi-registry search.
 * Copies ai-pkgs: `ai-pkgs skills add <source> --agent <agent> --project/--global`
 * and ccswitch's resolver that tries ~/.claude/skills, ~/.codex/skills, etc.
 * Priority: local > skills.sh > github > ai-pkgs
 */
export function isFullGitCloneUrl(source: string): boolean {
  return /^https?:\/\//.test(source) || /^git@[^:]+:.+/.test(source);
}

export const resolveRegistry = (source: string, registry?: string): string => {
  if (registry) return registry;
  if (
    source.startsWith('file:') ||
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('~')
  )
    return 'file';
  if (source.startsWith('github:') || source.includes('github.com')) return 'github';
  if (source.startsWith('gitlab:') || source.includes('gitlab')) return 'gitlab';
  if (isFullGitCloneUrl(source)) return 'gitlab';
  return 'github';
};

export class RegistryService {
  private readonly adapters: RegistryAdapter[];

  constructor(adapters?: RegistryAdapter[]) {
    this.adapters = adapters ?? [
      new LocalAdapter(),
      new SkillsShAdapter(),
      new GithubAdapter(),
      new AiPkgsCompatAdapter(),
    ];
  }

  parseSource(raw: string): SkillSource {
    const input = raw.trim();
    // local path
    if (
      input.startsWith('.') ||
      input.startsWith('/') ||
      input.startsWith('~') ||
      input.startsWith('file://')
    ) {
      const canonical = input.replace(/^file:\/\//, '');
      return skillSourceSchema.parse({
        kind: 'local-path',
        raw: input,
        canonical,
        slug: canonical.split('/').pop(),
      });
    }
    // github: prefix or owner/repo pattern
    // Support: github:owner/repo, owner/repo, owner/repo/subpath, owner/repo@ref, https://github.com/owner/repo
    const githubMatch = input.match(
      /^(?:github:)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:\/([^@#]+))?(?:[@#](.+))?$/,
    );
    if (githubMatch && !input.includes('skills.sh') && !input.startsWith('@')) {
      const [, owner, repo, subpath, ref] = githubMatch;
      const canonical = `${owner}/${repo}${subpath ? `/${subpath}` : ''}`;
      return skillSourceSchema.parse({
        kind: 'github',
        raw: input,
        canonical,
        owner,
        repo,
        subpath: subpath?.replace(/^\//, ''),
        ref: ref?.trim(),
        slug: subpath ? subpath.split('/').pop() : repo,
      });
    }
    // https://github.com/... URL
    const ghUrl = input.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)\/(.+))?/);
    if (ghUrl) {
      const [, owner, repo, ref, subpath] = ghUrl;
      const canonical = `${owner}/${repo}${subpath ? `/${subpath}` : ''}`;
      return skillSourceSchema.parse({
        kind: 'github',
        raw: input,
        canonical,
        owner,
        repo,
        subpath,
        ref,
      });
    }
    // skills.sh: skills.sh/<slug> or just slug
    if (input.includes('skills.sh') || (!input.includes('/') && !input.includes(':'))) {
      const slug = input.replace(/^.*skills\.sh\//, '').trim();
      if (slug && !slug.includes(' ') && slug.length < 80) {
        return skillSourceSchema.parse({ kind: 'skills-sh', raw: input, canonical: slug, slug });
      }
    }
    // ai-pkgs style: @scope/package or package
    if (input.startsWith('@') || input.includes('/')) {
      // fallback to ai-pkgs if not github
      return skillSourceSchema.parse({ kind: 'ai-pkgs', raw: input, canonical: input });
    }
    return skillSourceSchema.parse({
      kind: 'skills-sh',
      raw: input,
      canonical: input,
      slug: input,
    });
  }

  getAdapterFor(source: SkillSource): RegistryAdapter {
    const found = this.adapters.find((a) => a.kind === source.kind);
    if (found) return found;
    // fallback mapping
    if (source.kind === 'trapmap-internal')
      return (this.adapters[1] ?? this.adapters[0]) as RegistryAdapter;
    return (this.adapters[1] ?? this.adapters[0]) as RegistryAdapter;
  }

  async searchAll(
    query: RegistrySearchQuery,
  ): Promise<{ registry: string; entries: SkillRegistryEntry[] }[]> {
    const results = await Promise.all(
      this.adapters.map(async (adapter) => {
        try {
          const entries = await adapter.search(query);
          return { registry: adapter.displayName, entries };
        } catch {
          return { registry: adapter.displayName, entries: [] as SkillRegistryEntry[] };
        }
      }),
    );
    return results.filter((r) => r.entries.length > 0);
  }

  async fetchBundle(rawSource: string, version?: string) {
    const source: SkillSource = version
      ? { ...this.parseSource(rawSource), version }
      : this.parseSource(rawSource);
    const adapter = this.getAdapterFor(source);
    const bundle = await adapter.fetchBundle(source);
    return bundle;
  }

  listRegistries(): string[] {
    return this.adapters.map((a) => `${a.kind} (${a.displayName})`);
  }
}
