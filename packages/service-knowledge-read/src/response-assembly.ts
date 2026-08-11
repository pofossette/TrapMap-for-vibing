/**
 * Response assembly module for retrieval results.
 *
 * Pure assembly rules (match reasons, bucket assignment, response
 * construction) are owned by the knowledge-read domain layer; this module
 * re-exports them for the service surface.
 */

export {
  assembleResponseBuckets,
  buildEmptyResponse,
  buildRetrievalResponse,
  toRetrievalMatch,
} from '@trapmap/backend-core';
