import { describe, expect, it } from 'vitest';

import type { DerivationCandidate, DerivationRequest } from './derivation-ports.js';

type FixtureSnapshot = { title: string };
type FixtureOutput = { summary: string };

describe('derivation contracts', () => {
  it('preserves request provenance and validator report on a candidate', () => {
    const request: DerivationRequest<FixtureSnapshot> = {
      sourceType: 'trap',
      sourceId: 'trap-1',
      sourceRevision: 3,
      sourceHash: 'a'.repeat(64),
      snapshot: { title: 'approved trap' },
    };
    const candidate: DerivationCandidate<FixtureOutput> = {
      output: { summary: 'Do the bounded next action.' },
      validatorReport: { valid: true, issues: [] },
      provenance: {
        generator: 'rule',
        model: null,
        promptVersion: '2026-08-25',
      },
    };

    expect(request.snapshot).toEqual({ title: 'approved trap' });
    expect(candidate.validatorReport.valid).toBe(true);
  });
});
