import type { FileSnapshot, SkillSnapshot } from './diff.js';

export type MergeStrategy = 'ours' | 'theirs' | 'union' | 'manual';

export interface MergeConflict {
  path: string;
  baseContent?: string;
  localContent?: string;
  remoteContent?: string;
  reason: string;
}

export interface MergeResult {
  merged: SkillSnapshot;
  conflicts: MergeConflict[];
  strategy: MergeStrategy;
}

/**
 * 3-way merge: base -> local (ours) vs base -> remote (theirs).
 * - If only one side changed: take that side.
 * - If both changed to same content: take either.
 * - If both changed divergently: conflict.
 * - Added/removed handling: if one side deleted and other modified -> conflict.
 */
export function threeWayMerge(
  base: SkillSnapshot,
  local: SkillSnapshot,
  remote: SkillSnapshot,
  strategy: MergeStrategy = 'manual',
): MergeResult {
  const baseMap = new Map(base.files.map((f) => [f.path, f]));
  const localMap = new Map(local.files.map((f) => [f.path, f]));
  const remoteMap = new Map(remote.files.map((f) => [f.path, f]));
  const allPaths = new Set([...baseMap.keys(), ...localMap.keys(), ...remoteMap.keys()]);

  const mergedFiles: FileSnapshot[] = [];
  const conflicts: MergeConflict[] = [];

  for (const path of allPaths) {
    const b = baseMap.get(path);
    const l = localMap.get(path);
    const r = remoteMap.get(path);

    const bHash = b?.sha256;
    const lHash = l?.sha256;
    const rHash = r?.sha256;

    const localChanged = lHash !== bHash;
    const remoteChanged = rHash !== bHash;

    // Cases
    if (!b && l && !r) {
      // added only locally
      mergedFiles.push(l);
    } else if (!b && !l && r) {
      mergedFiles.push(r);
    } else if (!b && l && r) {
      if (l.sha256 === r.sha256) mergedFiles.push(l);
      else {
        conflicts.push({
          path,
          localContent: l.content,
          remoteContent: r.content,
          reason: 'both added with different content',
        });
        if (strategy === 'ours') mergedFiles.push(l);
        else if (strategy === 'theirs') mergedFiles.push(r);
        else if (strategy === 'union') {
          mergedFiles.push(l);
          if (!mergedFiles.some((f) => f.path === r.path))
            mergedFiles.push({ ...r, path: r.path + '.remote' });
        }
      }
    } else if (b && !l && !r) {
      // deleted on both -> nothing
    } else if (b && !l && r) {
      if (!remoteChanged) {
        // deleted locally, unchanged remote -> respect deletion
      } else {
        conflicts.push({
          path,
          baseContent: b.content,
          remoteContent: r.content,
          reason: 'deleted locally but modified remotely',
        });
        if (strategy === 'theirs') mergedFiles.push(r);
        else if (strategy === 'union') mergedFiles.push(r);
      }
    } else if (b && l && !r) {
      if (!localChanged) {
        // deleted remotely, unchanged locally -> delete
      } else {
        conflicts.push({
          path,
          baseContent: b.content,
          localContent: l.content,
          reason: 'deleted remotely but modified locally',
        });
        if (strategy === 'ours') mergedFiles.push(l);
        else if (strategy === 'union') mergedFiles.push(l);
      }
    } else if (b && l && r) {
      if (!localChanged && !remoteChanged) mergedFiles.push(b);
      else if (localChanged && !remoteChanged) mergedFiles.push(l);
      else if (!localChanged && remoteChanged) mergedFiles.push(r);
      else {
        // both changed
        if (l.sha256 === r.sha256) mergedFiles.push(l);
        else {
          conflicts.push({
            path,
            baseContent: b.content,
            localContent: l.content,
            remoteContent: r.content,
            reason: 'both modified divergently',
          });
          if (strategy === 'ours') mergedFiles.push(l);
          else if (strategy === 'theirs') mergedFiles.push(r);
          else if (strategy === 'union') {
            // naive union: keep local, append remote as .remote variant
            mergedFiles.push(l);
            mergedFiles.push({ ...r, path: r.path + '.remote' });
          }
        }
      }
    }
  }

  mergedFiles.sort((a, b) => a.path.localeCompare(b.path));
  return {
    merged: { slug: remote.slug, version: remote.version, files: mergedFiles },
    conflicts,
    strategy,
  };
}

export function isMergeClean(result: MergeResult): boolean {
  return result.conflicts.length === 0;
}
