/**
 * Deterministic derivation module for skill artifact outputs.
 *
 * This module provides:
 * - deriveSkillArtifactOutputs(): Deterministic derivation of profile, capsules, and client manifest
 * - buildSkillProfile(): Distill profile from SKILL.md and references/
 * - buildSkillCapsules(): Generate knowledge capsules from derivation-eligible content
 * - buildClientManifest(): Assemble activation metadata for references, assets, and scripts
 *
 * T-12-09: Derive hashes from ordered SKILL.md + references/ text only
 * T-12-10: Exclude assets/ and scripts/ bodies from profile/capsule content
 * T-12-11: Derived outputs inherit governance from artifact root
 * T-12-12: Keep derivation deterministic and revision-scoped with cached outputs
 */

import { createHash } from 'node:crypto';

import type {
  ClientManifestAssetRecord,
  ClientManifestRecord,
  ClientManifestReferenceRecord,
  ClientManifestScriptRecord,
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
  SkillArtifactDerivedRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  SkillScriptDescriptorRecord,
  StoreData,
} from '../store.js';
import { nowIso } from '../store.js';

/**
 * Result of deriving outputs from a skill artifact revision.
 */
export interface DerivedArtifactOutputs {
  /** Distilled profile from SKILL.md and references/ */
  profile: DerivedSkillProfileRecord | null;
  /** Knowledge capsules distilled from SKILL.md and references/ */
  capsules: DerivedSkillCapsuleRecord[];
  /** Client activation manifest for references, assets, and scripts */
  clientManifest: ClientManifestRecord | null;
  /** Hash of all source files used for derivation (SKILL.md + references/) */
  sourceHash: string;
  /** ISO timestamp when derivation was computed */
  derivedAt: string;
}

/**
 * Generate a deterministic SHA-256 content hash from ordered file contents.
 *
 * @param contents - Array of file contents in deterministic order
 * @returns Hex-encoded SHA-256 hash
 */
function buildContentHash(contents: string[]): string {
  const combined = contents.join('\n\n');
  return createHash('sha256').update(combined).digest('hex');
}

/**
 * Generate a deterministic capsule ID from artifact ID, revision, and source hash.
 *
 * @param artifactId - Artifact identifier
 * @param revision - Revision number
 * @param sourceHash - Hash of source content
 * @param index - Capsule index for uniqueness
 * @returns Deterministic capsule ID
 */
