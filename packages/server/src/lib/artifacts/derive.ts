/**
 * Deterministic derivation module for skill artifact outputs.
 *
 * This barrel re-exports from focused sub-modules in ./derive/.
 *
 * Sub-modules:
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

export type { DerivedArtifactOutputs, PayloadDerivationContext } from './derive/types.js';
export { buildContentHash, buildCapsuleId } from './derive/hash.js';
export {
  getDerivationEligibleFiles,
  getFilesBySource,
  extractDerivationText,
} from './derive/extract-files.js';
export {
  parseFrontmatter,
  extractSections,
  buildSummaryFromText,
  extractKeywords,
  hasStructuredCapsuleSemantics,
} from './derive/parse-content.js';
export { buildClientManifest } from './derive/client-manifest.js';
export { deriveSkillArtifactOutputs, applyDerivedArtifactOutputs } from './derive/legacy.js';
export { deriveFromPayloads } from './derive/from-payloads.js';
