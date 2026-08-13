/**
 * Knowledge-read bounded context — boundary filtering and scoring rules.
 *
 * Pure boundary/version-constraint judgment rules (version range
 * satisfaction, boundary-context filtering, context/platform score deltas)
 * with zero framework, DB or I/O imports. The retrieval infrastructure
 * renders these rules over entry projections.
 */

import type { BoundaryContext } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Version range semantics
// ---------------------------------------------------------------------------

export interface BoundaryEntryView {
  versions: ReadonlyArray<{ package: string; range: string }>;
  context?: readonly string[];
  exclusions?: ReadonlyArray<{ kind?: string | undefined; description: string }>;
}

export type BoundaryScoredEntryView = {
  boundary?: BoundaryEntryView | null;
};

export function parseVersion(version: string): [number, number, number] {
  const parts = version.replace(/^v/, '').split('.').map(Number);
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

export function compareVersions(
  left: [number, number, number],
  right: [number, number, number],
): number {
  for (let index = 0; index < 3; index += 1)
    if (left[index] !== right[index]) return left[index]! < right[index]! ? -1 : 1;
  return 0;
}

type VersionRangeMatcher = (
  actual: [number, number, number],
  expected: [number, number, number],
  comparison: number,
) => boolean;

const exactVersionMatch: VersionRangeMatcher = (_actual, _expected, comparison) => comparison === 0;

const versionRangeMatchers: Record<string, VersionRangeMatcher> = {
  '>=': (_actual, _expected, comparison) => comparison >= 0,
  '>': (_actual, _expected, comparison) => comparison > 0,
  '<=': (_actual, _expected, comparison) => comparison <= 0,
  '<': (_actual, _expected, comparison) => comparison < 0,
  '^': (actual, expected, comparison) => actual[0] === expected[0] && comparison >= 0,
  '~': (actual, expected, comparison) =>
    actual[0] === expected[0] && actual[1] === expected[1] && comparison >= 0,
};

export function satisfiesVersionRange(version: string, range: string): boolean {
  const actual = parseVersion(version);
  const trimmed = range.trim();
  const comparator = ['>=', '<=', '>', '<', '^', '~'].find((prefix) => trimmed.startsWith(prefix));
  const expected = parseVersion(comparator ? trimmed.slice(comparator.length) : trimmed);
  return matchesVersionComparator(actual, expected, comparator);
}

export function matchesVersionComparator(
  actual: [number, number, number],
  expected: [number, number, number],
  comparator: string | undefined,
): boolean {
  const comparison = compareVersions(actual, expected);
  const matcher = versionRangeMatchers[comparator ?? ''] ?? exactVersionMatch;
  return matcher(actual, expected, comparison);
}

// ---------------------------------------------------------------------------
// Boundary filtering
// ---------------------------------------------------------------------------

/**
 * Keep entries whose boundary constraints are satisfied by the query
 * boundary context. Entries without a boundary or with no version
 * constraints are always kept.
 */
export function filterByBoundary<E extends { boundary?: BoundaryEntryView | null }>(
  entries: E[],
  context: BoundaryContext | undefined,
): E[] {
  if (!context?.versions?.length) return entries;
  return entries.filter(
    (entry) =>
      entry.boundary?.versions.every((constraint) => {
        const version = context.versions?.find(
          (item) => item.package.toLowerCase().trim() === constraint.package.toLowerCase().trim(),
        );
        return !version || satisfiesVersionRange(version.version, constraint.range);
      }) ?? true,
  );
}

// ---------------------------------------------------------------------------
// Boundary score deltas
// ---------------------------------------------------------------------------

export function computeBoundaryScoreDelta(
  entry: BoundaryScoredEntryView,
  context: BoundaryContext | undefined,
): number {
  if (!context || !entry.boundary) return 0;
  return (
    (context.contexts ?? []).reduce(
      (delta, queryContext) => delta + contextScoreDelta(entry, queryContext),
      0,
    ) + platformScoreDelta(entry, context.platform)
  );
}

export function contextScoreDelta(entry: BoundaryScoredEntryView, queryContext: string): number {
  const normalized = normalizeBoundaryLabel(queryContext);
  const contextExcluded = entry.boundary?.exclusions?.some(
    (exclusion) =>
      exclusion.kind === 'context' &&
      matchesBoundaryDescription(exclusion.description, normalized, queryContext),
  );
  const contextIncluded = entry.boundary?.context?.some(
    (label) => normalizeBoundaryLabel(label) === normalized,
  );
  return (contextExcluded ? -0.15 : 0) + (contextIncluded ? 0.1 : 0);
}

export function platformScoreDelta(
  entry: BoundaryScoredEntryView,
  platform: string | undefined,
): number {
  if (!platform) return 0;
  return entry.boundary?.exclusions?.some(
    (exclusion) =>
      exclusion.kind === 'platform' &&
      exclusion.description.toLowerCase().includes(platform.toLowerCase()),
  )
    ? -0.15
    : 0;
}

export function matchesBoundaryDescription(
  description: string,
  normalized: string,
  queryContext: string,
): boolean {
  const normalizedDescription = description.toLowerCase();
  return (
    normalizedDescription.includes(normalized) ||
    normalizedDescription.includes(queryContext.toLowerCase())
  );
}

export function normalizeBoundaryLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 64);
}
