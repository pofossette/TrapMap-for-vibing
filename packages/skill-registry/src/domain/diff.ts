export interface FileSnapshot {
  path: string;
  sha256: string;
  content: string;
}

export interface SkillSnapshot {
  slug: string;
  version?: string;
  files: FileSnapshot[];
}

export interface FileDiff {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  baseHash?: string;
  nextHash?: string;
}

export interface SkillDiff {
  slug: string;
  fromVersion?: string;
  toVersion?: string;
  files: FileDiff[];
  hasConflicts?: boolean;
}

export function diffSnapshots(base: SkillSnapshot, next: SkillSnapshot): SkillDiff {
  const baseMap = new Map(base.files.map((f) => [f.path, f] as const));
  const nextMap = new Map(next.files.map((f) => [f.path, f] as const));
  const allPaths = new Set([...baseMap.keys(), ...nextMap.keys()]);
  const files: FileDiff[] = [];
  for (const p of allPaths) {
    const b = baseMap.get(p);
    const n = nextMap.get(p);
    if (b && !n) files.push({ path: p, status: 'removed', baseHash: b.sha256 });
    else if (!b && n) files.push({ path: p, status: 'added', nextHash: n.sha256 });
    else if (b && n && b.sha256 !== n.sha256)
      files.push({ path: p, status: 'modified', baseHash: b.sha256, nextHash: n.sha256 });
    else if (b && n)
      files.push({ path: p, status: 'unchanged', baseHash: b.sha256, nextHash: n.sha256 });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { slug: next.slug, fromVersion: base.version, toVersion: next.version, files };
}

export function hasLocalEdits(base: SkillSnapshot, local: SkillSnapshot): boolean {
  const d = diffSnapshots(base, local);
  return d.files.some((f) => f.status !== 'unchanged');
}
