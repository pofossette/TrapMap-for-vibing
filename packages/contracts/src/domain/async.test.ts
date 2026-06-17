import { describe, expect, it } from 'vitest';

import {
  asyncEventContractSchema,
  asyncEventContracts,
  asyncEventNameSchema,
  badcaseExportDraftPayloadSchema,
  candidateResolvedEventPayloadSchema,
  candidateSubmittedEventPayloadSchema,
  feedbackRemediationTriggeredEventPayloadSchema,
  getAsyncEventContract,
  getSharedJobContract,
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
      'CandidateSubmitted',
      'CandidateResolved',
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
      'knowledge.index-follow-up',
      'skill.index-follow-up',
      'feedback.remediation-reactivation',
      'feedback.badcase-export-draft',
    ] as const;

    expect(Object.keys(sharedJobContracts).sort()).toEqual([...taskTypes].sort());

    for (const taskType of taskTypes) {
      expect(() => sharedJobContractSchema.parse(sharedJobContracts[taskType])).not.toThrow();
      expect(getSharedJobContract(taskType).payloadSchema).toBe(sharedJobContracts[taskType].payloadSchema);
    }
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

  it('rejects CandidateSubmitted trap payloads that omit trapPayload', () => {
    expect(() =>
      candidateSubmittedEventPayloadSchema.parse({
        candidateId: 'candidate-1',
        sourceType: 'trap',
        submittedAt: '2026-06-17T10:00:00+00:00',
        submittedBy: 'user-1',
        teamId: null,
        initialStatus: 'received',
      }),
    ).toThrow(/trapPayload/i);
  });

  it('rejects CandidateSubmitted skill payloads that include trapPayload', () => {
    expect(() =>
      candidateSubmittedEventPayloadSchema.parse({
        candidateId: 'candidate-2',
        sourceType: 'skill',
        submittedAt: '2026-06-17T10:00:00+00:00',
        submittedBy: 'user-1',
        teamId: null,
        initialStatus: 'received',
        trapPayload: {
          scope: 'project',
          labels: ['dup'],
          shortcut: 'Trap candidate',
          detail: 'Detailed trap candidate payload',
        },
      }),
    ).toThrow(/trapPayload/i);
  });

  it('accepts a valid CandidateResolved payload tied to ResolutionOutcome', () => {
    const result = candidateResolvedEventPayloadSchema.parse({
      candidateId: 'candidate-3',
      decision: 'merged',
      resolvedAt: '2026-06-17T10:00:00+00:00',
      resolvedBy: 'reviewer-1',
      resolution: {
        candidateId: 'candidate-3',
        decision: 'merged',
        publishedEntityId: null,
        mergedIntoEntityId: 'entry-77',
        entityType: 'trap',
        resolvedAt: '2026-06-17T10:00:00+00:00',
        resolvedBy: 'reviewer-1',
        notes: 'Merged into the existing canonical trap.',
      },
    });

    expect(result.resolution.mergedIntoEntityId).toBe('entry-77');
  });

  it('rejects CandidateResolved payloads when top-level decision diverges from resolution decision', () => {
    expect(() =>
      candidateResolvedEventPayloadSchema.parse({
        candidateId: 'candidate-3',
        decision: 'independent',
        resolvedAt: '2026-06-17T10:00:00+00:00',
        resolvedBy: 'reviewer-1',
        resolution: {
          candidateId: 'candidate-3',
          decision: 'merged',
          publishedEntityId: null,
          mergedIntoEntityId: 'entry-77',
          entityType: 'trap',
          resolvedAt: '2026-06-17T10:00:00+00:00',
          resolvedBy: 'reviewer-1',
          notes: 'Merged into the existing canonical trap.',
        },
      }),
    ).toThrow(/resolution\.decision/i);
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
});
