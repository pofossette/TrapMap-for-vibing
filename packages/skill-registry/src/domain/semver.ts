import { semverSchema } from '../contracts/skill-version.js';

export function isValidSemver(v: string): boolean {
  return semverSchema.safeParse(v).success;
}

export function parseSemver(
  v: string,
): { major: number; minor: number; patch: number; prerelease?: string; build?: string } | null {
  const m = v.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/,
  );
  if (!m) return null;
  return {
    major: Number.parseInt(m[1]!, 10),
    minor: Number.parseInt(m[2]!, 10),
    patch: Number.parseInt(m[3]!, 10),
    prerelease: m[4],
    build: m[5],
  };
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) throw new Error(`Invalid semver compare: ${a} vs ${b}`);
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  // prerelease precedence: no prerelease > prerelease
  if (pa.prerelease === pb.prerelease) return 0;
  if (pa.prerelease === undefined) return 1;
  if (pb.prerelease === undefined) return -1;
  return pa.prerelease.localeCompare(pb.prerelease);
}

export function satisfiesRange(version: string, range: string): boolean {
  // Minimal range support: exact, ^, ~, >=, >, <=, <, *
  const v = version.trim();
  const r = range.trim();
  if (r === '*' || r === '') return true;
  if (r.startsWith('^')) {
    const base = r.slice(1);
    const pb = parseSemver(base);
    const pv = parseSemver(v);
    if (!pb || !pv) return false;
    if (pv.major !== pb.major) return false;
    return compareSemver(v, base) >= 0;
  }
  if (r.startsWith('~')) {
    const base = r.slice(1);
    const pb = parseSemver(base);
    const pv = parseSemver(v);
    if (!pb || !pv) return false;
    if (pv.major !== pb.major || pv.minor !== pb.minor) return false;
    return compareSemver(v, base) >= 0;
  }
  if (r.startsWith('>=')) return compareSemver(v, r.slice(2).trim()) >= 0;
  if (r.startsWith('>')) return compareSemver(v, r.slice(1).trim()) > 0;
  if (r.startsWith('<=')) return compareSemver(v, r.slice(2).trim()) <= 0;
  if (r.startsWith('<')) return compareSemver(v, r.slice(1).trim()) < 0;
  return v === r;
}

export function maxSatisfying(versions: string[], range: string): string | null {
  let best: string | null = null;
  for (const v of versions) {
    if (!satisfiesRange(v, range)) continue;
    if (best === null || compareSemver(v, best) > 0) best = v;
  }
  return best;
}

export function isVersionNewer(a: string, b: string): boolean {
  return compareSemver(a, b) > 0;
}
