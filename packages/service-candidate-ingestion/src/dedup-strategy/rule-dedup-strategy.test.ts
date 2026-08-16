import { describe, expect, it } from 'vitest';

import {
  assertDedupResultShape,
  buildSampleDedupInput,
  createStubCandidateCorpus,
} from '@trapmap/backend-core';

import { createRuleDedupStrategy } from './rule-dedup-strategy.js';

describe('rule dedup strategy', () => {
  it('treats an independent candidate as a non-duplicate', async () => {
    const input = buildSampleDedupInput();
    const result = await createRuleDedupStrategy().detect(input);

    assertDedupResultShape(result);
    expect(result.duplicateCase).toBeNull();
    expect(result.strategy).toBe('rule');
    expect(result.analysisSnapshot.fingerprint).toBe(input.normalized.fingerprint);
  });

  it('flags an exact duplicate against the corpus', async () => {
    const input = buildSampleDedupInput();
    const corpus = createStubCandidateCorpus([
      {
        id: 'trap-x',
        teamId: null,
        shortcut: 'Reset admin password',
        detail: input.candidate.originalPayload.trap!.detail,
        labels: ['git'],
      },
    ]);
    const result = await createRuleDedupStrategy().detect({ ...input, corpus });

    expect(result.duplicateCase).not.toBeNull();
    expect(result.duplicateCase?.hasExactDuplicate).toBe(true);
    expect(result.duplicateCase?.duplicateType).toBe('exact');
    expect(result.strategy).toBe('rule');
  });
});
