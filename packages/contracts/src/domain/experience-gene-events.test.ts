import { describe, expect, it } from 'vitest';

import { createExperienceGeneFixture } from './experience-gene-fixtures.js';
import {
  EXPERIENCE_GENE_DERIVE_TASK_EVENT,
  EXPERIENCE_GENE_SOLIDIFIED_OUTBOX_EVENT,
  experienceGeneDerivationTaskPayloadSchema,
  experienceGeneEventSchema,
} from './experience-gene.js';

describe('experience gene events', () => {
  it('parses derived lifecycle events with system provenance', () => {
    const gene = createExperienceGeneFixture();
    const event = experienceGeneEventSchema.parse({
      id: 'event-1',
      type: 'derived',
      geneId: gene.geneId,
      source: gene.source,
      actor: { kind: 'system', id: null },
      validatorSummary: { valid: true, issueCodes: [] },
      reasonClass: null,
      payloadSnapshotHash: 'd'.repeat(64),
      payload: {},
      createdAt: '2026-08-25T00:01:00.000Z',
    });

    expect(event.type).toBe('derived');
  });

  it('requires the complete validator report on rejected candidates only', () => {
    const gene = createExperienceGeneFixture();
    const rejected = {
      id: 'event-2',
      type: 'rejected',
      geneId: gene.geneId,
      source: gene.source,
      actor: { kind: 'agent', id: 'deriver-1' },
      validatorSummary: { valid: false, issueCodes: ['summary-empty'] },
      reasonClass: 'schema-validation',
      payloadSnapshotHash: 'e'.repeat(64),
      payload: {
        validatorReport: {
          valid: false,
          issues: [{ code: 'summary-empty', field: 'summary', message: 'Required' }],
        },
      },
      createdAt: '2026-08-25T00:02:00.000Z',
    };

    expect(experienceGeneEventSchema.parse(rejected).payload.validatorReport.valid).toBe(false);
    expect(() =>
      experienceGeneEventSchema.parse({
        ...rejected,
        type: 'validated',
        payload: {},
        validatorSummary: { valid: false, issueCodes: ['summary-empty'] },
      }),
    ).not.toThrow();
    expect(() => experienceGeneEventSchema.parse({ ...rejected, payload: {} })).toThrow();
  });

  it('freezes derivation task and outbox event names', () => {
    const gene = createExperienceGeneFixture();
    const payload = experienceGeneDerivationTaskPayloadSchema.parse({
      requestId: 'request-1',
      source: gene.source,
      derivationUnitId: gene.lineage.derivationUnitId,
      generatorKind: gene.generator.kind,
      promptVersion: gene.generator.promptVersion,
      snapshotHash: 'f'.repeat(64),
    });

    expect(payload.requestId).toBe('request-1');
    expect(EXPERIENCE_GENE_DERIVE_TASK_EVENT).toBe('experience-gene.derive');
    expect(EXPERIENCE_GENE_SOLIDIFIED_OUTBOX_EVENT).toBe('experience-gene.solidified');
  });
});
