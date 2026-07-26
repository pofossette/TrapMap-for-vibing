import type { KnowledgeEntry } from './knowledge.js';
import type { LifecycleState, Scope } from './common.js';
import type { Boundary } from './boundary.js';
import type { EvidenceMeta } from './evidence.js';

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

/** Owner-local source record used by asynchronous indexing projections. */
export interface KnowledgeIndexingEntry {
  id: string;
  teamId: string | null;
  scope: Scope;
  labels: string[];
  shortcut: string;
  detail: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  boundary: Boundary | null;
  updatedAt: string;
  revision: number;
  indexState: Record<string, unknown> | null;
  embeddingCache: {
    textHash: string;
    vector: number[];
    createdAt: string;
    revision: number;
  } | null;
}

export interface KnowledgeIndexingPage {
  entries: KnowledgeIndexingEntry[];
  nextOffset: number | null;
}

export interface KnowledgeOperationsProjection {
  getById(entryId: string): Promise<KnowledgeEntry | null>;
  getIndexingEntry(entryId: string): Promise<KnowledgeIndexingEntry | null>;
  listIndexingEntries(input: { offset: number; limit: number }): Promise<KnowledgeIndexingPage>;
  getByIds(entryIds: string[]): Promise<KnowledgeEntry[]>;
  listByFilter(filter: {
    entryIds?: string[];
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    labels?: string[];
    requiredLevelMax?: number;
    operation?: string;
  }): Promise<KnowledgeEntry[]>;
  updateEmbeddingCache(
    entryId: string,
    cache: {
      textHash: string;
      vector: number[];
      createdAt: string;
      revision: number;
    },
  ): Promise<void>;
  updateIndexMetadata(
    entryId: string,
    metadata: {
      indexState: Record<string, unknown> | null;
      embeddingCache: {
        textHash: string;
        vector: number[];
        createdAt: string;
        revision: number;
      } | null;
    },
  ): Promise<void>;
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
  reviewEvidence(
    entryId: string,
    evidence: EvidenceMeta,
    actorId: string,
  ): Promise<{ entryId: string; evidence: EvidenceMeta }>;
}

export type KnowledgeOwnerPort = KnowledgeCommandPort & KnowledgeOperationsProjection;
