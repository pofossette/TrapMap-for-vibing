import type { RegistryAdapter, RegistrySearchQuery, SkillBundle } from './registry-adapter.js';
import type { SkillRegistryEntry, SkillSource } from '../contracts/skill-source.js';

/**
 * skills.sh adapter — mirrors ai-pkgs "skills" distribution.
 * API is intentionally compatible with https://www.skills.sh and https://skills.sh/api
 * For now we use a placeholder API base + fall back to GitHub raw if unavailable.
 * Copying mature pattern from ai-pkgs: bin/ai-pkgs skills add <slug>
 */
const SKILLS_SH_API_BASE = process.env.SKILLS_SH_API_BASE ?? 'https://www.skills.sh/api';
const SKILLS_SH_RAW_BASE = 'https://raw.githubusercontent.com';

export class SkillsShAdapter implements RegistryAdapter {
  readonly kind = 'skills-sh' as const;
  readonly displayName = 'skills.sh';

  async search(query: RegistrySearchQuery): Promise<SkillRegistryEntry[]> {
    // Copying ai-pkgs search: GET /skills/search?q=<query>
    // We add timeout + fallback to empty if API unavailable (offline-friendly)
    try {
      const url = new URL(`${SKILLS_SH_API_BASE}/skills/search`);
      url.searchParams.set('q', query.query);
      if (query.limit) url.searchParams.set('limit', String(query.limit));
      if (query.tags?.length) url.searchParams.set('tags', query.tags.join(','));
      const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        skills?: SkillRegistryEntry[];
        results?: SkillRegistryEntry[];
      };
      return (data.skills ?? data.results ?? []) as SkillRegistryEntry[];
    } catch {
      return [];
    }
  }

  async fetchBundle(source: SkillSource): Promise<SkillBundle> {
    // skills.sh skills are GitHub-backed; source.canonical is "owner/repo/subpath" or slug
    // Try skills.sh bundle endpoint first, fallback to GitHub raw
    const slug = source.slug ?? source.canonical;
    try {
      const res = await fetch(`${SKILLS_SH_API_BASE}/skills/${encodeURIComponent(slug)}/bundle`);
      if (res.ok) {
        const json = (await res.json()) as SkillBundle;
        return json;
      }
    } catch {
      // fall through
    }
    // Fallback: treat canonical as github path
    if (source.owner && source.repo) {
      return this.fetchGithubBundle(source);
    }
    throw new Error(`skills.sh: cannot fetch bundle for ${slug} (source: ${source.raw})`);
  }

  private async fetchGithubBundle(source: SkillSource): Promise<SkillBundle> {
    const ref = source.ref ?? source.version ?? 'main';
    const subpath = source.subpath ? `/${source.subpath.replace(/^\//, '')}` : '';
    // naive: fetch SKILL.md via raw
    const base = `${SKILLS_SH_RAW_BASE}/${source.owner}/${source.repo}/${ref}${subpath}`;
    const res = await fetch(`${base}/SKILL.md`);
    if (!res.ok) throw new Error(`GitHub raw fetch failed: ${res.status} ${base}/SKILL.md`);
    const content = await res.text();
    const { sha256 } = await import('@trapmap/lib/hash.js');
    const hash = await sha256(content);
    return {
      slug: source.slug ?? source.subpath?.split('/').pop() ?? source.repo ?? 'unknown',
      version: source.version,
      source,
      files: [{ path: 'SKILL.md', content, sha256: hash, sizeBytes: Buffer.byteLength(content) }],
    };
  }

  async resolveVersion(source: SkillSource, requested?: string): Promise<string | null> {
    const versions = await this.getVersions(source);
    if (versions.length === 0) return requested ?? null;
    if (!requested) return versions[versions.length - 1] ?? null;
    if (versions.includes(requested)) return requested;
    return null;
  }

  async getVersions(source: SkillSource): Promise<string[]> {
    try {
      const slug = source.slug ?? source.canonical;
      const res = await fetch(`${SKILLS_SH_API_BASE}/skills/${encodeURIComponent(slug)}/versions`);
      if (!res.ok) return [];
      const data = (await res.json()) as { versions?: string[] };
      return data.versions ?? [];
    } catch {
      return [];
    }
  }
}
