/**
 * Boundary matching logic for retrieval pipeline.
 *
 * Provides three pure functions for boundary-aware retrieval:
 * - filterByBoundary: Exclude entries with unsatisfied required constraints
 * - computeBoundaryScoreDelta: Score adjustment for context matches
 * - buildBoundaryExplanation: Human-readable boundary applicability
 *
 * All functions are pure (no side effects, no I/O).
 */

import type { Boundary, BoundaryContext, BoundaryExplanation } from '@trapmap/contracts';
import { normalizeContextLabel, normalizePackageName } from '../../indexing/boundary-normalize.js';

/** Penalty for excluded context match (BOUND-04) */
export const BOUNDARY_EXCLUDED_PENALTY = -0.15;
/** Boost for preferred context match (BOUND-04) */
export const BOUNDARY_PREFERRED_BOOST = 0.1;

/**
 * Simple semver comparison: parse major.minor.patch into numeric tuple.
 * Handles incomplete versions by defaulting missing parts to 0.
 */
function parseSemver(version: string): [number, number, number] {
  const rawParts = version.replace(/^v/, '').split('.');
  const major = Number(rawParts[0]);
  const minor = Number(rawParts[1]);
  const patch = Number(rawParts[2]);
  return [
    Number.isFinite(major) ? major : 0,
    Number.isFinite(minor) ? minor : 0,
    Number.isFinite(patch) ? patch : 0,
  ];
}

/**
 * Compare two semver tuples: -1 if a < b, 0 if equal, 1 if a > b.
 */
function compareSemver(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
  return 0;
}

/**
 * Check if a query version satisfies a constraint range.
 *
 * Handles common semver patterns:
 * - `>=X.Y.Z`: query >= constraint
 * - `^X.Y.Z`: same major, query >= constraint
 * - `~X.Y.Z`: same major.minor, query >= constraint
 * - `>X.Y.Z`: query > constraint
 * - `<=X.Y.Z`: query <= constraint
 * - `<X.Y.Z`: query < constraint
 * - `X.Y.Z`: exact match
 */
function satisfiesRange(queryVersion: string, constraintRange: string): boolean {
  const query = parseSemver(queryVersion);

  const range = constraintRange.trim();

  if (range.startsWith('>=')) {
    const constraint = parseSemver(range.slice(2));
    return compareSemver(query, constraint) >= 0;
  }
  if (range.startsWith('^')) {
    const constraint = parseSemver(range.slice(1));
    // Same major and query >= constraint
    return query[0] === constraint[0] && compareSemver(query, constraint) >= 0;
  }
  if (range.startsWith('~')) {
    const constraint = parseSemver(range.slice(1));
    // Same major.minor and query >= constraint
    return (
      query[0] === constraint[0] &&
      query[1] === constraint[1] &&
      compareSemver(query, constraint) >= 0
    );
  }
  if (range.startsWith('>')) {
    const constraint = parseSemver(range.slice(1));
    return compareSemver(query, constraint) > 0;
  }
  if (range.startsWith('<=')) {
    const constraint = parseSemver(range.slice(2));
    return compareSemver(query, constraint) <= 0;
  }
  if (range.startsWith('<')) {
    const constraint = parseSemver(range.slice(1));
    return compareSemver(query, constraint) < 0;
  }

  // Exact match
  const constraint = parseSemver(range);
  return compareSemver(query, constraint) === 0;
}

/**
 * Knowledge entry with optional boundary field.
 * Uses a subset of KnowledgeRecord fields needed for boundary matching.
 */
interface BoundaryAwareEntry {
  boundary?: Boundary | null;
}

/**
 * Filter entries whose required version constraints are satisfied by the query boundary context.
 *
 * - If boundaryContext is undefined/null, return all entries (no filtering).
 * - For each entry with entry.boundary.versions:
 *   - For each VersionConstraint, check if the query versions contain the same package.
 *   - If the package exists in query but version does NOT satisfy the constraint range, EXCLUDE the entry.
 * - Entries without boundary pass filtering (no constraints to violate).
 *
 * @param entries - Knowledge entries to filter
 * @param boundaryContext - Optional boundary context from the query
 * @returns Entries that satisfy required boundary constraints
 */
export function filterByBoundary<T extends BoundaryAwareEntry>(
  entries: T[],
  boundaryContext: BoundaryContext | undefined,
): T[] {
  if (!boundaryContext || !boundaryContext.versions || boundaryContext.versions.length === 0) {
    return entries;
  }

  return entries.filter((entry) => {
    if (!entry.boundary) {
      return true;
    }

    // Check each version constraint in the entry's boundary
    for (const constraint of entry.boundary.versions) {
      const normalizedConstraintPkg = normalizePackageName(constraint.package);

      // Find matching package in query context
      const queryVersion = boundaryContext.versions?.find(
        (qv) => normalizePackageName(qv.package) === normalizedConstraintPkg,
      );

      // If the query has this package, check if the version satisfies the constraint
      if (queryVersion) {
        if (!satisfiesRange(queryVersion.version, constraint.range)) {
          return false; // Version constraint not satisfied, exclude entry
        }
      }
    }

    return true;
  });
}

