/**
 * Deterministic derivation module for skill artifact outputs.
 *
 * Re-exports from focused sub-modules:
 * - types: Shared interfaces (DerivedArtifactOutputs, PayloadDerivationContext)
 * - hash: Deterministic hashing utilities
 * - extract-files: File extraction and filtering helpers
 * - parse-content: Markdown content parsing
 * - client-manifest: Client activation manifest builder
 * - legacy: Legacy derivation from revision records
 * - from-payloads: Retrieval-grade derivation from file content
 * - apply: Unified derivation-and-application seam
 *
 * T-12-09: Derive hashes from ordered SKILL.md + references/ text only
 * T-12-10: Exclude assets/ and scripts/ bodies from profile/capsule content
 * T-12-11: Derived outputs inherit governance from artifact root
 * T-12-12: Keep derivation deterministic and revision-scoped with cached outputs
 */

export type { DerivedArtifactOutputs, PayloadDerivationContext } from './types.js';
export { buildContentHash, buildCapsuleId } from './hash.js';
export {
  getDerivationEligibleFiles,
  getFilesBySource,
  extractDerivationText,
} from './extract-files.js';
export {
  parseFrontmatter,
  extractSections,
  buildSummaryFromText,
  extractKeywords,
  hasStructuredCapsuleSemantics,
} from './parse-content.js';
export { buildClientManifest } from './client-manifest.js';
export { deriveSkillArtifactOutputs, applyDerivedArtifactOutputs } from './legacy.js';
export { deriveFromPayloads } from './from-payloads.js';
export { deriveAndApplyOutputs } from './apply.js';
