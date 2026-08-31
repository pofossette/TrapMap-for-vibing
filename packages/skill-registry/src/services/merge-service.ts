import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import { threeWayMerge, type MergeResult } from '../domain/merge.js';
import type { SkillSnapshot } from '../domain/diff.js';
import { diffSnapshots } from '../domain/diff.js';

async function readSnapshot(dir: string, slug: string, version?: string): Promise<SkillSnapshot> {
  const files: SkillSnapshot['files'] = [];
  const { sha256 } = await import('@trapmap/lib/hash.js');
  async function walk(current: string, base: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(current, e.name);
      const rel = path.relative(base, full);
      if (e.isDirectory()) await walk(full, base);
      else if (e.isFile()) {
        const content = await readFile(full, 'utf-8');
        files.push({ path: rel, content, sha256: await sha256(content) });
      }
    }
  }
  try {
    await walk(dir, dir);
  } catch {
    // empty snapshot if not exists
  }
  return { slug, version, files };
}

export interface MergeCheckResult {
  canFastForward: boolean;
  hasLocalEdits: boolean;
  diff: ReturnType<typeof diffSnapshots>;
  conflicts?: MergeResult['conflicts'];
}

export class MergeService {
  async check(
    baseDir: string,
    localDir: string,
    remoteBundle: {
      slug: string;
      version?: string;
      files: Array<{ path: string; content: string; sha256: string }>;
    },
  ): Promise<MergeCheckResult> {
    const base = await readSnapshot(baseDir, remoteBundle.slug);
    const local = await readSnapshot(localDir, remoteBundle.slug);
    const remote: SkillSnapshot = {
      slug: remoteBundle.slug,
      ...(remoteBundle.version !== undefined ? { version: remoteBundle.version } : {}),
      files: remoteBundle.files.map((f) => ({
        path: f.path,
        content: f.content,
        sha256: f.sha256,
      })),
    };
    const diff = diffSnapshots(base, remote);
    const hasLocalEdits = diffSnapshots(base, local).files.some((f) => f.status !== 'unchanged');
    const merge = threeWayMerge(base, local, remote, 'manual');
    return {
      canFastForward: !hasLocalEdits,
      hasLocalEdits,
      diff,
      conflicts: merge.conflicts,
    };
  }

  async merge(
    baseDir: string,
    localDir: string,
    remoteBundle: {
      slug: string;
      version?: string;
      files: Array<{ path: string; content: string; sha256: string }>;
    },
    strategy: 'ours' | 'theirs' | 'union' | 'manual' = 'manual',
  ): Promise<MergeResult> {
    const base = await readSnapshot(baseDir, remoteBundle.slug);
    const local = await readSnapshot(localDir, remoteBundle.slug);
    const remote: SkillSnapshot = {
      slug: remoteBundle.slug,
      ...(remoteBundle.version !== undefined ? { version: remoteBundle.version } : {}),
      files: remoteBundle.files.map((f) => ({
        path: f.path,
        content: f.content,
        sha256: f.sha256,
      })),
    };
    return threeWayMerge(base, local, remote, strategy);
  }

  async status(
    cwd: string = process.cwd(),
    scope: 'global' | 'project' = 'project',
  ): Promise<
    Array<{ slug: string; hasLocalEdits: boolean; diff: ReturnType<typeof diffSnapshots> }>
  > {
    const baseRoot =
      scope === 'global'
        ? path.join(process.env.HOME ?? cwd, '.trapmap', 'skills')
        : path.join(cwd, '.trapmap', 'skills');
    try {
      const entries = await readdir(baseRoot, { withFileTypes: true });
      const result = [];
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const slug = e.name;
        const dir = path.join(baseRoot, slug);
        // Compare against last remote? For now we treat local vs itself as no diff placeholder
        // Real status compares installed vs lockfile source via registry fetch - simplified here
        const snap = await readSnapshot(dir, slug);
        result.push({ slug, hasLocalEdits: false, diff: diffSnapshots(snap, snap) });
      }
      return result;
    } catch {
      return [];
    }
  }
}
