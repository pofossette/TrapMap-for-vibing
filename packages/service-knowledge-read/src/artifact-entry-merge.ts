/**
 * Artifact → retrieval-entry merge (cron retrieval-version linkage, 2026-08-16).
 *
 * Skill artifacts declare their semver in `latestRevision.version`, but the
 * recall pool only consumed `knowledgeEntries` — so versioned decay and the
 * retrieval response `version`/`revision` fields were structurally inert for
 * artifacts. This module maps artifact projections into the entry shape the
 * retrieval pipeline consumes so that:
 *
 * - artifacts become part of the recall pool (still eligibility-filtered),
 * - versioned artifacts declare `decayMeta.freshnessType = 'versioned'` so
 *   `versionMatchMultiplier` actually applies (neutral ×1 when unversioned),
 * - `version` / `revision` flow into scored entries and responses.
 *
 * The mapping is presentation-only: no rows are written, no artifact state is
 * mutated; the read model keeps `knowledgeEntries` and `skillArtifacts`
 * separate for their other consumers (owner/admin projections).
 */

import type { DecayMeta, KnowledgeRecord, KnowledgeRevisionRecord } from '@trapmap/contracts';

import type { SkillArtifactRecord } from './store.js';

/** Searchable detail text for an artifact's entry view (derived content first). */
export function artifactDetail(artifact: SkillArtifactRecord): string {
  const derived = artifact.latestRevision.derived;
  const parts: string[] = [];
  const profile = derived?.profile;
  if (profile?.summary) parts.push(profile.summary);
  if (profile?.description) parts.push(profile.description);
  for (const capsule of derived?.capsules ?? []) {
    if (capsule.content) parts.push(capsule.content);
  }
  return parts.join('\n\n') || artifact.title;
}

function revisionView(
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRecord['latestRevision'],
): KnowledgeRevisionRecord {
  return {
    revision: revision.revision,
    ...(revision.version !== undefined ? { version: revision.version } : {}),
    submittedAt: revision.submittedAt,
    submittedByUserId: revision.submittedByUserId,
    shortcut: artifact.title,
    detail: artifactDetail(artifact),
    labels: artifact.labels,
    reviewNotes: [],
  };
}

/**
 * Decay metadata for the artifact entry view.
 *
 * A versioned artifact is `freshnessType: 'versioned'` by nature — this is
 * what enables versioned decay. Unversioned artifacts stay evergreen, and the
 * neutral-unknown ruling (absent version → ×1) keeps them unpenalized.
 */
function decayMetaView(artifact: SkillArtifactRecord): DecayMeta {
  const freshnessType =
    artifact.latestRevision.version !== undefined
      ? 'versioned'
      : (artifact.decayMeta?.freshnessType ?? 'evergreen');
  return {
    lastVerifiedAt: artifact.updatedAt,
    decayState: 'active',
    supersededById: null,
    decayStateComputedAt: artifact.updatedAt,
    freshnessType,
  };
}

/** Map a skill artifact projection into the retrieval entry shape. */
export function artifactToRetrievalEntry(artifact: SkillArtifactRecord): KnowledgeRecord {
  return {
    id: artifact.id,
    teamId: artifact.teamId,
    scope: artifact.scope,
    labels: artifact.labels,
    shortcut: artifact.title,
    detail: artifactDetail(artifact),
    requiredLevel: artifact.requiredLevel,
    lifecycleState: artifact.lifecycleState,
    ownerUserId: artifact.ownerUserId,
    latestRevision: revisionView(artifact, artifact.latestRevision),
    history: artifact.history.map((revision) => revisionView(artifact, revision)),
    metadata: {
      scopeLabel: artifact.scope === 'global' ? 'global-constraint' : 'project-knowledge',
      submissionCount: artifact.metadata.submissionCount,
      resubmissionCount: artifact.metadata.resubmissionCount,
      revisionCount: artifact.metadata.revisionCount,
      latestSubmissionId: artifact.metadata.latestSubmissionId,
      latestSubmittedAt: artifact.metadata.latestSubmittedAt,
      latestReviewedAt: artifact.metadata.latestReviewedAt,
      latestDecision: artifact.metadata.latestDecision,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: artifact.agentReview,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    boundary: artifact.boundary,
    decayMeta: decayMetaView(artifact),
    evidenceMeta: artifact.evidenceMeta,
    maintenanceMeta: artifact.maintenanceMeta,
    ...(artifact.remediation !== undefined ? { remediation: artifact.remediation } : {}),
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

/**
 * Merge artifact projections into the retrieval recall pool.
 *
 * Entries already present under the same id win (entry ids take precedence
 * over artifact ids — the two id spaces are distinct today, but the merge
 * stays idempotent and collision-safe).
 */
export function mergeArtifactsIntoRetrievalPool(
  entries: KnowledgeRecord[],
  artifacts: SkillArtifactRecord[],
): KnowledgeRecord[] {
  const knownIds = new Set(entries.map((entry) => entry.id));
  const merged = [...entries];
  for (const artifact of artifacts) {
    if (knownIds.has(artifact.id)) continue;
    knownIds.add(artifact.id);
    merged.push(artifactToRetrievalEntry(artifact));
  }
  return merged;
}
