/**
 * Skill artifact edit helper module.
 *
 * Provides edit, merge, and history retrieval functionality for skill artifacts.
 * Implements SKED-02 (edit flow) and SKED-04 (history view) requirements.
 *
 * Governance:
 * - Reuses existing RBAC patterns from routes (T-19-05 mitigation)
 * - Applies same team access and security level checks
 * - Preserves revision history immutably
 */

import { createHash } from 'node:crypto';

import type { AgentReviewResult, LifecycleState } from '@trapmap/contracts';

import type {
  SkillShareerStore,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  StoredScriptActivationPolicy,
  StoreData,
} from '../store.js';
import { appendSkillArtifactRevision } from './model.js';

/**
 * Determines if a file path is derivation-eligible.
 * Only SKILL.md and references/ are derivation-eligible.
 */
function isDerivationEligible(path: string): boolean {
  return path === 'SKILL.md' || path.startsWith('references/');
}

/**
 * Computes SHA-256 hash of content.
 */
function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Computes canonical source hash for an artifact revision.
 * Hash is computed from ordered derivation-eligible files only (SKILL.md + references/).
 * This ensures deterministic derivation caching.
 */
export function computeEditSourceHash(
  files: Array<{ path: string; sha256: string }>,
): string {
  // Filter to derivation-eligible files only
  const derivationEligible = files.filter((f) => isDerivationEligible(f.path));

  // Sort by path for determinism
  derivationEligible.sort((a, b) => a.path.localeCompare(b.path));

  // Concatenate hashes and compute final hash
  const combined = derivationEligible.map((f) => f.sha256).join('');
  return computeHash(combined);
}

/**
 * Edit payload for skill artifact modification.
 * All fields are optional - at least one must be provided.
 */
export interface SkillEditPayload {
  /** Full file replacement (if provided, replaces all files) */
  files?: Array<{
    path: string;
    kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
    sha256: string;
    sizeBytes: number;
    mediaType: string;
    source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
    includeInDerivation: boolean;
    activationOnly: boolean;
    content: string;
  }>;
  /** New title (optional) */
  title?: string;
  /** New labels (optional) */
  labels?: string[];
  /** Script descriptors (default: preserve existing) */
  scriptDescriptors?: Array<{
    path: string;
    sha256: string;
    capability: string;
    argsSchemaSummary: string;
    sideEffectSummary: string;
    defaultPolicy: StoredScriptActivationPolicy;
  }>;
}

/**
 * Result of merging edit payload with existing artifact.
 */
export interface MergedEditPayload {
  /** Merged file manifest */
  files: SkillArtifactRevisionRecord['files'];
  /** Merged script descriptors */
  scriptDescriptors: SkillArtifactRevisionRecord['scriptDescriptors'];
  /** Updated title (if changed) */
  title: string | null;
  /** Updated labels (if changed) */
  labels: string[] | null;
  /** Computed source hash from derivation-eligible files */
  sourceHash: string;
}

/**
 * Merges edit payload with existing artifact state.
 *
 * Behavior:
 * - If `files` provided: replace all files (full replacement, not patch)
 * - If `title` provided: update artifact title
 * - If `labels` provided: update artifact labels
 * - Script descriptors: use provided or preserve existing
 *
 * T-19-06 mitigation: Full file replacement ensures no orphaned files.
 */
export function mergeEditPayload(args: {
  artifact: SkillArtifactRecord;
  editPayload: SkillEditPayload;
}): MergedEditPayload {
  const { artifact, editPayload } = args;

  // Merge files: full replacement if provided
  const files = editPayload.files
    ? editPayload.files.map((f) => ({
        path: f.path,
        kind: f.kind,
        sha256: f.sha256,
        sizeBytes: f.sizeBytes,
        mediaType: f.mediaType,
        source: f.source,
        includeInDerivation: f.includeInDerivation,
        activationOnly: f.activationOnly,
      }))
    : artifact.latestRevision.files;

  // Merge script descriptors: use provided or preserve existing
  const scriptDescriptors = editPayload.scriptDescriptors
    ? editPayload.scriptDescriptors
    : artifact.latestRevision.scriptDescriptors;

  // Compute source hash from derivation-eligible files
  const sourceHash = computeEditSourceHash(files);

  return {
    files,
    scriptDescriptors,
    title: editPayload.title ?? null,
    labels: editPayload.labels ?? null,
    sourceHash,
  };
}

/**
 * Result of submitting a skill edit.
 */
export interface SubmitSkillEditResult {
  /** Updated artifact with new revision */
  artifact: SkillArtifactRecord;
  /** Revision number before this edit */
  previousRevision: number;
  /** Lifecycle state transition if applicable */
  lifecycleTransition: {
    from: LifecycleState;
    to: LifecycleState;
  } | null;
}

/**
 * Submits a skill artifact edit.
 *
 * This function:
 * 1. Merges the edit payload with existing artifact state
 * 2. Runs pre-review on the merged content
 * 3. Appends a new revision via appendSkillArtifactRevision()
 * 4. Returns the updated artifact with transition info
 *
 * Governance:
 * - Permission and team/level checks must be performed by the caller (T-19-05)
 * - This function focuses on the edit logic itself
 */
