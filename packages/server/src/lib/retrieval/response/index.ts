/**
 * Retrieval response barrel.
 *
 * Re-exports the public API for assembling, citing, summarising,
 * and refining retrieval responses (v1 and v2).
 */

// Response assembly (v1 + v2)
export {
  toRetrievalMatch,
  assembleResponseBuckets,
  buildRetrievalResponse,
  buildEmptyResponse,
  buildCapsuleMatch,
  buildProfileHint,
  buildV2RetrievalResponse,
  buildEmptyV2Response,
  buildReadNextHint,
  buildAssetHint,
  buildScriptHint,
  buildCapsuleActivationHints,
  buildAllActivationHints,
} from './assembly.js';

// Citations
export { buildCitation, buildCitations } from './citations.js';

// Refinement
export {
  isRefinementAvailable,
  buildRefinementPrompt,
  generateRefinement,
} from './refinement.js';

// Summary (v1 + v2)
export { buildSummary, buildCapsuleSummary, buildCapsuleCitations } from './summary.js';
