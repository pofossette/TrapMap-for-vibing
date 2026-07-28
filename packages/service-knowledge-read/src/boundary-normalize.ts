import type { Boundary, ExclusionRule, VersionConstraint } from '@trapmap/contracts';

export function normalizeContextLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
}

export function normalizePackageName(name: string): string {
  return name.toLowerCase().trim();
}

export function buildVersionNodeId(constraint: VersionConstraint): string {
  return `boundary-version:${normalizePackageName(constraint.package)}@${constraint.range}`;
}

export function buildContextNodeId(label: string): string {
  return `boundary-context:${normalizeContextLabel(label)}`;
}

export function buildPlatformNodeId(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
  return `boundary-platform:${normalized}`;
}

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

export function extractPlatformsFromExclusions(exclusions: ExclusionRule[]): string[] {
  const platforms: string[] = [];
  for (const exclusion of exclusions) {
    if (exclusion.kind === 'platform') {
      const description = exclusion.description.toLowerCase();
      for (const platform of COMMON_PLATFORMS) {
        if (description.includes(platform)) {
          platforms.push(platform);
        }
      }
    }
  }
  return [...new Set(platforms)];
}

export interface BoundaryFacetIndex {
  contexts: string[];
  packages: string[];
  platforms: string[];
  versionConstraints: string[];
}

export function buildBoundaryFacetIndex(boundary: Boundary | null): BoundaryFacetIndex {
  if (!boundary) {
    return { contexts: [], packages: [], platforms: [], versionConstraints: [] };
  }

  const contexts = boundary.context.map(normalizeContextLabel);
  const packages = boundary.versions.map((version) => normalizePackageName(version.package));
  const platforms = extractPlatformsFromExclusions(boundary.exclusions);
  const versionConstraints = boundary.versions.map(
    (version) => `${normalizePackageName(version.package)}@${version.range}`,
  );

  return {
    contexts: [...new Set(contexts)],
    packages: [...new Set(packages)],
    platforms: [...new Set(platforms)],
    versionConstraints: [...new Set(versionConstraints)],
  };
}
