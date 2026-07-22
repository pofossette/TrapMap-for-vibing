import type {
  Boundary,
  DecayMeta,
  EvidenceMeta,
  FeedbackRemediationState,
  LifecycleState,
  Scope,
} from '@trapmap/contracts';

export interface LegacyKnowledgeReviewNote {
  id: string;
  createdAt: string;
  authorType: 'submitter' | 'agent' | 'reviewer' | 'system';
  authorUserId: string | null;
  message: string;
}

export interface LegacyKnowledgeRevision {
  revision: number;
  submittedAt: string;
  submittedByUserId: string;
  shortcut: string;
  detail: string;
  labels: string[];
  reviewNotes: LegacyKnowledgeReviewNote[];
}

export interface LegacyKnowledgeReviewDecision {
  decidedAt: string;
  decidedByUserId: string;
  decision: 'approve' | 'reject';
  notes: string;
}

export interface LegacyKnowledgeAgentReview {
  status: 'agent-pass' | 'agent-rejected';
  duplicateRisk: 'low' | 'medium' | 'high';
  correctnessRisk: 'low' | 'medium' | 'high';
  completenessRisk: 'low' | 'medium' | 'high';
  checkedAt: string;
  notes: string[];
}

export interface LegacyKnowledgeSubmission {
  id: string;
  revision: number;
  submittedAt: string;
  submittedByUserId: string;
  lifecycleState: LifecycleState;
  resubmissionOf: string | null;
  agentReview: LegacyKnowledgeAgentReview | null;
  reviewerDecision: LegacyKnowledgeReviewDecision | null;
  reviewNotes: LegacyKnowledgeReviewNote[];
}

export interface LegacyKnowledgeLifecycleEvent {
  id: string;
  type:
    | 'submitted'
    | 'resubmitted'
    | 'agent-reviewed'
    | 'reviewer-approved'
    | 'reviewer-rejected'
    | 'updated'
    | 'deactivated';
  createdAt: string;
  actorUserId: string | null;
  submissionId: string | null;
  revision: number | null;
  state: LifecycleState;
  note: string | null;
}

export interface LegacyKnowledgeSnapshotRecord {
  id: string;
  teamId: string | null;
  scope: Scope;
  labels: string[];
  shortcut: string;
  detail: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  ownerUserId: string;
  latestRevision: LegacyKnowledgeRevision;
  history: LegacyKnowledgeRevision[];
  metadata: Record<string, unknown>;
  latestSubmissionId: string | null;
  submissionHistory: LegacyKnowledgeSubmission[];
  agentReview: LegacyKnowledgeAgentReview | null;
  reviewHistory: LegacyKnowledgeReviewDecision[];
  reviewNotes: LegacyKnowledgeReviewNote[];
  lifecycleHistory: LegacyKnowledgeLifecycleEvent[];
  embeddingCache: {
    textHash: string;
    vector: number[];
    createdAt: string;
    revision: number;
  } | null;
  indexState: Record<string, unknown> | null;
  boundary: Boundary | null;
  decayMeta: DecayMeta | null;
  evidenceMeta: EvidenceMeta | null;
  maintenanceMeta: Record<string, unknown> | null;
  remediation: FeedbackRemediationState | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeSnapshotOwner {
  put(record: LegacyKnowledgeSnapshotRecord): Promise<void>;
  get(recordId: string): Promise<LegacyKnowledgeSnapshotRecord | null>;
}

export interface KnowledgeSnapshotBackfillResult {
  migrated: number;
  skipped: number;
  verified: number;
  errors: Array<{ recordId: string; error: string }>;
}

function recordsMatch(
  left: LegacyKnowledgeSnapshotRecord,
  right: LegacyKnowledgeSnapshotRecord,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Task 9-only migration into knowledge-write-owned tables. The snapshot is
 * never imported through the normal submit path because it must retain IDs and
 * historical aggregates exactly.
 */
export async function migrateKnowledgeSnapshot(input: {
  owner: KnowledgeSnapshotOwner;
  records: readonly LegacyKnowledgeSnapshotRecord[];
}): Promise<KnowledgeSnapshotBackfillResult> {
  const result: KnowledgeSnapshotBackfillResult = {
    migrated: 0,
    skipped: 0,
    verified: 0,
    errors: [],
  };

  for (const record of input.records) {
    try {
      const existing = await input.owner.get(record.id);
      if (existing) {
        if (recordsMatch(existing, record)) {
          result.skipped += 1;
          result.verified += 1;
        } else {
          result.errors.push({
            recordId: record.id,
            error: 'destination record differs from snapshot',
          });
        }
        continue;
      }

      await input.owner.put(record);
      result.migrated += 1;
      const written = await input.owner.get(record.id);
      if (written && recordsMatch(written, record)) result.verified += 1;
      else {
        result.errors.push({
          recordId: record.id,
          error: 'destination record differs from snapshot after write',
        });
      }
    } catch (error) {
      result.errors.push({
        recordId: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return result;
}
