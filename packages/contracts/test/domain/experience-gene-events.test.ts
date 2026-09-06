import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_GENE_DEPRECATED_OUTBOX_EVENT,
  EXPERIENCE_GENE_DERIVE_TASK_EVENT,
  EXPERIENCE_GENE_REMEDIATION_SIGNAL_EVENT,
  EXPERIENCE_GENE_SOLIDIFIED_OUTBOX_EVENT,
  EXPERIENCE_GENE_STALED_OUTBOX_EVENT,
  experienceGeneDerivationTaskPayloadSchema,
  experienceGeneEventSchema,
  experienceGeneRemediationSignalSchema,
  experienceGeneSourceLifecycleEventSchema,
  experienceGeneSourceSnapshotSchema,
} from '../../src/domain/experience-gene.js';
import { createExperienceGeneFixture } from '../../src/domain/experience-gene-fixtures.js';

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
    expect(EXPERIENCE_GENE_STALED_OUTBOX_EVENT).toBe('experience-gene.staled');
    expect(EXPERIENCE_GENE_DEPRECATED_OUTBOX_EVENT).toBe('experience-gene.deprecated');
  });

  it('parses bounded immutable source snapshots', () => {
    const trap = experienceGeneSourceSnapshotSchema.parse({
      kind: 'trap',
      sourceId: 'trap-1',
      revision: 3,
      sourceHash: 'a'.repeat(64),
      derivationUnitId: 'trap:trap-1:v3',
      title: 'Queue retry storm',
      labels: ['queue'],
      scope: 'project',
      teamId: null,
      requiredLevel: 2,
      text: 'Problem: retries fan out\nFix: claim a lease first',
      truncated: false,
    });

    expect(trap.kind).toBe('trap');
    expect(() => experienceGeneSourceSnapshotSchema.parse({ ...trap, secretToken: 'x' })).toThrow();
  });

  it('parses explicit remediation signals and rejects unknown shapes', () => {
    const signal = experienceGeneRemediationSignalSchema.parse({
      name: EXPERIENCE_GENE_REMEDIATION_SIGNAL_EVENT,
      entryId: 'entry-1',
      suppressedFromRetrieval: true,
      timestamp: '2026-08-26T00:00:00.000Z',
    });

    expect(signal.suppressedFromRetrieval).toBe(true);
    expect(() => experienceGeneRemediationSignalSchema.parse({ ...signal, extra: true })).toThrow();
  });

  it('validates known truth-source lifecycle payloads without guessing shapes', () => {
    const event = experienceGeneSourceLifecycleEventSchema.parse({
      name: 'knowledge.approved',
      entryId: 'entry-1',
      previousState: 'agent-pass',
      nextState: 'approved',
      actorId: 'user-1',
      reason: 'approved',
      timestamp: '2026-08-26T00:00:00.000Z',
    });

    expect(event.entryId).toBe('entry-1');
    expect(() =>
      experienceGeneSourceLifecycleEventSchema.parse({
        name: 'artifact.approved',
        entryId: 'wrong-id',
        nextState: 'approved',
        timestamp: '2026-08-26T00:00:00.000Z',
      }),
    ).toThrow();
  });
});