/**
 * Compute a score delta for an entry based on boundary context matching.
 *
 * - Excluded context/platform match: -0.15 penalty
 * - Preferred context match: +0.10 boost
 * - No boundary context or no entry boundary: 0
 *
 * @param entry - Knowledge entry with optional boundary
 * @param boundaryContext - Optional boundary context from the query
 * @returns Score delta to add to the entry's combined score
 */
export function computeBoundaryScoreDelta(
  entry: BoundaryAwareEntry,
  boundaryContext: BoundaryContext | undefined,
): number {
  if (!boundaryContext) {
    return 0;
  }
  if (!entry.boundary) {
    return 0;
  }

  let delta = 0;

  // Check excluded context match
  if (boundaryContext.contexts && boundaryContext.contexts.length > 0) {
    for (const queryContext of boundaryContext.contexts) {
      const normalizedQueryContext = normalizeContextLabel(queryContext);

      for (const exclusion of entry.boundary.exclusions) {
        if (exclusion.kind === 'context') {
          // Check if query context appears in exclusion description (case-insensitive)
          const descLower = exclusion.description.toLowerCase();
          if (
            descLower.includes(normalizedQueryContext) ||
            descLower.includes(queryContext.toLowerCase())
          ) {
            delta += BOUNDARY_EXCLUDED_PENALTY;
          }
        }
      }
    }
  }

  // Check excluded platform match
  if (boundaryContext.platform) {
    const normalizedQueryPlatform = boundaryContext.platform.toLowerCase();
    for (const exclusion of entry.boundary.exclusions) {
      if (exclusion.kind === 'platform') {
        const descLower = exclusion.description.toLowerCase();
        if (descLower.includes(normalizedQueryPlatform)) {
          delta += BOUNDARY_EXCLUDED_PENALTY;
        }
      }
    }
  }

  // Check preferred context match
  if (boundaryContext.contexts && boundaryContext.contexts.length > 0) {
    for (const queryContext of boundaryContext.contexts) {
      const normalizedQueryContext = normalizeContextLabel(queryContext);

      for (const entryContext of entry.boundary.context) {
        if (normalizeContextLabel(entryContext) === normalizedQueryContext) {
          delta += BOUNDARY_PREFERRED_BOOST;
        }
      }
    }
  }

  return delta;
}

/**
 * Build a human-readable explanation of boundary applicability.
 *
 * @param entry - Knowledge entry with optional boundary
 * @param boundaryContext - Optional boundary context from the query
 * @param _scoreDelta - Unused score delta (reserved for future use)
 * @returns BoundaryExplanation describing applicability
 */
export function buildBoundaryExplanation(
  entry: BoundaryAwareEntry,
  boundaryContext: BoundaryContext | undefined,
  _scoreDelta: number,
): BoundaryExplanation {
  if (!boundaryContext) {
    return { checked: false, requiredSatisfied: true, warnings: [], boosts: [] };
  }
  if (!entry.boundary) {
    return { checked: true, requiredSatisfied: true, warnings: [], boosts: [] };
  }

  const warnings: string[] = [];
  const boosts: string[] = [];
  let requiredSatisfied = true;

  // Check version constraint violations
  if (boundaryContext.versions && boundaryContext.versions.length > 0) {
    for (const constraint of entry.boundary.versions) {
      const normalizedConstraintPkg = normalizePackageName(constraint.package);
      const queryVersion = boundaryContext.versions.find(
        (qv) => normalizePackageName(qv.package) === normalizedConstraintPkg,
      );

      if (queryVersion && !satisfiesRange(queryVersion.version, constraint.range)) {
        requiredSatisfied = false;
      }
    }
  }

  // Build warnings from exclusion matches
  if (boundaryContext.contexts && boundaryContext.contexts.length > 0) {
    for (const queryContext of boundaryContext.contexts) {
      const normalizedQueryContext = normalizeContextLabel(queryContext);

      for (const exclusion of entry.boundary.exclusions) {
        if (exclusion.kind === 'context') {
          const descLower = exclusion.description.toLowerCase();
          if (
            descLower.includes(normalizedQueryContext) ||
            descLower.includes(queryContext.toLowerCase())
          ) {
            warnings.push(`Excluded ${exclusion.kind}: ${exclusion.description}`);
          }
        }
      }
    }
  }

  // Check platform exclusion matches
  if (boundaryContext.platform) {
    const normalizedQueryPlatform = boundaryContext.platform.toLowerCase();
    for (const exclusion of entry.boundary.exclusions) {
      if (exclusion.kind === 'platform') {
        const descLower = exclusion.description.toLowerCase();
        if (descLower.includes(normalizedQueryPlatform)) {
          warnings.push(`Excluded ${exclusion.kind}: ${exclusion.description}`);
        }
      }
    }
  }

  // Build boosts from context matches
  if (boundaryContext.contexts && boundaryContext.contexts.length > 0) {
    for (const queryContext of boundaryContext.contexts) {
      const normalizedQueryContext = normalizeContextLabel(queryContext);

      for (const entryContext of entry.boundary.context) {
        if (normalizeContextLabel(entryContext) === normalizedQueryContext) {
          boosts.push(`Applicable context: ${entryContext}`);
        }
      }
    }
  }

  return { checked: true, requiredSatisfied, warnings, boosts };
}
