import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SkillLockEntry } from '../contracts/skill-lock.js';
import { skillLockfileSchema } from '../contracts/skill-lock.js';
import { compareSemver } from '../domain/semver.js';
import type { InstallService } from './install-service.js';
import type { RegistryService } from './registry-service.js';

export interface OutdatedEntry {
  slug: string;
  current: string;
  latest: string;
  source: string;
  wanted: string;
}

export interface UpdateResult {
  slug: string;
  from: string;
  to: string;
  updated: boolean;
  reason?: string;
}

export class UpdateService {
  constructor(
    private readonly registry: RegistryService,
    private readonly installer: InstallService,
  ) {}

  async checkOutdated(
    cwd: string = process.cwd(),
    scope: 'global' | 'project' = 'project',
  ): Promise<OutdatedEntry[]> {
    const lockPath =
      scope === 'global'
        ? path.join(process.env.HOME ?? cwd, '.trapmap', 'skills.lock')
        : path.join(cwd, '.trapmap', 'skills.lock');
    try {
      const raw = await readFile(lockPath, 'utf-8');
      const lockfile = skillLockfileSchema.parse(JSON.parse(raw));
      const outdated: OutdatedEntry[] = [];
      for (const [slug, entry] of Object.entries(lockfile.entries)) {
        const source = entry.source;
        const versions = await this.getVersionsForSource(source);
        if (versions.length === 0) continue;
        const latest = [...versions].sort((a, b) => compareSemver(a, b))[
          versions.length - 1
        ] as string;
        if (compareSemver(latest, entry.version) > 0) {
          outdated.push({
            slug,
            current: entry.version,
            latest,
            source: entry.resolved,
            wanted: latest,
          });
        }
      }
      return outdated;
    } catch {
      return [];
    }
  }

  private async getVersionsForSource(source: SkillLockEntry['source']): Promise<string[]> {
    // Delegate to registry adapter
    try {
      const adapter = this.registry.getAdapterFor(source);
      return await adapter.getVersions(source);
    } catch {
      return [];
    }
  }

  async update(
    slug: string,
    options: { cwd?: string; scope?: 'global' | 'project'; version?: string } = {},
  ): Promise<UpdateResult> {
    const cwd = options.cwd ?? process.cwd();
    const scope = options.scope ?? 'project';
    const lockPath =
      scope === 'global'
        ? path.join(process.env.HOME ?? cwd, '.trapmap', 'skills.lock')
        : path.join(cwd, '.trapmap', 'skills.lock');
    const raw = await readFile(lockPath, 'utf-8');
    const lockfile = skillLockfileSchema.parse(JSON.parse(raw));
    const entry = lockfile.entries[slug];
    if (!entry) throw new Error(`Skill not installed: ${slug}`);
    const targetVersion = options.version ?? (await this.getLatest(entry.source)) ?? entry.version;
    if (targetVersion === entry.version)
      return {
        slug,
        from: entry.version,
        to: targetVersion,
        updated: false,
        reason: 'already latest',
      };
    // Use installer's 3-way merge path if local edits exist (delegated to merge-service)
    await this.installer.install(entry.resolved, {
      cwd,
      scope,
      overwrite: true,
      agentTargets: entry.agentTargets,
    });
    // Update lockfile version
    const updatedRaw = await readFile(lockPath, 'utf-8');
    const updatedLock = skillLockfileSchema.parse(JSON.parse(updatedRaw));
    const newEntry = updatedLock.entries[slug];
    return { slug, from: entry.version, to: newEntry?.version ?? targetVersion, updated: true };
  }

  async updateAll(
    cwd: string = process.cwd(),
    scope: 'global' | 'project' = 'project',
  ): Promise<UpdateResult[]> {
    const outdated = await this.checkOutdated(cwd, scope);
    const results: UpdateResult[] = [];
    for (const o of outdated) {
      try {
        const r = await this.update(o.slug, { cwd, scope, version: o.latest });
        results.push(r);
      } catch (e) {
        results.push({
          slug: o.slug,
          from: o.current,
          to: o.latest,
          updated: false,
          reason: String(e),
        });
      }
    }
    return results;
  }

  private async getLatest(source: SkillLockEntry['source']): Promise<string | null> {
    try {
      const adapter = this.registry.getAdapterFor(source);
      const versions = await adapter.getVersions(source);
      if (versions.length === 0) return null;
      return [...versions].sort((a, b) => compareSemver(a, b))[versions.length - 1] as string;
    } catch {
      return null;
    }
  }
}
