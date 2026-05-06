/**
 * Compile verification test for type exports.
 *
 * This test verifies that all types exported from lib/types.ts
 * are correctly importable. The test passes if TypeScript compiles
 * without errors -- runtime assertions are not needed since this
 * is a compile-time verification.
 *
 * Phase: 87 (Type & State Machine Centralization)
 */

import { describe, it, expect } from 'vitest';

// Import all types from the unified entry point
import type {
  // Store record types
  UserRecord,
  TeamRecord,
  MembershipRecord,
  AccessKeyRecord,
  SessionRecord,
  AuditEventRecord,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
  KnowledgeSubmissionRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  CandidateSubmissionRecord,
  DuplicateCaseRecord,
  EntityLineageRecord,
  FeedbackQueueRecord,
  StoreData,
  SkillShareerStore,
} from '../types.js';

// Import state machine functions
import {
  computeDecayState,
  isTerminalDecayState,
  isValidTransition,
  getValidTransitions,
  isTerminalState,
} from '../types.js';

// Import utility functions
import {
  nowIso,
  hashSecret,
  createOpaqueToken,
  createSlug,
} from '../types.js';

// Import JsonStore class
import { JsonStore } from '../types.js';

// Import sub-module types
import type {
  EmbeddingsProvider,
  ChatProvider,
} from '../types.js';

import type {
  GovernanceContext,
  GovernedEntity,
} from '../types.js';

import type {
  NormalizedIndexDocument,
  AdapterSyncState,
  KnowledgeIndexStateRecord,
} from '../types.js';

import type {
  RecallCandidate,
  MergedCandidate,
} from '../types.js';

import type {
  CandidateFingerprintInput,
  DuplicateDetectionInput,
} from '../types.js';

import type { ResolvedAuthContext } from '../types.js';

describe('Type Export Verification', () => {
  it('verifies record types are importable', () => {
    // Type assertions -- these compile if imports are valid
    const _user: UserRecord = {} as UserRecord;
    const _team: TeamRecord = {} as TeamRecord;
    const _membership: MembershipRecord = {} as MembershipRecord;
    const _knowledge: KnowledgeRecord = {} as KnowledgeRecord;
    const _artifact: SkillArtifactRecord = {} as SkillArtifactRecord;
    const _candidate: CandidateSubmissionRecord = {} as CandidateSubmissionRecord;
    const _feedback: FeedbackQueueRecord = {} as FeedbackQueueRecord;
    const _storeData: StoreData = {} as StoreData;

    // Dummy assertion to satisfy test framework
    expect(true).toBe(true);
  });

  it('verifies state machine functions are callable', () => {
    // Verify function signatures match expected types
    expect(typeof computeDecayState).toBe('function');
    expect(typeof isTerminalDecayState).toBe('function');
    expect(typeof isValidTransition).toBe('function');
    expect(typeof getValidTransitions).toBe('function');
    expect(typeof isTerminalState).toBe('function');
  });

  it('verifies utility functions are callable', () => {
    expect(typeof nowIso).toBe('function');
    expect(typeof hashSecret).toBe('function');
    expect(typeof createOpaqueToken).toBe('function');
    expect(typeof createSlug).toBe('function');
  });

  it('verifies JsonStore is a class', () => {
    expect(JsonStore).toBeInstanceOf(Function);
  });

  it('verifies sub-module types are importable', () => {
    // Type assertions for sub-module types
    const _embeddings: EmbeddingsProvider = {} as EmbeddingsProvider;
    const _governance: GovernanceContext = {} as GovernanceContext;
    const _index: NormalizedIndexDocument = {} as NormalizedIndexDocument;
    const _recall: RecallCandidate = {} as RecallCandidate;
    const _candidateInput: CandidateFingerprintInput = {} as CandidateFingerprintInput;
    const _auth: ResolvedAuthContext = {} as ResolvedAuthContext;

    expect(true).toBe(true);
  });
});
