/**
 * Deterministic derivation module for skill artifact outputs.
 *
 * This module provides:
 * - deriveSkillArtifactOutputs(): Deterministic derivation of profile, capsules, and client manifest
 * - deriveFromPayloads(): Derivation from actual file content (Phase 14 Task 1)
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
import { parseSkillMarkdown } from '@trapmap/contracts';

import type {
  ArtifactFilePayloadRecord,
  ClientManifestAssetRecord,
  ClientManifestRecord,
  ClientManifestReferenceRecord,
  ClientManifestScriptRecord,
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
  SkillArtifactDerivedRecord,
  SkillArtifactFileRecord,
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
  const referencePaths = referenceFiles.map((f) => f.path).sort((a, b) => a.localeCompare(b));

  // Extract keywords from artifact labels
  const keywords = [...artifact.labels].sort();

  return {
    artifactId: artifact.id,
    revision: revision.revision,
    sourceHash,
    title: artifact.title,
    summary: `Skill artifact: ${artifact.title}`, // Placeholder summary
    keywords,
    labels: keywords,
    prerequisites: [],
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

// =============================================================================
// Phase 14 Task 1: Retrieval-grade derivation from actual file content
// These functions derive profile/capsule content from actual SKILL.md and reference
// text, not just title/labels placeholders. (RETR-03, CAPS-04)
// =============================================================================

/**
 * Context for derivation from file payloads.
 */
interface PayloadDerivationContext {
  artifactId: string;
  labels: string[];
  title: string;
  scope: 'global' | 'project';
  requiredLevel: number;
}

/**
 * Extract text content from file payloads for derivation.
 * Only includes SKILL.md and references/ files (T-12-10).
 *
 * @param payloads - File payload records
 * @returns Combined text content from derivation-eligible files
 */
function extractDerivationText(payloads: ArtifactFilePayloadRecord[]): string {
  // Filter to derivation-eligible files (SKILL.md and references/)
  const derivationEligible = payloads.filter((p) => {
    const path = p.path;
    return path === 'SKILL.md' || path.startsWith('references/');
  });

  // Sort by path for deterministic ordering
  derivationEligible.sort((a, b) => a.path.localeCompare(b.path));

  // Combine content
  return derivationEligible.map((p) => p.content).join('\n\n');
}

/**
 * Extract frontmatter metadata from SKILL.md content.
 *
 * @param content - SKILL.md content with optional frontmatter
 * @returns Extracted title and labels
 */
function parseFrontmatter(content: string): { title: string | null; labels: string[] } {
  const metadata = parseSkillMarkdown(content);
  return {
    title: metadata.title,
    labels: metadata.labels,
  };
}

/**
 * Extract situation/problem/goal sections from SKILL.md content.
 *
 * @param content - SKILL.md content with sections
 * @returns Extracted sections
 */
function extractSections(content: string): {
  situation: string | null;
  problem: string | null;
  goal: string | null;
} {
  // Remove frontmatter
  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, '');

  // Extract sections using markdown headers
  const sectionPatterns = {
    situation: /^##\s*Situation\s*\n([\s\S]*?)(?=\n##|\n#|$)/i,
    problem: /^##\s*Problem\s*\n([\s\S]*?)(?=\n##|\n#|$)/i,
    goal: /^##\s*Goal\s*\n([\s\S]*?)(?=\n##|\n#|$)/i,
  };

  const extractSection = (pattern: RegExp): string | null => {
    const match = body.match(pattern);
    if (!match) return null;
    const text = match[1]?.trim();
    if (!text) return null;
    // Truncate to max length for capsule fields
    return text.length > 1000 ? `${text.slice(0, 997)}...` : text;
  };

  return {
    situation: extractSection(sectionPatterns.situation),
    problem: extractSection(sectionPatterns.problem),
    goal: extractSection(sectionPatterns.goal),
  };
}

