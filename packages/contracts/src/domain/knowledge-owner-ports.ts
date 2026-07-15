import type { LifecycleState } from './common.js';

/**
 * Compatibility input accepted by the knowledge-write owner.
 *
 * Transport adapters authenticate the actor before invoking this port; callers
 * must not derive authority from an actor field supplied by an untrusted body.
 */
export interface KnowledgeOwnerCommandInput {
  actorId: string;
  [key: string]: unknown;
}

export interface KnowledgeOwnerRecord {
  id: string;
  ownerUserId: string;
  teamId: string | null;
  lifecycleState: LifecycleState;
  [key: string]: unknown;
}

export interface KnowledgeOperationsProjection {
  getById(entryId: string): Promise<KnowledgeOwnerRecord | null>;
  getByIds(entryIds: string[]): Promise<KnowledgeOwnerRecord[]>;
  listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    labels?: string[];
  }): Promise<KnowledgeOwnerRecord[]>;
}

export interface KnowledgeCommandPort {
  submit(input: KnowledgeOwnerCommandInput): Promise<{ entryId: string }>;
  updateEntry(entryId: string, updates: Record<string, unknown>, actorId: string): Promise<void>;
  resubmit(entryId: string, updates: Record<string, unknown>, actorId: string): Promise<void>;
  supersede(entryId: string, replacementId: string, actorId: string): Promise<void>;
  createTrap(input: KnowledgeOwnerCommandInput): Promise<{ trapId: string }>;
  approveReviewDecision(input: KnowledgeOwnerCommandInput): Promise<{
    entryId: string;
    lifecycleState: 'approved';
  }>;
  rejectReviewDecision(input: KnowledgeOwnerCommandInput): Promise<{
    entryId: string;
    lifecycleState: 'rejected';
  }>;
  applyMaintenanceDecision(input: KnowledgeOwnerCommandInput): Promise<{
    entryId: string;
    action: string;
  }>;
  applyDecayDecision(
    input: KnowledgeOwnerCommandInput,
  ): Promise<{ entryId: string; action: string }>;
}

export type KnowledgeOwnerPort = KnowledgeCommandPort & KnowledgeOperationsProjection;
