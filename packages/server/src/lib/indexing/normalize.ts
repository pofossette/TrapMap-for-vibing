/**
 * Normalization module for knowledge entry indexing.
 *
 * This module provides:
 * - Deterministic canonical text generation from shortcut, detail, and labels
 * - Normalized token generation (lowercase, deduplicated)
 * - Content hash computation for change detection
 *
 * Security note: This module operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling normalize.
 */

import { createHash } from 'node:crypto';

import { tokenize } from '../retrieval/recall/keyword.js';
import type { KnowledgeRecord } from '../store.js';
import type { NormalizedIndexDocument } from './types.js';

/**
 * Build canonical text for indexing from a knowledge entry.
 * Uses shortcut, detail, and labels - same as buildEmbeddingText.
 *
 * This ensures both vector and keyword channels use the same source text.
 */
function buildCanonicalText(entry: KnowledgeRecord): string {
  const labelsText = entry.labels.join(' ');
  return `${entry.shortcut}\n${entry.detail}\n${labelsText}`.trim();
}

/**
 * Generate normalized tokens from canonical text.
 * Reuses the keyword recall tokenizer for consistency.
 */
function buildTokens(canonicalText: string): string[] {
  return tokenize(canonicalText);
}

/**
 * Generate SHA-256 content hash from canonical text.
 * Used for change detection and idempotency.
 */
function buildContentHash(canonicalText: string): string {
  return createHash('sha256').update(canonicalText).digest('hex');
}

/**
 * Normalize a knowledge entry into a canonical index document.
 *
 * This function:
 * - Produces deterministic output for equivalent input
 * - Includes shortcut, detail, and labels in canonical text
 * - Generates normalized tokens (lowercase, deduplicated)
 * - Computes SHA-256 content hash for change detection
 *
 * @param entry - The knowledge entry to normalize
 * @returns A normalized index document suitable for all adapters
 */
export function normalizeKnowledgeIndexDocument(entry: KnowledgeRecord): NormalizedIndexDocument {
  const canonicalText = buildCanonicalText(entry);
  const tokens = buildTokens(canonicalText);
  const contentHash = buildContentHash(canonicalText);
  const normalizedAt = new Date().toISOString();

  return {
    entryId: entry.id,
    teamId: entry.teamId,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    lifecycleState: entry.lifecycleState,
    revision: entry.history.length,
    updatedAt: entry.updatedAt,
    shortcut: entry.shortcut,
    detail: entry.detail,
    labels: entry.labels,
    canonicalText,
    tokens,
    contentHash,
    normalizedAt,
    boundary: entry.boundary, // Include boundary for indexing
  };
}