export async function submitSkillEdit(args: {
  store: SkillShareerStore;
  data: StoreData;
  artifact: SkillArtifactRecord;
  editorUserId: string;
  editPayload: SkillEditPayload;
  submittedAt: string;
  runPreReview: (input: {
    existingEntries: StoreData['knowledgeEntries'];
    submission: {
      detail: string;
      labels: string[];
      scope: 'global' | 'project';
      shortcut: string;
    };
  }) => Promise<AgentReviewResult>;
}): Promise<SubmitSkillEditResult> {
  const {
    store,
    data,
    artifact,
    editorUserId,
    editPayload,
    submittedAt,
    runPreReview: preReviewFn,
  } = args;

  // Capture previous state
  const previousRevision = artifact.latestRevision.revision;
  const previousLifecycleState = artifact.lifecycleState;

  // Merge edit payload with existing artifact
  const merged = mergeEditPayload({ artifact, editPayload });

  // Update artifact metadata (title, labels) if provided
  if (merged.title !== null) {
    artifact.title = merged.title;
  }
  if (merged.labels !== null) {
    artifact.labels = merged.labels;
  }

  // Run pre-review on merged content
  // Extract text content from files for pre-review
  const skillFile = merged.files.find((f) => f.path === 'SKILL.md');
  const detailContent = skillFile
    ? `Artifact: ${artifact.title}\nFiles: ${merged.files.map((f) => f.path).join(', ')}`
    : `Artifact: ${artifact.title}\nFiles: ${merged.files.map((f) => f.path).join(', ')}`;

  const preReview = await preReviewFn({
    existingEntries: data.knowledgeEntries,
    submission: {
      detail: detailContent,
      labels: artifact.labels,
      scope: artifact.scope,
      shortcut: artifact.title,
    },
  });

  // Append new revision
  appendSkillArtifactRevision({
    store,
    data,
    artifact,
    ownerUserId: editorUserId,
    payload: {
      files: merged.files,
      scriptDescriptors: merged.scriptDescriptors,
      sourceHash: merged.sourceHash,
    },
    submittedAt,
    preReview,
  });

  // Determine lifecycle transition
  const newLifecycleState = artifact.lifecycleState;
  const lifecycleTransition =
    previousLifecycleState !== newLifecycleState
      ? {
          from: previousLifecycleState,
          to: newLifecycleState,
        }
      : null;

  return {
    artifact,
    previousRevision,
    lifecycleTransition,
  };
}

/**
 * Revision summary for history listing.
 * Lightweight view without full file manifests (T-19-02 mitigation).
 */
export interface SkillRevisionSummary {
  /** Revision number */
  revision: number;
  /** When this revision was submitted */
  submittedAt: string;
  /** Who submitted this revision */
  submittedBy: {
    id: string;
    handle: string;
    securityLevel: number;
  };
  /** Brief description of changes (optional) */
  summary?: string;
  /** Lifecycle state after this revision */
  lifecycleState: LifecycleState;
}

/**
 * Retrieves revision history for a skill artifact.
 *
 * Returns revision summaries without full file manifests to prevent
 * unauthorized content exposure (T-19-02, T-19-09 mitigation).
 *
 * Governance:
 * - Permission and team/level checks must be performed by the caller
 * - This function focuses on building the history view
 */
export function getSkillHistory(args: {
  data: StoreData;
  artifactId: string;
}): {
  artifactId: string;
  title: string;
  currentRevision: number;
  lifecycleState: LifecycleState;
  revisions: SkillRevisionSummary[];
} {
  const { data, artifactId } = args;

  // Find the artifact
  const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
  if (!artifact) {
    throw new Error(`Artifact not found: ${artifactId}`);
  }

  // Build revision summaries from history
  // Map each revision to its lifecycle state from lifecycleHistory
  const revisions: SkillRevisionSummary[] = artifact.history.map((revision) => {
    // Find the lifecycle event for this revision's agent review
    const agentReviewEvent = artifact.lifecycleHistory.find(
      (event) => event.revision === revision.revision && event.type === 'agent-reviewed',
    );

    const lifecycleState = agentReviewEvent?.state ?? 'agent-pass';

    // Get submitter info
    const submitterUser = data.users.find((u) => u.id === revision.submittedByUserId);

    return {
      revision: revision.revision,
      submittedAt: revision.submittedAt,
      submittedBy: {
        id: revision.submittedByUserId,
        handle: submitterUser?.handle ?? revision.submittedByUserId,
        securityLevel: artifact.requiredLevel, // Use artifact level as fallback
      },
      lifecycleState,
    };
  });

  return {
    artifactId: artifact.id,
    title: artifact.title,
    currentRevision: artifact.latestRevision.revision,
    lifecycleState: artifact.lifecycleState,
    revisions,
  };
}
