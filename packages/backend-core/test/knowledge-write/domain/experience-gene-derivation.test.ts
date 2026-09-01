import { describe, expect, it } from 'vitest';

import type { ExperienceGeneSourceSnapshot } from '@trapmap/contracts';
import { experienceGeneSchema } from '@trapmap/contracts';
import {
  checkExperienceGeneCompactness,
  extractRuleExperienceGene,
  validateExperienceGeneCandidate,
} from '../../../src/knowledge-write/domain/experience-gene-derivation.js';
import { createExperienceGeneContentHash } from '../../../src/knowledge-write/domain/experience-gene-hashing.js';

const snapshot: ExperienceGeneSourceSnapshot = {
  kind: 'skill-artifact',
  sourceId: 'artifact-1:unit-1',
  revision: 4,
  sourceHash: 'a'.repeat(64),
  artifactId: 'artifact-1',
  artifactRevision: 4,
  derivationUnitId: 'unit-1',
  title: 'Bound queue retry fan-out',
  labels: ['queue', 'reliability'],
  scope: 'project',
  teamId: null,
  requiredLevel: 2,
  text: [
    '## Match',
    '- queue retries grow without a dead-letter signal',
    '## Goal',
    'Cap retry concurrency before publishing.',
    '## Strategy',
    '- Claim the queue lease before side effects',
    '## Avoid',
    '- Retry publishes directly from the request handler',
    '## Verify',
    '- A load test shows one publisher owns the lease',
  ].join('\n'),
  truncated: false,
};

function validCandidate() {
  const extracted = extractRuleExperienceGene({ snapshot, nowIso: '2026-08-26T00:00:00.000Z' });
  if (!('gene' in extracted)) throw new Error(extracted.reason);
  return extracted.gene;
}

describe('rule experience gene extractor', () => {
  it('parses explicit control blocks into a deterministic candidate', () => {
    const first = validCandidate();
    const second = extractRuleExperienceGene({
      snapshot,
      nowIso: '2026-08-26T00:00:00.000Z',
    });

    expect('gene' in second).toBe(true);
    if (!('gene' in second)) return;
    expect(second.gene).toEqual(first);
    expect(first.title).toBe(snapshot.title);
    expect(first.signalsMatch).toEqual(['queue retries grow without a dead-letter signal']);
    expect(first.summary).toBe('Cap retry concurrency before publishing.');
    expect(first.strategy).toEqual(['Claim the queue lease before side effects']);
    expect(first.avoid).toEqual(['Retry publishes directly from the request handler']);
    expect(first.validation).toEqual(['A load test shows one publisher owns the lease']);
    expect(first.generator).toEqual({
      kind: 'rule',
      model: null,
      promptVersion: 'experience-gene-rule-v1',
    });
    expect(first.contentHash).toBe(createExperienceGeneContentHash(first));
  });

  it('rejects unstructured trap text instead of inventing strategy', () => {
    const result = extractRuleExperienceGene({
      snapshot: {
        ...snapshot,
        kind: 'trap',
        sourceId: 'trap-unstructured',
        artifactId: null,
        artifactRevision: null,
        derivationUnitId: 'trap:trap-unstructured:v1',
        text: 'Queues sometimes fail. Retry logic can be tricky.',
      },
      nowIso: '2026-08-26T00:00:00.000Z',
    });

    expect(result).toEqual({ status: 'insufficient-structure', reason: 'insufficient-structure' });
  });
});

describe('experience gene validation gates', () => {
  it('passes schema, compactness, fidelity, governance, and safety gates', async () => {
    const report = await validateExperienceGeneCandidate(validCandidate(), {
      sourceText: snapshot.text,
      source: snapshot,
    });

    expect(report.valid).toBe(true);
    expect(report.firstFailingGate).toBeNull();
  });

  it('rejects compactness violations independently of the Zod array bound', () => {
    const gene = validCandidate();
    const unsafe = {
      ...gene,
      strategy: Array.from({ length: 8 }, (_, index) => `safe step ${index + 1}`),
    };

    expect(() => experienceGeneSchema.parse(unsafe)).toThrow();
    expect(checkExperienceGeneCompactness(unsafe)).toEqual([
      {
        code: 'compactness-budget',
        field: 'signalsMatch/strategy/avoid',
        message: 'Candidate exceeds control-array budgets',
      },
    ]);
  });

  it('accepts embedding fidelity when lexical coverage is sparse', async () => {
    const gene = {
      ...validCandidate(),
      summary: 'unrelated wording with equivalent operational meaning',
    };
    const report = await validateExperienceGeneCandidate(gene, {
      sourceText: snapshot.text,
      source: snapshot,
      embed: async (text) => [text.includes('queue') ? 1 : 0],
    });

    expect(report.valid).toBe(true);
  });

  it('rejects governance drift and reports the first failing gate', async () => {
    const gene = { ...validCandidate(), labels: ['security'], requiredLevel: 2 };
    const report = await validateExperienceGeneCandidate(gene, {
      sourceText: snapshot.text,
      source: snapshot,
    });

    expect(report.valid).toBe(false);
    expect(report.firstFailingGate).toBe('governance');
    expect(report.issues.map((issue) => issue.code)).toContain('governance-label-subset');
  });
});
