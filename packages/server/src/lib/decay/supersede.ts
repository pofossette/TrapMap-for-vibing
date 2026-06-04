/**
 * Supersede service for knowledge lifecycle management.
 *
 * Enables admins to explicitly supersede a knowledge/trap entry with a replacement,
 * creating the supersession relationship required for decay state management.
 */

import type { DecayState } from '@trapmap/contracts';

import { AppError } from '@trapmap/server/lib/errors.js';
import { transitionLifecycleState } from '@trapmap/server/lib/lifecycle/state-machine.js';
import type {
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  SkillShareerStore,
  StoreData,
} from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';

/**
 * Input for the supersedeEntry mutation.
 */
export interface SupersedeInput {
  /** The store instance for ID generation */
  store: SkillShareerStore;
  /** The current store data (passed from transact) */
  data: StoreData;
  /** ID of the entry to supersede */
  entryId: string;
  /** ID of the replacement entry */
  replacementId: string;
  /** ID of the user performing the supersede */
  actorId: string;
}

/**
 * Supersede a knowledge entry with a replacement.
 *
 * This function:
 * 1. Validates both entries exist and are approved
 * 2. Sets supersededById on the old entry's decayMeta
 * 3. Transitions the lifecycle state to `deactivated`
 * 4. Creates a lifecycle event with type 'deactivated'
 * 5. Updates the entry's updatedAt timestamp
 *
 * @throws {AppError} 400 if entryId equals replacementId (self-supersede)
 * @throws {AppError} 404 if entry not found
 * @throws {AppError} 404 if replacement not found
 * @throws {AppError} 400 if entry is not approved
 * @throws {AppError} 400 if replacement is not approved
 */
export function supersedeEntry({
  store,
  data,
  entryId,
  replacementId,
  actorId,
}: SupersedeInput): KnowledgeRecord {
  // Reject self-supersede
  if (entryId === replacementId) {
    throw new AppError(400, 'invalid_supersede', 'Cannot supersede an entry with itself');
  }

  // Find the entry to supersede
  const entry = data.knowledgeEntries.find((candidate) => candidate.id === entryId);
  if (!entry) {
    throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
  }

  // Find the replacement entry
  const replacement = data.knowledgeEntries.find((candidate) => candidate.id === replacementId);
  if (!replacement) {
    throw new AppError(404, 'replacement_not_found', 'Replacement entry not found');
  }

  // Validate entry is approved
  if (entry.lifecycleState !== 'approved') {
    throw new AppError(400, 'invalid_state', 'Only approved entries can be superseded');
  }

  // Validate replacement is approved
  if (replacement.lifecycleState !== 'approved') {
    throw new AppError(400, 'invalid_replacement_state', 'Replacement must be an approved entry');
  }

  // Initialize or update decayMeta
  entry.decayMeta = {
    lastVerifiedAt: entry.decayMeta?.lastVerifiedAt ?? entry.updatedAt,
    decayState: 'superseded' as DecayState,
    supersededById: replacementId,
    decayStateComputedAt: nowIso(),
    freshnessType: entry.decayMeta?.freshnessType ?? 'evergreen',
  };

  // Superseded entries leave the retrieval-visible lifecycle path.
  transitionLifecycleState(entry, 'deactivated', 'knowledge supersede');

  // Create lifecycle event
  const event: KnowledgeLifecycleEventRecord = {
    id: store.nextId(data, 'evt'),
    type: 'deactivated',
    createdAt: nowIso(),
    actorUserId: actorId,
    submissionId: null,
    revision: null,
    state: 'deactivated',
    note: `Superseded by ${replacementId}`,
  };
  entry.lifecycleHistory.push(event);

  // Update timestamp
  entry.updatedAt = nowIso();

  return entry;
}
