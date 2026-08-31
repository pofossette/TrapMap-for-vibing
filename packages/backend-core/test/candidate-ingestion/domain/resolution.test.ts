import { describe, expect, it } from 'vitest';

import { normalizeManualResolution } from '../../../src/candidate-ingestion/domain/resolution.js';

describe('candidate-ingestion resolution rules', () => {
  it('accepts an independent resolution with notes', () => {
    expect(normalizeManualResolution({ decision: 'independent', notes: 'publish it' })).toEqual({
      decision: 'independent',
      notes: 'publish it',
    });
  });

  it('rejects unknown decisions and empty notes', () => {
    expect(() => normalizeManualResolution({ decision: 'merge', notes: 'publish it' })).toThrow(
      'Candidate resolution requires decision "independent" or "merged"',
    );
    expect(() => normalizeManualResolution({ decision: 'merged', notes: '   ' })).toThrow(
      'Candidate resolution requires non-empty notes',
    );
  });

  it('requires a merged target for merged resolutions', () => {
    expect(() => normalizeManualResolution({ decision: 'merged', notes: 'merge it' })).toThrow(
      'Merged candidate resolution requires mergedWith.entityType and mergedWith.entityId',
    );
    expect(() =>
      normalizeManualResolution({
        decision: 'merged',
        notes: 'merge it',
        mergedWith: { entityType: 'skill' },
      }),
    ).toThrow('Merged candidate resolution requires mergedWith.entityType and mergedWith.entityId');
  });

  it('rejects invalid merged targets', () => {
    expect(() =>
      normalizeManualResolution({
        decision: 'merged',
        notes: 'merge it',
        mergedWith: { entityType: 'artifact', entityId: 'skill-1' },
      }),
    ).toThrow('Merged candidate resolution requires a valid mergedWith target');
    expect(() =>
      normalizeManualResolution({
        decision: 'merged',
        notes: 'merge it',
        mergedWith: { entityType: 'skill', entityId: 42 },
      }),
    ).toThrow('Merged candidate resolution requires a valid mergedWith target');
  });

  it('normalizes a merged resolution with an optional title', () => {
    expect(
      normalizeManualResolution({
        decision: 'merged',
        notes: 'merge it',
        mergedWith: { entityType: 'skill', entityId: 'skill-1', entityTitle: 'Existing' },
      }),
    ).toEqual({
      decision: 'merged',
      notes: 'merge it',
      mergedWith: { entityType: 'skill', entityId: 'skill-1', entityTitle: 'Existing' },
    });
  });
});
