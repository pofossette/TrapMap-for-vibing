/**
 * Knowledge module barrel re-export.
 *
 * Re-exports from focused sub-modules:
 *   - actor-ref.ts      – UserLookupContext helpers and toActorRef
 *   - serialization.ts  – toKnowledgeEntry, toKnowledgeListItem, and internal to* converters
 *   - record-mutations.ts – create/resubmit/update/applyReviewDecision
 *   - next-sub-id.ts    – deterministic sub-ID generator
 */

export { toActorRef } from './knowledge/actor-ref.js';
export type { UserLookupContext } from './knowledge/actor-ref.js';
export {
  toKnowledgeEntry,
  toKnowledgeListItem,
} from './knowledge/serialization.js';
export {
  createKnowledgeEntryRecord,
  createKnowledgeRevision,
  resubmitKnowledgeEntry,
  applyReviewDecision,
  updateKnowledgeEntry,
} from './knowledge/record-mutations.js';
export { nextSubId } from './knowledge/next-sub-id.js';
