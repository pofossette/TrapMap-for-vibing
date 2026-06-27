/**
 * Candidate routes compatibility barrel.
 *
 * Re-exports the candidate routes plugin from the focused sub-modules
 * under ./candidates/. External consumers continue to import from this
 * path unchanged.
 *
 * Sub-modules:
 * - submit.ts     : POST /v1/candidates
 * - query.ts      : GET /v1/candidates, GET /v1/candidates/:candidateId
 * - duplicates.ts : GET /v1/duplicates, GET /v1/duplicates/:candidateId, GET .../bundle
 */

export { candidateRoutes } from './candidates/index.js';
