import { describe, expect, it } from 'vitest';

import type {
  ArtifactDerivationPort,
  ChannelMergePort,
  ConflictTriggerPort,
  DedupStrategyPort,
  IntentRecognitionPort,
  LabelAlignmentPort,
} from './index.js';
import { labelAlignmentDecisionSchema } from '@trapmap/contracts';
import {
  buildSampleArtifactInput,
  buildSampleChannelInput,
  buildSampleDedupInput,
  conflictSampleInput,
  intentSampleInput,
  sampleLabelInput,
} from '../testing/judgment-fixtures.js';

/**
 * Contract-shape tests (design D8): the fixed samples must satisfy the
 * judgment-node port input types (compile-time, via the fixtures' typed
 * exports) and the shared fixture assertions are the same set every
 * implementation (rule/llm/hybrid) must pass at runtime.
 */
describe('judgment node port contracts (D8)', () => {
  it('intent-recognition port accepts the fixed sample', () => {
    expect(intentSampleInput.knownModes).toContain(intentSampleInput.requestedMode);
    expect(intentSampleInput.query.length).toBeGreaterThan(0);
  });

  it('dedup-strategy port accepts the fixed sample', () => {
    const sample = buildSampleDedupInput();
    expect(sample.candidate.sourceType).toBe('trap');
    expect(sample.normalized.fingerprint.length).toBe(64);
    expect(sample.corpus.listApprovedTraps).toBeTypeOf('function');
  });

  it('conflict-trigger port accepts the fixed sample', () => {
    expect(conflictSampleInput.entryId.length).toBeGreaterThan(0);
  });

  it('artifact-derivation port accepts the fixed sample', () => {
    const sample = buildSampleArtifactInput();
    expect(sample.payloads.length).toBeGreaterThan(0);
    expect(sample.context.artifactId).toBe('art-derive-1');
  });

  it('label-alignment port accepts the fixed sample', () => {
    expect(sampleLabelInput.candidates.length).toBeGreaterThan(0);
    for (const candidate of sampleLabelInput.candidates) {
      expect(typeof candidate.id).toBe('string');
      expect(candidate.recallReason).toMatch(/^(exact-alias|normalized-name|semantic-embedding)$/);
    }
  });

  it('channel-merge port accepts the fixed sample', () => {
    const sample = buildSampleChannelInput();
    expect(sample.hybridCandidates.length).toBeGreaterThan(0);
    expect(sample.graphCandidates.length).toBeGreaterThan(0);
  });

  it('shared fixture assertion accepts a canonical label decision', () => {
    const decision = labelAlignmentDecisionSchema.parse({
      decision: 'existing',
      canonicalLabelId: 'label-git',
      confidence: 0.9,
      reasoning: 'exact alias match',
    });
    expect(decision.decision).toBe('existing');
  });
});

// The port interfaces above are pinned at compile time by the fixtures and
// by the implementation packages; no runtime surface is needed here.
