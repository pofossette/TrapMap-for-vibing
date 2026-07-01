/**
 * Shared mock factory functions for server-side unit tests.
 *
 * Provides parameterised helpers that create minimal, valid instances of
 * commonly-tested domain objects.  Each factory accepts a `Partial<T>`
 * overrides bag so callers only specify the fields they care about.
 */

import { vi } from 'vitest';

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';

// ---------------------------------------------------------------------------
// createMockEntry
// ---------------------------------------------------------------------------

/**
 * Create a complete `KnowledgeRecord` with sensible defaults.
 *
 * Every field required by the interface is populated, so the returned object
 * is structurally valid without any casts.  Callers pass `Partial<KnowledgeRecord>`
 * to override only the fields relevant to their test.
 */
export function createMockEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  const id = overrides.id ?? 'entry-1';
  const now = nowIso();
  const shortcut = overrides.shortcut ?? 'Test shortcut';
  const detail = overrides.detail ?? 'Test detail';
  const labels = overrides.labels ?? ['test'];

  return {
    id,
    teamId: null,
    scope: 'global',
    labels,
    shortcut,
    detail,
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId: 'user-1',
      shortcut,
      detail,
      labels,
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt: now,
        submittedByUserId: 'user-1',
        shortcut,
        detail,
        labels,
        reviewNotes: [],
      },
    ],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createMockChat
// ---------------------------------------------------------------------------

/**
 * Create a minimal `ChatProvider` mock.
 *
 * By default `invoke` resolves to a JSON string with a generic success
 * payload.  Tests that need specific LLM responses should override `invoke`
 * via the overrides bag.
 */
export function createMockChat(overrides: Partial<ChatProvider> = {}): ChatProvider {
  return {
    provider: 'mock',
    isConfigured: true,
    invoke: vi.fn().mockResolvedValue('{}'),
    ...overrides,
  };
}
