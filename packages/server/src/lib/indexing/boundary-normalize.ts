/**
 * Boundary value normalization for consistent indexing.
 *
 * Normalization rules:
 * - Context labels: lowercase, spaces to hyphens, alphanumeric-hyphen only
 * - Version constraints: package lowercase, range preserved as-is
 * - Platforms: lowercase, alphanumeric-hyphen only
 */

import type { Boundary, ExclusionRule, VersionConstraint } from '@trapmap/contracts';

/**
 * Normalize a context label for indexing.
 * Lowercase, replace spaces with hyphens, keep only alphanumeric and hyphens.
 */
export function normalizeContextLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
}

/**
 * Normalize a package name for indexing.
 * Lowercase, preserve npm scope syntax.
 */
export function normalizePackageName(name: string): string {
  return name.toLowerCase().trim();
}

/**
 * Build a version constraint node ID.
 * Format: boundary-version:{package}@{range}
 * Example: boundary-version:react@>=16.8.0
 */
export function buildVersionNodeId(constraint: VersionConstraint): string {
  const pkg = normalizePackageName(constraint.package);
  const range = constraint.range;
  return `boundary-version:${pkg}@${range}`;
}

/**
 * Build a context node ID.
 * Format: boundary-context:{normalized-label}
 * Example: boundary-context:frontend
 */
export function buildContextNodeId(label: string): string {
  return `boundary-context:${normalizeContextLabel(label)}`;
}

/**
 * Build a platform node ID from exclusion/prerequisite.
 * Format: boundary-platform:{normalized-name}
 * Example: boundary-platform:linux
 */
export function buildPlatformNodeId(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
  return `boundary-platform:${normalized}`;
}

/**
 * Common platform identifiers for extraction from exclusion text.
 */
const COMMON_PLATFORMS = [
  'linux',
  'windows',
  'macos',
  'darwin',
  'docker',
  'kubernetes',
  'k8s',
  'aws',
  'azure',
  'gcp',
  'ci',
  'cd',
  'localhost',
] as const;

/**
 * Extract platform names from exclusion rules.
 * Looks for exclusions with kind='platform' and extracts from description.
 */
export function extractPlatformsFromExclusions(exclusions: ExclusionRule[]): string[] {
  const platforms: string[] = [];
  for (const exclusion of exclusions) {
    if (exclusion.kind === 'platform') {
      const descLower = exclusion.description.toLowerCase();
      for (const platform of COMMON_PLATFORMS) {
        if (descLower.includes(platform)) {
          platforms.push(platform);
        }
      }
    }
  }
  return [...new Set(platforms)];
}

/**
 * Boundary facet index for keyword adapter.
 * Contains normalized values for filtering.
 */
export interface BoundaryFacetIndex {
  /** Normalized context labels */
  contexts: string[];
  /** Package names from version constraints */
  packages: string[];
  /** Platform identifiers from exclusions/prerequisites */
  platforms: string[];
  /** Raw version constraints for package@range matching */
  versionConstraints: string[];
}

/**
 * Build a facet index from a boundary object.
 * Returns empty arrays if boundary is null.
 */
export function buildBoundaryFacetIndex(boundary: Boundary | null): BoundaryFacetIndex {
  if (!boundary) {
    return {
      contexts: [],
      packages: [],
      platforms: [],
      versionConstraints: [],
    };
  }

  const contexts = boundary.context.map(normalizeContextLabel);
  const packages = boundary.versions.map((v) => normalizePackageName(v.package));
  const platforms = extractPlatformsFromExclusions(boundary.exclusions);
  const versionConstraints = boundary.versions.map(
    (v) => `${normalizePackageName(v.package)}@${v.range}`,
  );

  return {
    contexts: [...new Set(contexts)],
    packages: [...new Set(packages)],
    platforms: [...new Set(platforms)],
    versionConstraints: [...new Set(versionConstraints)],
  };
}
