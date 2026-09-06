import { compareSemver, isValidSemver } from './semver.js';

export interface VersionedSkill {
  slug: string;
  version: string;
  revision: number;
  sourceHash: string;
}

export class SkillVersionManager {
  /**
   * Validate that new version is strictly newer than current.
   * Mirrors packages/skills version monotonicity guard (pnpm check:skills).
   */
  assertMonotonic(currentVersion: string | undefined, nextVersion: string): void {
    if (!isValidSemver(nextVersion)) throw new Error(`Invalid semver: ${nextVersion}`);
    if (currentVersion === undefined) return;
    if (compareSemver(nextVersion, currentVersion) <= 0) {
      throw new Error(
        `Version must be monotonic: current ${currentVersion} -> next ${nextVersion} not greater`,
      );
    }
  }

  /**
   * Resolve target version from available versions and requested range.
   * Supports exact, caret, tilde, >=, *, or undefined (latest).
   */
  resolveVersion(available: string[], requested?: string): string | null {
    if (available.length === 0) return null;
    const sorted = [...available].sort((a, b) => compareSemver(a, b));
    if (!requested || requested === '*' || requested === 'latest')
      return sorted[sorted.length - 1] ?? null;
    // exact match first
    if (available.includes(requested)) return requested;
    // caret/tilde/ranges via semver helper - find max satisfying
    // Do simple exact fallback if no range match
    const candidates = available.filter((v) => this.satisfies(v, requested));
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => compareSemver(a, b))[candidates.length - 1] ?? null;
  }

  private satisfies(version: string, range: string): boolean {
    const r = range.trim();
    if (r === '*' || r === '') return true;
    if (r.startsWith('^')) {
      const base = r.slice(1);
      return version.startsWith(`${base.split('.')[0]}.`) && compareSemver(version, base) >= 0;
    }
    if (r.startsWith('~')) {
      const base = r.slice(1);
      const [maj, min] = base.split('.');
      const [vMaj, vMin] = version.split('.');
      return maj === vMaj && min === vMin && compareSemver(version, base) >= 0;
    }
    if (r.startsWith('>=')) return compareSemver(version, r.slice(2).trim()) >= 0;
    if (r.startsWith('>')) return compareSemver(version, r.slice(1).trim()) > 0;
    if (r.startsWith('<=')) return compareSemver(version, r.slice(2).trim()) <= 0;
    if (r.startsWith('<')) return compareSemver(version, r.slice(1).trim()) < 0;
    return version === r;
  }

  nextRevision(currentRevision: number): number {
    return currentRevision + 1;
  }

  sortVersions(versions: string[]): string[] {
    return [...versions].sort((a, b) => compareSemver(a, b));
  }
}
