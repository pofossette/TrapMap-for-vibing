import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
  SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
  getSharedJobContract,
  sharedJobContracts,
} from './types.js';

describe('shared job contracts', () => {
  it('declares owner, retries, and workflow binding for knowledge index follow-up', () => {
    const contract = getSharedJobContract(KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE);
    const payload = {
      entryId: 'entry_123',
      previousState: 'approved' as const,
      nextState: 'deactivated' as const,
      reason: 'phase5 validation',
    };

    expect(contract.taskType).toBe(KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE);
    expect(contract.maxAttempts).toBe(3);
    expect(contract.owner(payload)).toEqual({
      owner: 'knowledge-entry',
      subjectId: 'entry_123',
      subjectType: 'trap',
    });
    expect(contract.workflow.workflowType).toBe('knowledge-index-follow-up');
    expect(contract.workflow.runId(payload)).toBe(
      'wf_knowledge_index_entry_123_approved_deactivated_phase5_validation',
    );
    expect(contract.workflow.subjectId(payload)).toBe('entry_123');
    expect(contract.deadLetter.stepName).toBe('dead-letter');
  });

  it('declares skill projection ownership and workflow binding by artifact transition', () => {
    const contract = getSharedJobContract(SKILL_INDEX_FOLLOW_UP_TASK_TYPE);
    const payload = {
      artifactId: 'artifact_12',
      previousState: 'agent-pass' as const,
      nextState: 'approved' as const,
      reason: 'reviewer-approve',
    };

    expect(contract.maxAttempts).toBe(3);
    expect(contract.owner(payload)).toEqual({
      owner: 'skill-artifact',
      subjectId: 'artifact_12',
      subjectType: 'skill',
    });
    expect(contract.workflow.workflowType).toBe('skill-index-follow-up');
    expect(contract.workflow.runId(payload)).toBe(
      'wf_skill_index_artifact_12_agent-pass_approved_reviewer-approve',
    );
    expect(contract.workflow.subjectId(payload)).toBe('artifact_12');
  });

  it('registers every shared job type in one central registry', () => {
    expect(Object.keys(sharedJobContracts).sort()).toEqual(
      [
        'candidate_processing',
        KNOWLEDGE_INDEX_FOLLOW_UP_TASK_TYPE,
        SKILL_INDEX_FOLLOW_UP_TASK_TYPE,
      ].sort(),
    );
  });
});
