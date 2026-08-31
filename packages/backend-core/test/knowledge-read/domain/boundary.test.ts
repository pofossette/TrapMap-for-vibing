import { describe, expect, it } from 'vitest';

import {
  type BoundaryEntryView,
  computeBoundaryScoreDelta,
  contextScoreDelta,
  filterByBoundary,
  matchesVersionComparator,
  normalizeBoundaryLabel,
  parseVersion,
  platformScoreDelta,
  satisfiesVersionRange,
} from '../../../src/knowledge-read/domain/index.js';

const ENTRY: BoundaryEntryView = {
  context: ['production'],
  versions: [{ package: 'react', range: '^2.1.0' }],
  exclusions: [{ kind: 'context', description: 'not for staging environments' }],
};

describe('knowledge-read boundary rules', () => {
  it('parses and compares versions', () => {
    expect(parseVersion('2.1.0')).toEqual([2, 1, 0]);
    expect(parseVersion('v2.1.0')).toEqual([2, 1, 0]);
    expect(parseVersion('2')).toEqual([2, 0, 0]);
    expect(matchesVersionComparator([2, 2, 0], [2, 1, 0], '>=')).toBe(true);
    expect(matchesVersionComparator([2, 0, 0], [2, 1, 0], '>=')).toBe(false);
  });

  it('honors compatible version ranges', () => {
    expect(satisfiesVersionRange('2.2.0', '^2.1.0')).toBe(true);
    expect(satisfiesVersionRange('3.0.0', '^2.1.0')).toBe(false);
    expect(satisfiesVersionRange('2.2.0', '~2.1.0')).toBe(false);
    expect(satisfiesVersionRange('2.1.5', '~2.1.0')).toBe(true);
    expect(satisfiesVersionRange('2.1.5', '>=2.1.0')).toBe(true);
    expect(satisfiesVersionRange('2.0.9', '>=2.1.0')).toBe(false);
    expect(satisfiesVersionRange('2.1.0', '2.1.0')).toBe(true);
    expect(satisfiesVersionRange('2.1.1', '2.1.0')).toBe(false);
  });

  it('keeps entries whose constraints are satisfied and drops the rest', () => {
    const entry = { boundary: ENTRY };
    expect(filterByBoundary([entry], undefined)).toEqual([entry]);
    expect(filterByBoundary([entry], { versions: [] })).toEqual([entry]);
    expect(
      filterByBoundary([entry], { versions: [{ package: 'react', version: '2.2.0' }] }),
    ).toEqual([entry]);
    expect(
      filterByBoundary([entry], { versions: [{ package: 'react', version: '3.0.0' }] }),
    ).toEqual([]);
  });

  it('keeps entries without boundary metadata', () => {
    expect(
      filterByBoundary([{ boundary: null }], {
        versions: [{ package: 'react', version: '3.0.0' }],
      }),
    ).toHaveLength(1);
    expect(
      filterByBoundary([{}], { versions: [{ package: 'react', version: '3.0.0' }] }),
    ).toHaveLength(1);
  });

  it('applies context and platform score deltas', () => {
    const entry = { boundary: ENTRY };
    const platformEntry = {
      boundary: {
        ...ENTRY,
        exclusions: [{ kind: 'platform', description: 'not for kubernetes clusters' }],
      },
    };
    expect(computeBoundaryScoreDelta(entry, undefined)).toBe(0);
    expect(computeBoundaryScoreDelta(entry, { contexts: ['staging'] })).toBe(-0.15);
    expect(computeBoundaryScoreDelta(entry, { contexts: ['production'] })).toBe(0.1);
    expect(computeBoundaryScoreDelta(platformEntry, { platform: 'kubernetes' })).toBe(-0.15);
    expect(contextScoreDelta({ boundary: ENTRY }, 'production')).toBe(0.1);
    expect(contextScoreDelta({ boundary: ENTRY }, 'staging')).toBe(-0.15);
    expect(platformScoreDelta(platformEntry, 'kubernetes')).toBe(-0.15);
    expect(platformScoreDelta({ boundary: ENTRY }, 'kubernetes')).toBe(0);
    expect(platformScoreDelta({ boundary: ENTRY }, undefined)).toBe(0);
  });

  it('normalizes boundary labels for matching', () => {
    expect(normalizeBoundaryLabel('Staging Environment!')).toBe('staging-environment');
  });
});
