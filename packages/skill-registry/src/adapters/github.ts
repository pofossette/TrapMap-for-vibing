import type { SkillRegistryEntry, SkillSource } from '../contracts/skill-source.js';
import type { RegistryAdapter, RegistrySearchQuery, SkillBundle } from './registry-adapter.js';

/**
 * GitHub adapter — copies ccswitch + ai-pkgs GitHub handling.
 * Supports:
 * - owner/repo (root skill)
 * - owner/repo/subpath (skill in subdir)
 * - github:owner/repo#ref, owner/repo@ref, https://github.com/owner/repo/tree/ref/subpath
 * Copies mature parsing from ai-pkgs (SnowingFox/ai-skills) and ccswitch skill install.
 */
export class GithubAdapter implements RegistryAdapter {
  readonly kind = 'github' as const;
  readonly displayName = 'GitHub';

  async search(query: RegistrySearchQuery): Promise<SkillRegistryEntry[]> {
    // GitHub search via code search is rate-limited; we do naive repo search via GitHub API if token available
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    if (!token) return [];
    try {
      const url = new URL('https://api.github.com/search/repositories');
      url.searchParams.set('q', `${query.query} in:name,description topic:skill`);
      url.searchParams.set('per_page', String(query.limit ?? 10));
      const res = await fetch(url.toString(), {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      const data = (await res.json()) as {
        items: Array<{ full_name: string; description: string; html_url: string }>;
      };
      return data.items.map((repo) => ({
        name: repo.full_name.split('/')[1] ?? repo.full_name,
        slug: repo.full_name,
        description: repo.description,
        source: {
          kind: 'github',
          raw: repo.full_name,
          canonical: repo.full_name,
          owner: repo.full_name.split('/')[0],
          repo: repo.full_name.split('/')[1],
        },
        versions: [],
        tags: [],
        homepage: repo.html_url,
        downloadUrl: repo.html_url,
      })) as SkillRegistryEntry[];
    } catch {
      return [];
    }
  }

  async fetchBundle(source: SkillSource): Promise<SkillBundle> {
    if (!source.owner || !source.repo)
      throw new Error(`GitHub source missing owner/repo: ${source.raw}`);
    const ref = source.ref ?? source.version ?? 'main';
    const subpath = source.subpath ? `/${source.subpath.replace(/^\//, '')}` : '';
    const base = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/${ref}${subpath}`;
    const files: SkillBundle['files'] = [];
    const { sha256 } = await import('@trapmap/lib');
    // Fetch SKILL.md + try common references (copying ccswitch skill layout)
    const candidates = ['SKILL.md', 'README.md', 'references/cli-index.md'];
    for (const cand of candidates) {
      try {
        const res = await fetch(`${base}/${cand}`);
        if (!res.ok) continue;
        const content = await res.text();
        files.push({
          path: cand,
          content,
          sha256: await sha256(content),
          sizeBytes: Buffer.byteLength(content),
        });
      } catch {
        continue;
      }
    }
    if (files.length === 0) {
      // Try fetching SKILL.md at subpath directly
      const res = await fetch(`${base}/SKILL.md`);
      if (!res.ok) throw new Error(`GitHub bundle not found at ${base}/SKILL.md`);
      const content = await res.text();
      files.push({
        path: 'SKILL.md',
        content,
        sha256: await sha256(content),
        sizeBytes: Buffer.byteLength(content),
      });
    }
    return {
      slug: source.slug ?? source.subpath?.split('/').pop() ?? source.repo ?? 'unknown',
      version: source.version,
      source,
      files,
    };
  }

  async resolveVersion(source: SkillSource, requested?: string): Promise<string | null> {
    // Resolve via GitHub tags API (similar to ai-pkgs)
    if (!source.owner || !source.repo) return requested ?? null;
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    try {
      const url = `https://api.github.com/repos/${source.owner}/${source.repo}/tags?per_page=100`;
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return requested ?? null;
      const tags = (await res.json()) as Array<{ name: string }>;
      const versions = tags
        .map((t) => t.name.replace(/^v/, ''))
        .filter((v) => /^\d+\.\d+\.\d+/.test(v));
      if (!requested) return versions[0] ?? null;
      if (versions.includes(requested)) return requested;
      if (versions.includes(requested.replace(/^v/, ''))) return requested.replace(/^v/, '');
      return null;
    } catch {
      return requested ?? null;
    }
  }

  async getVersions(source: SkillSource): Promise<string[]> {
    if (!source.owner || !source.repo) return [];
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    try {
      const url = `https://api.github.com/repos/${source.owner}/${source.repo}/tags?per_page=100`;
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { headers });
      if (!res.ok) return [];
      const tags = (await res.json()) as Array<{ name: string }>;
      return tags.map((t) => t.name.replace(/^v/, '')).filter((v) => /^\d+\.\d+\.\d+/.test(v));
    } catch {
      return [];
    }
  }
}
