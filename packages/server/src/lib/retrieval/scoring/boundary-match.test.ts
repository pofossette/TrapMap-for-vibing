import type { Boundary, BoundaryContext, BoundaryExplanation } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';
import {
  BOUNDARY_EXCLUDED_PENALTY,
  BOUNDARY_PREFERRED_BOOST,
  buildBoundaryExplanation,
  computeBoundaryScoreDelta,
  filterByBoundary,
} from './boundary-match.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBoundary(overrides: Partial<Boundary> = {}): Boundary {
  return {
    context: [],
    versions: [],
    prerequisites: [],
    signals: [],
    exclusions: [],
    evidence: [],
    ...overrides,
  };
}

type Entry = { boundary?: Boundary | null };

function makeEntry(boundary?: Boundary | null): Entry {
  return { boundary: boundary ?? undefined };
}

function makeCtx(overrides: Partial<BoundaryContext> = {}): BoundaryContext {
  return {
    versions: [],
    contexts: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// filterByBoundary (G2 — BOUND-04)
// ---------------------------------------------------------------------------

describe('filterByBoundary', () => {
  it('returns all entries when boundaryContext is undefined', () => {
    const entries = [makeEntry(), makeEntry(makeBoundary())];
    expect(filterByBoundary(entries, undefined)).toHaveLength(2);
  });

  it('returns all entries when boundaryContext has no versions', () => {
    const entries = [makeEntry(), makeEntry(makeBoundary())];
    expect(filterByBoundary(entries, makeCtx({ versions: [] }))).toHaveLength(2);
  });

  it('passes entries without boundary data', () => {
    const entries = [makeEntry(null), makeEntry(undefined)];
    const ctx = makeCtx({ versions: [{ package: 'node', version: '18.0.0' }] });
    expect(filterByBoundary(entries, ctx)).toHaveLength(2);
  });

  it('excludes entry whose version constraint is not satisfied', () => {
    const entries = [
      makeEntry(
        makeBoundary({
          versions: [{ package: 'node', range: '>=20.0.0' }],
        }),
      ),
    ];
    const ctx = makeCtx({ versions: [{ package: 'node', version: '18.0.0' }] });
    expect(filterByBoundary(entries, ctx)).toHaveLength(0);
  });

  it('keeps entry whose version constraint IS satisfied', () => {
    const entries = [
      makeEntry(
        makeBoundary({
          versions: [{ package: 'node', range: '>=18.0.0' }],
        }),
      ),
    ];
    const ctx = makeCtx({ versions: [{ package: 'node', version: '20.0.0' }] });
    expect(filterByBoundary(entries, ctx)).toHaveLength(1);
  });

  it('keeps entry when query does not list the constrained package', () => {
    const entries = [
      makeEntry(
        makeBoundary({
          versions: [{ package: 'node', range: '>=20.0.0' }],
        }),
      ),
    ];
    const ctx = makeCtx({ versions: [{ package: 'python', version: '3.12.0' }] });
    expect(filterByBoundary(entries, ctx)).toHaveLength(1);
  });

  it('handles multiple constraints — all must pass', () => {
    const entries = [
      makeEntry(
        makeBoundary({
          versions: [
            { package: 'node', range: '>=18.0.0' },
            { package: 'typescript', range: '>=5.0.0' },
          ],
        }),
      ),
    ];
    // node passes, typescript fails
    const ctx = makeCtx({
      versions: [
        { package: 'node', version: '20.0.0' },
        { package: 'typescript', version: '4.9.0' },
      ],
    });
    expect(filterByBoundary(entries, ctx)).toHaveLength(0);
  });

  it('handles caret range (^)', () => {
    const entries = [
      makeEntry(makeBoundary({ versions: [{ package: 'node', range: '^18.0.0' }] })),
    ];
    // Same major, higher minor — passes
    expect(
      filterByBoundary(entries, makeCtx({ versions: [{ package: 'node', version: '18.5.0' }] })),
    ).toHaveLength(1);
    // Different major — fails
    expect(
      filterByBoundary(entries, makeCtx({ versions: [{ package: 'node', version: '19.0.0' }] })),
    ).toHaveLength(0);
  });

  it('handles tilde range (~)', () => {
    const entries = [
      makeEntry(makeBoundary({ versions: [{ package: 'node', range: '~18.2.0' }] })),
    ];
    // Same major.minor, higher patch — passes
    expect(
      filterByBoundary(entries, makeCtx({ versions: [{ package: 'node', version: '18.2.5' }] })),
    ).toHaveLength(1);
    // Different minor — fails
    expect(
      filterByBoundary(entries, makeCtx({ versions: [{ package: 'node', version: '18.3.0' }] })),
    ).toHaveLength(0);
  });

  it('handles exact match range', () => {
    const entries = [makeEntry(makeBoundary({ versions: [{ package: 'node', range: '18.0.0' }] }))];
    expect(
      filterByBoundary(entries, makeCtx({ versions: [{ package: 'node', version: '18.0.0' }] })),
    ).toHaveLength(1);
    expect(
      filterByBoundary(entries, makeCtx({ versions: [{ package: 'node', version: '18.0.1' }] })),
    ).toHaveLength(0);
  });

  it('normalizes package names for matching', () => {
    const entries = [
      makeEntry(makeBoundary({ versions: [{ package: 'TypeScript', range: '>=5.0.0' }] })),
    ];
    const ctx = makeCtx({ versions: [{ package: 'typescript', version: '4.9.0' }] });
    expect(filterByBoundary(entries, ctx)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeBoundaryScoreDelta (G3 — BOUND-04)
// ---------------------------------------------------------------------------

describe('computeBoundaryScoreDelta', () => {
  it('returns 0 when boundaryContext is undefined', () => {
    expect(computeBoundaryScoreDelta(makeEntry(makeBoundary()), undefined)).toBe(0);
  });

  it('returns 0 when entry has no boundary', () => {
    expect(computeBoundaryScoreDelta(makeEntry(null), makeCtx())).toBe(0);
  });

  it('applies excluded context penalty', () => {
    const entry = makeEntry(
      makeBoundary({
        exclusions: [{ description: 'Not for frontend use', kind: 'context' }],
      }),
    );
    const ctx = makeCtx({ contexts: ['frontend'] });
    expect(computeBoundaryScoreDelta(entry, ctx)).toBe(BOUNDARY_EXCLUDED_PENALTY);
  });

  it('applies excluded platform penalty', () => {
    const entry = makeEntry(
      makeBoundary({
        exclusions: [{ description: 'Not supported on windows', kind: 'platform' }],
      }),
    );
    const ctx = makeCtx({ platform: 'windows' });
    expect(computeBoundaryScoreDelta(entry, ctx)).toBe(BOUNDARY_EXCLUDED_PENALTY);
  });

  it('applies preferred context boost', () => {
    const entry = makeEntry(makeBoundary({ context: ['docker'] }));
    const ctx = makeCtx({ contexts: ['docker'] });
    expect(computeBoundaryScoreDelta(entry, ctx)).toBe(BOUNDARY_PREFERRED_BOOST);
  });

  it('combines exclusion penalty and preferred boost', () => {
    const entry = makeEntry(
      makeBoundary({
        context: ['docker'],
        exclusions: [{ description: 'Not for production', kind: 'context' }],
      }),
    );
    const ctx = makeCtx({ contexts: ['production', 'docker'] });
    const delta = computeBoundaryScoreDelta(entry, ctx);
    expect(delta).toBe(BOUNDARY_EXCLUDED_PENALTY + BOUNDARY_PREFERRED_BOOST);
  });

  it('returns 0 when no matches', () => {
    const entry = makeEntry(
      makeBoundary({
        context: ['docker'],
        exclusions: [{ description: 'Not for production', kind: 'context' }],
      }),
    );
    const ctx = makeCtx({ contexts: ['staging'], platform: 'linux' });
    expect(computeBoundaryScoreDelta(entry, ctx)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// buildBoundaryExplanation (G4 — BOUND-05)
// ---------------------------------------------------------------------------

describe('buildBoundaryExplanation', () => {
  it('returns unchecked when boundaryContext is undefined', () => {
    const result = buildBoundaryExplanation(makeEntry(makeBoundary()), undefined, 0);
    expect(result.checked).toBe(false);
    expect(result.requiredSatisfied).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.boosts).toEqual([]);
  });

  it('returns checked with no warnings when entry has no boundary', () => {
    const result = buildBoundaryExplanation(makeEntry(null), makeCtx(), 0);
    expect(result.checked).toBe(true);
    expect(result.requiredSatisfied).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.boosts).toEqual([]);
  });

  it('builds warnings for excluded context', () => {
    const entry = makeEntry(
      makeBoundary({
        exclusions: [{ description: 'legacy-only', kind: 'context' }],
      }),
    );
    const ctx = makeCtx({ contexts: ['legacy'] });
    const result = buildBoundaryExplanation(entry, ctx, 0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('legacy-only');
  });

  it('builds warnings for excluded platform', () => {
    const entry = makeEntry(
      makeBoundary({
        exclusions: [{ description: 'windows-only', kind: 'platform' }],
      }),
    );
    const ctx = makeCtx({ platform: 'windows' });
    const result = buildBoundaryExplanation(entry, ctx, 0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('windows-only');
  });

  it('builds boosts for preferred context', () => {
    const entry = makeEntry(makeBoundary({ context: ['docker'] }));
    const ctx = makeCtx({ contexts: ['docker'] });
    const result = buildBoundaryExplanation(entry, ctx, 0);
    expect(result.boosts).toHaveLength(1);
    expect(result.boosts[0]).toContain('docker');
  });

  it('sets requiredSatisfied=false when version constraint violated', () => {
    const entry = makeEntry(
      makeBoundary({
        versions: [{ package: 'node', range: '>=20.0.0' }],
      }),
    );
    const ctx = makeCtx({ versions: [{ package: 'node', version: '18.0.0' }] });
    const result = buildBoundaryExplanation(entry, ctx, 0);
    expect(result.requiredSatisfied).toBe(false);
  });

  it('sets requiredSatisfied=true when version constraint satisfied', () => {
    const entry = makeEntry(
      makeBoundary({
        versions: [{ package: 'node', range: '>=18.0.0' }],
      }),
    );
    const ctx = makeCtx({ versions: [{ package: 'node', version: '20.0.0' }] });
    const result = buildBoundaryExplanation(entry, ctx, 0);
    expect(result.requiredSatisfied).toBe(true);
  });

  it('returns empty warnings and boosts when no matches', () => {
    const entry = makeEntry(
      makeBoundary({
        context: ['docker'],
        exclusions: [{ description: 'legacy-only', kind: 'context' }],
      }),
    );
    const ctx = makeCtx({ contexts: ['staging'] });
    const result = buildBoundaryExplanation(entry, ctx, 0);
    expect(result.warnings).toEqual([]);
    expect(result.boosts).toEqual([]);
  });
});
