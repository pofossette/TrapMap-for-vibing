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
 * - resolution.ts : POST /v1/candidates/:candidateId/manual-result, POST .../apply-resolution
 * - duplicates.ts : GET /v1/duplicates, GET /v1/duplicates/:candidateId, GET .../bundle
 */

export { candidateRoutes } from './candidates/index.js';
