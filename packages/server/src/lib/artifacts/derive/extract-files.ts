/**
 * File extraction helpers for derivation.
 *
 * T-12-09: derive hashes from ordered SKILL.md + references/ text only
 */

import type {
  ArtifactFilePayloadRecord,
  SkillArtifactRevisionRecord,
} from '@trapmap/server/lib/store.js';

/**
 * Extract derivation-eligible files (SKILL.md and references/ only).
 *
 * T-12-09: derive hashes from ordered SKILL.md + references/ text only
 *
 * @param revision - Artifact revision
 * @returns Array of files eligible for derivation, ordered by path
 */
export function getDerivationEligibleFiles(revision: SkillArtifactRevisionRecord) {
  return revision.files
    .filter((f) => f.includeInDerivation && !f.activationOnly)
    .sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Extract files by source directory.
 */
export function getFilesBySource(
  revision: SkillArtifactRevisionRecord,
  source: 'SKILL.md' | 'references/' | 'assets/' | 'scripts/',
) {
  return revision.files.filter((f) => f.source === source);
}

/**
 * Extract text content from file payloads for derivation.
 * Only includes SKILL.md and references/ files (T-12-10).
 *
 * @param payloads - File payload records
 * @returns Combined text content from derivation-eligible files
 */
export function extractDerivationText(payloads: ArtifactFilePayloadRecord[]): string {
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
