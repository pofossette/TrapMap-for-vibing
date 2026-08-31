import type { RegistryAdapter, RegistrySearchQuery, SkillBundle } from './registry-adapter.js';
import type { SkillRegistryEntry, SkillSource } from '../contracts/skill-source.js';

/**
 * ai-pkgs compatibility adapter — copies ai-pkgs CLI behavior (npm: ai-pkgs).
 * ai-pkgs stores skills as npm packages with prefix; we proxy to npm registry or ai-pkgs web.
 * This adapter ensures trapmap-cli can "add" anything ai-pkgs can, without re-implementing npm.
 * See: https://github.com/SnowingFox/ai-skills (ai-pkgs)
 */
const AI_PKGS_REGISTRY = process.env.AI_PKGS_REGISTRY ?? 'https://registry.npmjs.org';

export class AiPkgsCompatAdapter implements RegistryAdapter {
  readonly kind = 'ai-pkgs' as const;
  readonly displayName = 'ai-pkgs';

  async search(query: RegistrySearchQuery): Promise<SkillRegistryEntry[]> {
    // Search npm for ai-skills related packages (copying ai-pkgs search semantics)
    try {
      const url = new URL(`${AI_PKGS_REGISTRY}/-/v1/search`);
      url.searchParams.set('text', query.query);
      url.searchParams.set('size', String(query.limit ?? 10));
      const res = await fetch(url.toString());
      if (!res.ok) return [];
      const data = (await res.json()) as { objects: Array<{ package: { name: string; version: string; description: string; links: { homepage?: string } } }> };
      return data.objects
        .filter((o) => o.package.name.includes('skill') || o.package.name.includes('ai-'))
        .map((o) => ({
          name: o.package.name,
          slug: o.package.name,
          description: o.package.description,
          source: { kind: 'ai-pkgs', raw: o.package.name, canonical: o.package.name },
          latestVersion: o.package.version,
          versions: [o.package.version],
          tags: [],
          homepage: o.package.links.homepage,
        })) as SkillRegistryEntry[];
    } catch {
      return [];
    }
  }

  async fetchBundle(source: SkillSource): Promise<SkillBundle> {
    // Fetch package tarball URL from npm, extract SKILL.md (simplified: fetch package.json + README)
    const name = source.canonical;
    const version = source.version ?? 'latest';
    const url = `${AI_PKGS_REGISTRY}/${encodeURIComponent(name)}/${encodeURIComponent(version)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`ai-pkgs fetch failed: ${res.status} ${url}`);
    const meta = (await res.json()) as { dist: { tarball: string }; readme?: string; version: string };
    // Simplified bundle: use readme as SKILL.md if available
    const { sha256 } = await import('@trapmap/lib/hash.js');
    const content = meta.readme ?? `# ${name}\n\nFetched via ai-pkgs compat`;
    return {
      slug: name,
      version: meta.version,
      source,
      files: [{ path: 'SKILL.md', content, sha256: await sha256(content), sizeBytes: Buffer.byteLength(content) }],
    };
  }

  async resolveVersion(source: SkillSource, requested?: string): Promise<string | null> {
    const versions = await this.getVersions(source);
    if (!requested) return versions[versions.length - 1] ?? null;
    if (versions.includes(requested)) return requested;
    return null;
  }

  async getVersions(source: SkillSource): Promise<string[]> {
    try {
      const res = await fetch(`${AI_PKGS_REGISTRY}/${encodeURIComponent(source.canonical)}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { versions: Record<string, unknown> };
      return Object.keys(data.versions ?? {});
    } catch {
      return [];
    }
  }
}
