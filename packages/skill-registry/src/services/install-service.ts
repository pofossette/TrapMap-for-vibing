import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RegistryService } from './registry-service.js';
import type { SkillBundle } from '../adapters/registry-adapter.js';
import type { SkillLockEntry, SkillLockfile } from '../contracts/skill-lock.js';
import { skillLockfileSchema } from '../contracts/skill-lock.js';

export interface InstallOptions {
  scope?: 'global' | 'project';
  agentTargets?: string[];
  overwrite?: boolean;
  cwd?: string;
  mergeStrategy?: 'ours' | 'theirs' | 'union' | 'manual';
}

export interface InstallResult {
  slug: string;
  version?: string;
  installedPath: string;
  filesWritten: number;
  lockEntry: SkillLockEntry;
}

/**
 * Install service — copies ai-pkgs install + ccswitch multi-agent path logic.
 * ai-pkgs: --agent cursor --project installs to .cursor/skills/<slug> or ~/.cursor/skills
 * ccswitch: installs to ~/.claude/skills, ~/.codex/skills, ~/.agents/skills depending on --agent
 * TrapMap: ./.trapmap/skills/<slug> (project) or ~/.trapmap/skills/<slug> (global) + agent symlinks
 */
const AGENT_SKILL_DIRS: Record<string, string> = {
  'claude-code': '.claude/skills',
  codex: '.codex/skills',
  cursor: '.cursor/skills',
  windsurf: '.windsurf/skills',
  copilot: '.github/skills',
  agents: '.agents/skills',
  trapmap: '.trapmap/skills',
};

export class InstallService {
  constructor(private readonly registry: RegistryService) {}

  resolveInstallPaths(
    slug: string,
    options: InstallOptions,
  ): { primary: string; agentPaths: string[] } {
    const scope = options.scope ?? 'project';
    const cwd = options.cwd ?? process.cwd();
    const base =
      scope === 'global'
        ? path.join(process.env.HOME ?? cwd, '.trapmap', 'skills', slug)
        : path.join(cwd, '.trapmap', 'skills', slug);
    const agents = options.agentTargets ?? ['trapmap'];
    // Dedupe agents sharing same directory (mature ai-pkgs pattern: .agents/skills universal)
    const deduped = [...new Set(agents)];
    const agentPaths = deduped.map((agent) => {
      const dir = AGENT_SKILL_DIRS[agent] ?? `.agents/skills`;
      const root =
        scope === 'global' ? path.join(process.env.HOME ?? cwd, dir) : path.join(cwd, dir);
      return path.join(root, slug);
    });
    return { primary: base, agentPaths };
  }

  async install(rawSource: string, options: InstallOptions = {}): Promise<InstallResult> {
    const bundle = await this.registry.fetchBundle(
      rawSource,
      options.overwrite ? undefined : undefined,
    );
    const { primary, agentPaths } = this.resolveInstallPaths(bundle.slug, options);
    // Write primary files
    await mkdir(primary, { recursive: true });
    for (const file of bundle.files) {
      const target = path.join(primary, file.path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf-8');
    }
    // Agent symlinks/copies (copy mature ccswitch behavior: copy, not symlink, for portability)
    for (const agentPath of agentPaths) {
      if (agentPath === primary) continue;
      await mkdir(agentPath, { recursive: true });
      for (const file of bundle.files) {
        const target = path.join(agentPath, file.path);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.content, 'utf-8');
      }
    }
    const lockEntry: SkillLockEntry = {
      name: bundle.slug,
      slug: bundle.slug,
      version: bundle.version ?? '0.0.0',
      resolved: bundle.source.raw,
      integrity: bundle.files[0]?.sha256,
      source: bundle.source,
      installedAt: new Date().toISOString(),
      installPath: primary,
      agentTargets: options.agentTargets ?? ['trapmap'],
      scope: options.scope ?? 'project',
    };
    await this.updateLockfile(bundle.slug, lockEntry, options);
    return {
      slug: bundle.slug,
      version: bundle.version,
      installedPath: primary,
      filesWritten: bundle.files.length,
      lockEntry,
    };
  }

  private async updateLockfile(
    slug: string,
    entry: SkillLockEntry,
    options: InstallOptions,
  ): Promise<void> {
    const cwd = options.cwd ?? process.cwd();
    const scope = options.scope ?? 'project';
    const lockPath =
      scope === 'global'
        ? path.join(process.env.HOME ?? cwd, '.trapmap', 'skills.lock')
        : path.join(cwd, '.trapmap', 'skills.lock');
    await mkdir(path.dirname(lockPath), { recursive: true });
    let lockfile: SkillLockfile = {
      version: 1,
      generatedAt: new Date().toISOString(),
      entries: {},
    };
    try {
      const raw = await readFile(lockPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const validated = skillLockfileSchema.safeParse(parsed);
      if (validated.success) lockfile = validated.data;
    } catch {
      // new lockfile
    }
    lockfile.entries[slug] = entry;
    lockfile.generatedAt = new Date().toISOString();
    await writeFile(lockPath, JSON.stringify(lockfile, null, 2), 'utf-8');
  }

  async installFromLockfile(options: InstallOptions = {}): Promise<InstallResult[]> {
    const cwd = options.cwd ?? process.cwd();
    const scope = options.scope ?? 'project';
    const lockPath =
      scope === 'global'
        ? path.join(process.env.HOME ?? cwd, '.trapmap', 'skills.lock')
        : path.join(cwd, '.trapmap', 'skills.lock');
    const raw = await readFile(lockPath, 'utf-8');
    const lockfile = skillLockfileSchema.parse(JSON.parse(raw));
    const results: InstallResult[] = [];
    for (const [slug, entry] of Object.entries(lockfile.entries)) {
      const bundle = await this.registry.fetchBundle(entry.resolved, entry.version);
      const result = await this.install(bundle.source.raw, {
        ...options,
        agentTargets: entry.agentTargets,
        scope: entry.scope,
      });
      results.push(result);
    }
    return results;
  }
}