function buildCapsuleId(
  artifactId: string,
  revision: number,
  sourceHash: string,
  index: number,
): string {
  const input = `${artifactId}:${revision}:${sourceHash}:${index}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Extract derivation-eligible files (SKILL.md and references/ only).
 *
 * T-12-09: derive hashes from ordered SKILL.md + references/ text only
 *
 * @param revision - Artifact revision
 * @returns Array of files eligible for derivation, ordered by path
 */
function getDerivationEligibleFiles(revision: SkillArtifactRevisionRecord) {
  return revision.files
    .filter((f) => f.includeInDerivation && !f.activationOnly)
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Extract files by source directory.
 */
function getFilesBySource(
  revision: SkillArtifactRevisionRecord,
  source: 'SKILL.md' | 'references/' | 'assets/' | 'scripts/',
) {
  return revision.files.filter((f) => f.source === source);
}

/**
 * Build a distilled skill profile from SKILL.md and references/.
 *
 * T-12-09: derive hashes from ordered SKILL.md + references/ text only
 * T-12-10: exclude assets/ and scripts/ bodies from profile content
 *
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision
 * @param sourceHash - Hash of all derivation-eligible files
 * @returns Derived skill profile
 */
function buildSkillProfile(
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
  sourceHash: string,
): DerivedSkillProfileRecord | null {
  const eligibleFiles = getDerivationEligibleFiles(revision);

  if (eligibleFiles.length === 0) {
    return null;
  }

  // In a real implementation, this would parse SKILL.md frontmatter
  // and extract actual content. For now, we use placeholder values
  // that can be filled in during Phase 13 import work.
  const skillMdFile = eligibleFiles.find((f) => f.source === 'SKILL.md');
  const referenceFiles = eligibleFiles.filter((f) => f.source === 'references/');

  // Placeholder content hash - will be computed from actual file contents
  // during Phase 13 when file content is available
  const contentHash = buildContentHash(
    eligibleFiles.map((f) => f.sha256), // Using file hashes as content proxy
  );

  // Extract reference paths in deterministic order
  const referencePaths = referenceFiles
    .map((f) => f.path)
    .sort((a, b) => a.localeCompare(b));

  // Extract keywords from artifact labels
  const keywords = [...artifact.labels].sort();

  return {
    artifactId: artifact.id,
    revision: revision.revision,
    sourceHash,
    title: artifact.title,
    summary: `Skill artifact: ${artifact.title}`, // Placeholder summary
    keywords,
    referencePaths,
    contentHash,
  };
}

/**
 * Build knowledge capsules from SKILL.md and references/.
 *
 * T-12-09: derive hashes from ordered SKILL.md + references/ text only
 * T-12-10: exclude assets/ and scripts/ bodies from capsule content
 * T-12-11: capsules inherit scope and requiredLevel from artifact root
 *
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision
 * @param sourceHash - Hash of all derivation-eligible files
 * @returns Array of derived skill capsules
 */
function buildSkillCapsules(
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
  sourceHash: string,
): DerivedSkillCapsuleRecord[] {
  const eligibleFiles = getDerivationEligibleFiles(revision);

  if (eligibleFiles.length === 0) {
    return [];
  }

  // In a real implementation, this would:
  // 1. Parse SKILL.md to identify situation/problem/goal triples
  // 2. Parse each reference/ file to extract additional context
  // 3. Generate one capsule per distinct problem/solution pattern
  //
  // For Phase 12, we create a placeholder capsule that will be
  // replaced with actual LLM-derived content in Phase 14.

  const capsuleId = buildCapsuleId(artifact.id, revision.revision, sourceHash, 0);

  // Source paths for this capsule (all derivation-eligible files)
  const sourcePaths = eligibleFiles.map((f) => f.path).sort((a, b) => a.localeCompare(b));

  return [
    {
      capsuleId,
      artifactId: artifact.id,
      revision: revision.revision,
      sourcePaths,
      content: `Skill artifact: ${artifact.title}\n\nLabels: ${artifact.labels.join(', ')}`, // Placeholder content
      situation: 'When working with this skill', // Placeholder situation
      problem: `The problem addressed by ${artifact.title}`, // Placeholder problem
      goal: `Apply the solution pattern from ${artifact.title}`, // Placeholder goal
      errorText: null,
      labels: [...artifact.labels],
      scope: artifact.scope, // Inherit governance (T-12-11)
      requiredLevel: artifact.requiredLevel, // Inherit governance (T-12-11)
    },
  ];
}

/**
 * Build client activation manifest for references, assets, and scripts.
 *
 * T-12-10: expose assets/ and scripts/ through clientManifest metadata only
 * T-12-10: scripts are metadata-only (no bodies)
 *
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision
 * @param sourceHash - Hash of all source files for this manifest
 * @returns Client activation manifest
 */
function buildClientManifest(
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
  sourceHash: string,
): ClientManifestRecord | null {
  const referenceFiles = getFilesBySource(revision, 'references/');
  const assetFiles = getFilesBySource(revision, 'assets/');
  const scriptFiles = getFilesBySource(revision, 'scripts/');

  if (referenceFiles.length === 0 && assetFiles.length === 0 && scriptFiles.length === 0) {
    return null;
  }

  // Build reference metadata
  const references: ClientManifestReferenceRecord[] = referenceFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({
      path: f.path,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mediaType: f.mediaType,
    }));

  // Build asset metadata (T-12-10: metadata only)
  const assets: ClientManifestAssetRecord[] = assetFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({
      path: f.path,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mediaType: f.mediaType,
    }));

  // Build script metadata (T-12-10: capability only, no bodies)
  const scripts: ClientManifestScriptRecord[] = revision.scriptDescriptors
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((d: SkillScriptDescriptorRecord) => ({
      path: d.path,
      sha256: d.sha256,
      capability: d.capability,
      argsSchemaSummary: d.argsSchemaSummary,
      sideEffectSummary: d.sideEffectSummary,
      defaultPolicy: d.defaultPolicy,
    }));

  return {
    artifactId: artifact.id,
    revision: revision.revision,
    references,
    assets,
    scripts,
    sourceHash,
  };
}

/**
 * Derive deterministic outputs from a skill artifact revision.
 *
 * This is the main entry point for derivation. It produces:
 * - A distilled profile from SKILL.md and references/
 * - One or more knowledge capsules
 * - A client activation manifest for references, assets, and scripts
 *
 * T-12-09: Derive hashes from ordered SKILL.md + references/ text only
 * T-12-10: Exclude assets/ and scripts/ bodies from profile/capsule content
 * T-12-11: Derived outputs inherit governance from artifact root
 * T-12-12: Keep derivation deterministic and revision-scoped with cached outputs
 *
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision to derive from
 * @returns Derived artifact outputs
 */
export function deriveSkillArtifactOutputs(
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
): DerivedArtifactOutputs {
  const derivedAt = nowIso();

  // Compute source hash from derivation-eligible files only (SKILL.md + references/)
  // T-12-09: derive hashes from ordered SKILL.md + references/ text only
  const eligibleFiles = getDerivationEligibleFiles(revision);
  const sourceHash = buildContentHash(eligibleFiles.map((f) => f.sha256));

  // Build profile from SKILL.md and references/
  const profile = buildSkillProfile(artifact, revision, sourceHash);

  // Build capsules from SKILL.md and references/
  const capsules = buildSkillCapsules(artifact, revision, sourceHash);

  // Build client manifest for references, assets, and scripts
  const clientManifest = buildClientManifest(artifact, revision, sourceHash);

  return {
    profile,
    capsules,
    clientManifest,
    sourceHash,
    derivedAt,
  };
}

/**
 * Apply derived outputs to a revision record.
 *
 * This persists the derived outputs on the revision for caching.
 * The outputs are keyed by sourceHash so downstream phases can
 * consume them without recomputing derivation.
 *
 * T-12-11: Persist derived outputs on governed revisions
 * T-12-12: Cache outputs for downstream consumption
 *
 * @param data - Store data
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision to update
 * @param derived - Derived outputs to apply
 * @returns Updated artifact record
 */
export function applyDerivedArtifactOutputs(
  data: StoreData,
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
  derived: DerivedArtifactOutputs,
): SkillArtifactRecord {
  // Create derived record
  const derivedRecord: SkillArtifactDerivedRecord = {
    profile: derived.profile,
    capsules: derived.capsules,
    clientManifest: derived.clientManifest,
    sourceHash: derived.sourceHash,
    derivedAt: derived.derivedAt,
  };

  // Update the revision with derived outputs
  revision.derived = derivedRecord;

  // Update the artifact's latestRevision reference
  artifact.latestRevision = revision;

  // Update the revision in history
  const historyIndex = artifact.history.findIndex((h) => h.revision === revision.revision);
  if (historyIndex !== -1) {
    artifact.history[historyIndex] = revision;
  }

  return artifact;
}
