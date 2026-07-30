import { isDeepStrictEqual } from 'node:util';

import type {
  Boundary,
  DecayMeta,
  EvidenceMeta,
  FeedbackRemediationState,
  LifecycleState,
  Scope,
  SkillArtifactDerived,
  SkillArtifactFile,
  SkillArtifactMetadata,
  SkillScriptDescriptor,
} from '@trapmap/contracts';

export interface LegacyArtifactReviewNote {
  id: string;
  createdAt: string;
  authorType: 'submitter' | 'agent' | 'reviewer' | 'system';
  authorUserId: string | null;
  message: string;
}

export interface LegacyArtifactReviewDecision {
  decidedAt: string;
  decidedByUserId: string;
  decision: 'approve' | 'reject';
  notes: string;
}

export interface LegacyArtifactAgentReview {
  status: 'agent-pass' | 'agent-rejected';
  duplicateRisk: 'low' | 'medium' | 'high';
  correctnessRisk: 'low' | 'medium' | 'high';
  completenessRisk: 'low' | 'medium' | 'high';
  checkedAt: string;
  notes: string[];
}

export interface LegacyArtifactRevision {
  revision: number;
  sourceHash: string;
  files: SkillArtifactFile[];
  submittedAt: string;
  submittedByUserId: string;
  scriptDescriptors: SkillScriptDescriptor[];
  derived: SkillArtifactDerived | null;
}

export interface LegacyArtifactLifecycleEvent {
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

export interface LegacyArtifactMaintenanceMeta {
  maintainerUserId: string | null;
  maintainerHandle: string | null;
  maintainerLevel: number | null;
  reviewBy: string | null;
}

/**
 * Verbatim legacy snapshot shape for a skill artifact. The owner persists this
 * record as-is so that the Wave-9 cutover can verify exact round-trip equality
 * without papering over handle/security level/revision differences.
 */
export interface LegacyArtifactSnapshotRecord {
  id: string;
  teamId: string | null;
  scope: Scope;
  labels: string[];
  title: string;
  slug: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  ownerUserId: string;
  latestRevision: LegacyArtifactRevision;
  history: LegacyArtifactRevision[];
  metadata: SkillArtifactMetadata;
  agentReview: LegacyArtifactAgentReview | null;
  reviewHistory: LegacyArtifactReviewDecision[];
  reviewNotes: LegacyArtifactReviewNote[];
  lifecycleHistory: LegacyArtifactLifecycleEvent[];
  boundary: Boundary | null;
  decayMeta: DecayMeta | null;
  evidenceMeta: EvidenceMeta | null;
  maintenanceMeta: LegacyArtifactMaintenanceMeta | null;
  remediation: FeedbackRemediationState | null;
  createdAt: string;
  updatedAt: string;
}

export interface LegacyArtifactSnapshotOwner {
  put(record: LegacyArtifactSnapshotRecord): Promise<void>;
  get(recordId: string): Promise<LegacyArtifactSnapshotRecord | null>;
}

export interface ArtifactMigrationError {
  artifactId: string;
  error: string;
}

export interface ArtifactMigrationResult {
  totalArtifacts: number;
  migrated: number;
  skipped: number;
  verified: number;
  errors: ArtifactMigrationError[];
  durationMs: number;
}

export interface Wave9ArtifactBackfillConfig {
  owner: LegacyArtifactSnapshotOwner;
  records: readonly LegacyArtifactSnapshotRecord[];
}

function recordsMatch(
  left: LegacyArtifactSnapshotRecord,
  right: LegacyArtifactSnapshotRecord,
): boolean {
  return isDeepStrictEqual(left, right);
}

/**
 * Task 9-only migration into knowledge-write-owned tables. The legacy snapshot
 * is preserved verbatim because the runtime `SkillArtifact` shape and the
 * legacy record disagree on owner handle, security level, revision aggregate
 * and lifecycle history authorship; converting to the runtime shape would
 * silently paper over those business fields with defaults.
 */
export async function migrateLegacySkillArtifacts(
  config: Wave9ArtifactBackfillConfig,
): Promise<ArtifactMigrationResult> {
  const startedAt = Date.now();
  const result: ArtifactMigrationResult = {
    totalArtifacts: config.records.length,
    migrated: 0,
    skipped: 0,
    verified: 0,
    errors: [],
    durationMs: 0,
  };

  for (const record of config.records) {
    try {
      const existing = await config.owner.get(record.id);
      if (existing) {
        if (!recordsMatch(existing, record)) {
          result.errors.push({
            artifactId: record.id,
            error: 'destination artifact differs from snapshot',
          });
          continue;
        }
        result.skipped += 1;
        result.verified += 1;
      } else {
        await config.owner.put(record);
        result.migrated += 1;
        const written = await config.owner.get(record.id);
        if (written && recordsMatch(written, record)) {
          result.verified += 1;
        } else {
          result.errors.push({
            artifactId: record.id,
            error: 'destination artifact differs from snapshot after write',
          });
        }
      }
    } catch (error) {
      result.errors.push({
        artifactId: record.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}
