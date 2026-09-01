import { describe, expect, it } from 'vitest';

import {
  badcaseExportDraftPayloadSchema,
  candidateProcessingPayloadSchema,
  governanceConflictDetectionPayloadSchema,
  remediationReactivationPayloadSchema,
} from '../../src/domain/async.js';

describe('shared job payload schemas', () => {
  it('accepts and requires a governance conflict detection payload', () => {
    const payload = governanceConflictDetectionPayloadSchema.parse({
      entryId: 'entry-1',
      sourceEventId: 'event-1',
    });

    expect(payload).toEqual({ entryId: 'entry-1', sourceEventId: 'event-1' });
    expect(() =>
      governanceConflictDetectionPayloadSchema.parse({ sourceEventId: 'event-1' }),
    ).toThrow();
  });

  it('accepts candidate processing payloads with retry metadata', () => {
    const result = candidateProcessingPayloadSchema.parse({
      candidateId: 'candidate-1',
      retryCount: 0,
    });

    expect(result.retryCount).toBe(0);
  });

  it('rejects candidate processing payloads with negative retry counts', () => {
    expect(() =>
      candidateProcessingPayloadSchema.parse({
        candidateId: 'candidate-1',
        retryCount: -1,
      }),
    ).toThrow();
  });

  it('accepts remediation reactivation payloads with one or more feedback ids', () => {
    const result = remediationReactivationPayloadSchema.parse({
      entryId: 'entry-1',
      entryType: 'skill',
      feedbackIds: ['feedback-1'],
      resolvedAt: '2026-06-17T10:00:00+00:00',
      resolvedByUserId: null,
      notes: null,
    });

    expect(result.entryType).toBe('skill');
  });

  it('rejects remediation reactivation payloads with empty feedback ids', () => {
    expect(() =>
      remediationReactivationPayloadSchema.parse({
        entryId: 'entry-1',
        entryType: 'trap',
        feedbackIds: [],
        resolvedAt: '2026-06-17T10:00:00+00:00',
        resolvedByUserId: null,
        notes: null,
      }),
    ).toThrow();
  });

  it('accepts a badcase export draft payload with nullable queryId', () => {
    const result = badcaseExportDraftPayloadSchema.parse({
      feedbackId: 'feedback-1',
      entryId: 'entry-1',
      entryType: 'trap',
      queryId: null,
    });

    expect(result.queryId).toBeNull();
  });

  it('preserves request and trace correlation on badcase export jobs', () => {
    expect(
      badcaseExportDraftPayloadSchema.parse({
        feedbackId: 'feedback-1',
        entryId: 'entry-1',
        entryType: 'trap',
        queryId: 'query-1',
        requestId: 'request-1',
        traceId: 'trace-1',
      }),
    ).toMatchObject({
      queryId: 'query-1',
      requestId: 'request-1',
      traceId: 'trace-1',
    });
  });
});
