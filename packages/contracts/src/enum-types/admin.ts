import { z } from 'zod';

/**
 * Admin panel role vocabulary.
 * Mirrors the session roles used by the Web Panel (`SessionUserRole`)
 * but declared as a shared contract so that server-side RBAC and client
 * consumers share a single source of truth.
 */
export const adminRoleSchema = z.enum(['administrator', 'reviewer', 'read-only-operator']);

export type AdminRole = z.infer<typeof adminRoleSchema>;

/**
 * Risk level filter for review queue.
 * Matches the risk interpretation produced by `calculateReviewQueueRiskScore`
 * in the panel and the server-side computed risk fields.
 */
export const adminReviewRiskLevelSchema = z.enum(['high', 'medium', 'low']);

export type AdminReviewRiskLevel = z.infer<typeof adminReviewRiskLevelSchema>;

/**
 * Sort order for review queue admin listing.
 * - highest-risk: descending computed risk score, then oldest first
 * - longest-waiting: oldest submission first
 * - newest: most recent first
 * - oldest: oldest first (explicit)
 */
export const adminReviewSortSchema = z.enum([
  'highest-risk',
  'longest-waiting',
  'newest',
  'oldest',
]);

export type AdminReviewSort = z.infer<typeof adminReviewSortSchema>;

/**
 * Activity feed type discriminator.
 * Normalized form of `ActivityEventViewModel.typeLabel` via `normalizeActivityType`.
 */
export const adminActivityTypeSchema = z.enum(['decision', 'intervention', 'system-ingestion']);

export type AdminActivityType = z.infer<typeof adminActivityTypeSchema>;

/**
 * Graph mode for artifact/skill graph rendering.
 * - derivation: file-manifest / capsule derivation lineage
 * - semantic: semantic / mitigation mapping edges
 */
export const adminGraphModeSchema = z.enum(['derivation', 'semantic']);

export type AdminGraphMode = z.infer<typeof adminGraphModeSchema>;

/**
 * Trap graph neighborhood depth.
 * Kept as string enum to match `TrapNeighborhoodDepth` in the panel
 * and to survive query-string transport without numeric coercion ambiguity.
 */
export const adminGraphDepthSchema = z.enum(['1', '2', 'all']);

export type AdminGraphDepth = z.infer<typeof adminGraphDepthSchema>;
