import { describe, expect, it } from 'vitest';

import {
  asyncEventContractSchema,
  asyncEventContracts,
  asyncEventNameSchema,
  badcaseExportDraftPayloadSchema,
  candidateProcessingPayloadSchema,
  feedbackRemediationTriggeredEventPayloadSchema,
  getAsyncEventContract,
  getSharedJobContract,
  governanceConflictDetectionPayloadSchema,
  knowledgeApprovedEventPayloadSchema,
  readModelRefreshRequestedEventPayloadSchema,
  remediationReactivationPayloadSchema,
  sharedJobContractSchema,
  sharedJobContracts,
} from './async.js';

const VALID_ACTOR = {
  id: 'user-1',
  handle: 'alice',
  securityLevel: 3,
};

describe('async contract catalog', () => {
  it('covers all required async event names in the central catalog', () => {
    const required = [
      'KnowledgeApproved',
      'KnowledgeRejected',
      'KnowledgeSuperseded',
      'TrapActivated',
      'TrapDeactivated',
      'ArtifactIndexed',
      'FeedbackRemediationTriggered',
      'ReadModelRefreshRequested',
    ] as const;

    const contractKeys = Object.keys(asyncEventContracts).sort();
    const schemaValues = asyncEventNameSchema.options.slice().sort();

    expect(contractKeys).toEqual([...required].sort());
    expect(schemaValues).toEqual([...required].sort());

    for (const eventName of required) {
      expect(() => asyncEventContractSchema.parse(asyncEventContracts[eventName])).not.toThrow();
    }
  });

  it('exposes shared job contracts with payload schemas and required metadata', () => {
    const taskTypes = [
      'candidate_processing',
      'knowledge.index-follow-up',
      'skill.index-follow-up',
      'feedback.remediation-reactivation',
      'feedback.badcase-export-draft',
      'governance.conflict-detection',
    ] as const;

    expect(Object.keys(sharedJobContracts).sort()).toEqual([...taskTypes].sort());

    for (const taskType of taskTypes) {
      expect(() => sharedJobContractSchema.parse(sharedJobContracts[taskType])).not.toThrow();
      expect(getSharedJobContract(taskType).payloadSchema).toBe(
        sharedJobContracts[taskType].payloadSchema,
      );
    }

    const conflictContract = getSharedJobContract('governance.conflict-detection');
    expect(conflictContract.owner.owner).toBe('conflict-relation');
    expect(conflictContract.ordering).toBe('per-transition');
    expect(conflictContract.retryPolicy).toMatchObject({
      maxAttempts: 5,
      backoff: 'exponential',
      deadLetterStepName: 'dead-letter',
    });
  });

  it('returns typed event contracts by name', () => {
    const contract = getAsyncEventContract('KnowledgeApproved');

    expect(contract.eventName).toBe('KnowledgeApproved');
    expect(contract.metadata.publisher.owner).toBe('knowledge-entry');
    expect(contract.metadata.idempotencyKey.format).toContain('<entryId>');
  });
});

describe('async event payload schemas', () => {
  it('accepts a valid KnowledgeApproved payload', () => {
    const result = knowledgeApprovedEventPayloadSchema.parse({
      entryId: 'entry-1',
      submissionId: 'submission-1',
      revision: 2,
      approvedAt: '2026-06-17T10:00:00+00:00',
      approvedBy: VALID_ACTOR,
      lifecycleState: 'approved',
    });

    expect(result.revision).toBe(2);
    expect(result.approvedBy.handle).toBe('alice');
  });

  it('accepts a valid read model refresh request payload', () => {
    const result = readModelRefreshRequestedEventPayloadSchema.parse({
      requestId: 'refresh-1',
      subjectType: 'trap',
      subjectId: 'entry-1',
      projection: 'knowledge-search',
      cause: 'knowledge-approved',
      requestedAt: '2026-06-17T10:00:00+00:00',
      requestedBy: VALID_ACTOR,
    });

    expect(result.projection).toBe('knowledge-search');
  });

  it('accepts a valid feedback remediation trigger payload', () => {
    const result = feedbackRemediationTriggeredEventPayloadSchema.parse({
      feedbackId: 'feedback-1',
      entryId: 'entry-1',
      entryType: 'trap',
      status: 'triaged',
      triggeredAt: '2026-06-17T10:00:00+00:00',
      triggeredBy: null,
      activeFeedbackCount: 2,
      suppression: {
        retrieval: true,
        indexing: false,
      },
    });

    expect(result.suppression.retrieval).toBe(true);
  });
});

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