/**
 * Build a summary from combined text content.
 * Uses the first meaningful paragraph or extracts key sentences.
 *
 * @param text - Combined text content
 * @returns Summary string
 */
function buildSummaryFromText(text: string): string {
  // Remove frontmatter
  let body = text.replace(/^---\n[\s\S]*?\n---\n?/, '');

  // Remove code blocks
  body = body.replace(/```[\s\S]*?```/g, '');

  // Find first paragraph with meaningful content
  const paragraphs = body.split(/\n\n+/);
  for (const para of paragraphs) {
    const cleaned = para.replace(/^#+\s*/gm, '').trim();
    if (cleaned.length > 20) {
      // Truncate to max 1000 chars
      return cleaned.length > 1000 ? `${cleaned.slice(0, 997)}...` : cleaned;
    }
  }

  // Fallback: use first 500 chars
  const fallback = body.replace(/[#*`\[\]]/g, '').trim();
  return fallback.length > 500 ? `${fallback.slice(0, 497)}...` : fallback;
}

/**
 * Extract keywords from text content.
 *
 * @param text - Combined text content
 * @param existingLabels - Labels from artifact/frontmatter
 * @returns Array of keywords
 */
function extractKeywords(text: string, existingLabels: string[]): string[] {
  const keywords = new Set<string>(existingLabels);

  // Common technical terms to look for
  const technicalPatterns = [
    /\b(docker|kubernetes|node\.?js|typescript|javascript|python|rust|go|java)\b/gi,
    /\b(react|vue|angular|express|fastify|next\.?js)\b/gi,
    /\b(postgres|mysql|mongodb|redis|sqlite)\b/gi,
    /\b(aws|gcp|azure|terraform|ansible)\b/gi,
  ];

  for (const pattern of technicalPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Normalize: lowercase, remove dots
        const normalized = match.toLowerCase().replace(/\./g, '');
        keywords.add(normalized);
      }
    }
  }

  return Array.from(keywords).sort().slice(0, 10);
}

/**
 * Derive profile and capsules from actual file payloads.
 * This is the retrieval-grade derivation that produces meaningful content
 * from SKILL.md and reference text (RETR-03, CAPS-04).
 *
 * T-12-09: Derive hashes from ordered SKILL.md + references/ text only
 * T-12-10: Exclude assets/ and scripts/ bodies from profile/capsule content
 * T-12-11: Derived outputs inherit governance from artifact root
 *
 * @param payloads - File payload records with actual content
 * @param context - Derivation context with artifact metadata
 * @returns Derived artifact outputs
 */
export function deriveFromPayloads(
  payloads: ArtifactFilePayloadRecord[],
  context: PayloadDerivationContext,
): DerivedArtifactOutputs {
  const derivedAt = nowIso();

  // Extract derivation-eligible text (SKILL.md + references/)
  const derivationText = extractDerivationText(payloads);

  // Get derivation-eligible payloads
  const derivationEligible = payloads
    .filter((p) => p.path === 'SKILL.md' || p.path.startsWith('references/'))
    .sort((a, b) => a.path.localeCompare(b.path));

  // Compute source hash from content
  const sourceHash = buildContentHash(derivationEligible.map((p) => p.sha256));

  // Parse frontmatter from SKILL.md if present
  const skillMdPayload = payloads.find((p) => p.path === 'SKILL.md');
  const frontmatter = skillMdPayload
    ? parseFrontmatter(skillMdPayload.content)
    : { title: null, labels: [] };

  // Use provided labels merged with frontmatter labels
  const allLabels = [...new Set([...context.labels, ...frontmatter.labels])];

  // Build profile from actual text
  const summary = buildSummaryFromText(derivationText);
  const keywords = extractKeywords(derivationText, allLabels);
  const referencePaths = derivationEligible
    .filter((p) => p.path.startsWith('references/'))
    .map((p) => p.path);

  // Build content hash from actual text
  const contentHash = buildContentHash([derivationText]);

  const profile: DerivedSkillProfileRecord | null =
    derivationEligible.length > 0
      ? {
          artifactId: context.artifactId,
          revision: 1, // Will be set by caller
          sourceHash,
          title: frontmatter.title ?? context.title,
          summary,
          keywords,
          referencePaths,
          contentHash,
        }
      : null;

  // Extract sections for capsules
  const sections = skillMdPayload
    ? extractSections(skillMdPayload.content)
    : { situation: null, problem: null, goal: null };

  // Build capsule(s) from content
  const capsules: DerivedSkillCapsuleRecord[] = [];

  if (derivationEligible.length > 0) {
    // Generate primary capsule from SKILL.md sections
    const capsuleId = buildCapsuleId(context.artifactId, 1, sourceHash, 0);
    const capsuleContent = buildSummaryFromText(derivationText);

    capsules.push({
      capsuleId,
      artifactId: context.artifactId,
      revision: 1,
      sourcePaths: derivationEligible.map((p) => p.path),
      content: capsuleContent,
      situation: sections.situation ?? `When working with ${context.title}`,
      problem: sections.problem ?? `The problem addressed by ${context.title}`,
      goal: sections.goal ?? `Apply the solution from ${context.title}`,
      errorText: null,
      labels: allLabels.sort(),
      scope: context.scope,
      requiredLevel: context.requiredLevel,
    });

    // Generate additional capsules from reference files if they contain distinct content
    const referencePayloads = derivationEligible.filter((p) => p.path.startsWith('references/'));

    for (const refPayload of referencePayloads) {
      if (capsules.length >= 5) break;
      const refContent = refPayload.content;

      // Check if this reference has meaningful distinct content
      const refSections = extractSections(refContent);
      if (refSections.problem || refSections.situation) {
        const refCapsuleId = buildCapsuleId(context.artifactId, 1, sourceHash, capsules.length);
        const refCapsuleContent = buildSummaryFromText(refContent);

        capsules.push({
          capsuleId: refCapsuleId,
          artifactId: context.artifactId,
          revision: 1,
          sourcePaths: [refPayload.path],
          content: refCapsuleContent,
          situation: refSections.situation ?? `When working with ${refPayload.path}`,
          problem: refSections.problem ?? `Issue described in ${refPayload.path}`,
          goal: refSections.goal ?? `Apply solution from ${refPayload.path}`,
          errorText: null,
          labels: allLabels.sort(),
          scope: context.scope,
          requiredLevel: context.requiredLevel,
        });
      }
    }
  }

  // Build client manifest for all files
  const referenceFiles = payloads.filter((p) => p.path.startsWith('references/'));
  const assetFiles = payloads.filter((p) => p.path.startsWith('assets/'));
  const scriptFiles = payloads.filter((p) => p.path.startsWith('scripts/'));

  const clientManifest: ClientManifestRecord | null =
    referenceFiles.length > 0 || assetFiles.length > 0 || scriptFiles.length > 0
      ? {
          artifactId: context.artifactId,
          revision: 1,
          references: referenceFiles
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((p) => ({
              path: p.path,
              sha256: p.sha256,
              sizeBytes: p.sizeBytes,
              mediaType: p.mediaType,
            })),
          assets: assetFiles
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((p) => ({
              path: p.path,
              sha256: p.sha256,
              sizeBytes: p.sizeBytes,
              mediaType: p.mediaType,
            })),
          scripts: scriptFiles
            .sort((a, b) => a.path.localeCompare(b.path))
            .map((p) => ({
              path: p.path,
              sha256: p.sha256,
              capability: `Script: ${p.path}`,
              argsSchemaSummary: '',
              sideEffectSummary: '',
              defaultPolicy: 'manual' as const,
            })),
          sourceHash,
        }
      : null;

  return {
    profile,
    capsules,
    clientManifest,
    sourceHash,
    derivedAt,
  };
}
