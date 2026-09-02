/**
 * Admin-specific schemas for system administration / Web Panel.
 *
 * Shared Zod contracts for the Admin surface so that later T6/T7 can build
 * `create<X>RouteDefs` factories without inventing ad-hoc schemas. All query
 * schemas are `strict` and use shared primitives (`entityIdSchema`,
 * `isoTimestampSchema`, `labelSchema`, `scopeSchema`, `securityLevelSchema`,
 * `lifecycleStateSchema`) from `common.ts` plus `admin`-specific enums
 * from `enum-types/admin.ts`.
 *
 * Pagination shape is kept consistent with the existing review-queue
 * contract: `{ items, filteredTotal, total, nextCursor }`.  Where the
 * panel historically uses a domain-specific collection name (`events` for the
 * activity feed) we expose both the canonical `items` shape and the
 * panel-compatible alias.
 */

import { z } from 'zod';

import {
  adminActivityTypeSchema,
  adminGraphDepthSchema,
  adminGraphModeSchema,
  adminReviewRiskLevelSchema,
  adminReviewSortSchema,
} from '../enum-types/admin.js';
import { skillArtifactSchema } from './artifacts.js';
import { boundarySchema } from './boundary.js';
import {
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  lifecycleStateSchema,
  scopeSchema,
} from './common.js';
import { reviewQueueItemSchema } from './review.js';

// ============================================================================
// Legacy admin boundary search (pre-existing, preserved for backward compat)
// ============================================================================

/**
 * Query schema for admin boundary search.
 *
 * Allows searching knowledge entries by boundary constraints:
 * - context: Situational context label (e.g., 'production', 'frontend')
 * - platform: Platform constraint (e.g., 'linux', 'windows')
 * - package: Package name constraint (e.g., 'react', 'typescript')
 */
export const adminBoundarySearchQuerySchema = z
  .object({
    /** Context label to match (e.g., 'production', 'frontend') */
    context: z.string().min(1).max(64).optional(),
    /** Platform to match (e.g., 'linux', 'windows') */
    platform: z.string().min(1).max(64).optional(),
    /** Package name to match (e.g., 'react', 'typescript') */
    package: z.string().min(1).max(128).optional(),
    /** Maximum results to return */
    maxResults: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

/**
 * Match result for admin boundary search.
 *
 * Contains a summary of a knowledge entry that matched the search criteria,
 * including its boundary information for inspection.
 */
export const adminBoundarySearchMatchSchema = z.object({
  entryId: entityIdSchema,
  scope: scopeSchema,
  shortcut: z.string().min(1),
  detail: z.string().min(1),
  labels: z.array(labelSchema),
  /** The entry's boundary (if any) */
  boundary: boundarySchema.nullable(),
});

/**
 * Response schema for admin boundary search.
 */
export const adminBoundarySearchResponseSchema = z
  .object({
    matches: z.array(adminBoundarySearchMatchSchema),
    query: adminBoundarySearchQuerySchema,
  })
  .strict();

export type AdminBoundarySearchQuery = z.infer<typeof adminBoundarySearchQuerySchema>;
export type AdminBoundarySearchMatch = z.infer<typeof adminBoundarySearchMatchSchema>;
export type AdminBoundarySearchResponse = z.infer<typeof adminBoundarySearchResponseSchema>;

// ============================================================================
// Admin Review Queue — Web Panel `loadPendingReviews` / `GET /v1/knowledge/review-queue`
// ============================================================================

/**
 * Query schema for the admin review-queue listing.
 *
 * Mirrors the query built by `apps/web-panel/src/services/api/admin-panel-api.ts`
 * `buildReviewQueueQuery` and the mock `applyReviewQueueQuery` helper:
 *   status, search, source, riskLevel, sort, cursor, limit
 *
 * All fields are optional except `sort`/`limit` which carry panel-compatible
 * defaults. `riskLevel` and `sort` reuse the admin-specific enums so that
 * the server and panel share a single validation vocabulary.
 */
export const adminReviewQueueQuerySchema = z
  .object({
    /** Free-text filter applied to shortcut / detail / id (trimmed). */
    search: z.string().trim().min(1).max(200).optional(),
    /** Source / ingestion channel filter (e.g. `candidate-ingestion`). */
    source: z.string().trim().min(1).max(128).optional(),
    /** Computed risk bucket from `calculateReviewQueueRiskScore`. */
    riskLevel: adminReviewRiskLevelSchema.optional(),
    /** Sort order — defaults to `highest-risk` for parity with panel. */
    sort: adminReviewSortSchema.default('highest-risk'),
    /** Opaque offset cursor (numeric string `^[0-9]{1,128}$`). */
    cursor: z.string().min(1).max(128).optional(),
    /** Page size — coerced from query string, bounded 1..100. */
    limit: z.coerce.number().int().min(1).max(100).default(25),
    /** Optional lifecycle filter (e.g. `submitted`). */
    status: lifecycleStateSchema.optional(),
    /** Optional team scoping (when panel is team-scoped). */
    teamId: entityIdSchema.optional(),
  })
  .strict();

/**
 * Paginated response for the admin review queue.
 * Mirrors `reviewQueueResponseSchema` pagination shape.
 */
export const adminReviewQueueResponseSchema = z
  .object({
    items: z.array(reviewQueueItemSchema),
    nextCursor: z.string().min(1).max(128).nullable(),
    filteredTotal: z.number().int().min(0),
    total: z.number().int().min(0),
  })
  .strict();

export type AdminReviewQueueQuery = z.infer<typeof adminReviewQueueQuerySchema>;
export type AdminReviewQueueResponse = z.infer<typeof adminReviewQueueResponseSchema>;

// ============================================================================
// Admin Activity Feed — `GET /api/admin/activity`
// ============================================================================

/**
 * Single activity event as rendered by the panel.
 * Subset of `auditEventSchema` / `ActivityEventViewModel` kept intentionally
 * permissive for forward-compatible display (tone is optional).
 */
export const adminActivityEventSchema = z
  .object({
    id: entityIdSchema,
    actor: z.string().min(1).max(64),
    title: z.string().min(1).max(280),
    description: z.string().min(1).max(2000),
    timestamp: isoTimestampSchema,
    typeLabel: z.string().min(1).max(64),
    relatedReviewId: entityIdSchema.nullable().default(null),
    tone: z.enum(['danger', 'success', 'warning']).optional(),
  })
  .strict();

/**
 * Query schema for the admin activity feed.
 *
 * Built by `buildActivityQuery` and consumed by `applyActivityFeedQuery`:
 *   actor, type, search, from, to, cursor, limit
 *
 * Time-range fields `from`/`to` are ISO-8601 with offset and are validated
 * to be chronological when both are present.
 */
export const adminActivityQuerySchema = z
  .object({
    /** Actor handle substring filter (trimmed, case-insensitive on server). */
    actor: z.string().trim().min(1).max(64).optional(),
    /** Normalized activity type (see `adminActivityTypeSchema`). */
    type: adminActivityTypeSchema.optional(),
    /** Free-text filter over title / actor / description. */
    search: z.string().trim().min(1).max(200).optional(),
    /** Inclusive lower bound for `timestamp` (ISO-8601, offset required). */
    from: isoTimestampSchema.optional(),
    /** Inclusive upper bound for `timestamp` (ISO-8601, offset required). */
    to: isoTimestampSchema.optional(),
    /** Opaque offset cursor (`^[0-9]{1,128}$`). */
    cursor: z.string().min(1).max(128).optional(),
    /** Page size — coerced from query string, bounded 1..100. */
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({
        code: 'custom',
        message: '`from` must be <= `to`',
        path: ['from'],
      });
    }
  });

/**
 * Canonical paginated response for the admin activity feed (items shape).
 * Mirrors `{ items, filteredTotal, total, nextCursor }` pagination.
 */
export const adminActivityResponseSchema = z
  .object({
    items: z.array(adminActivityEventSchema),
    filteredTotal: z.number().int().min(0),
    total: z.number().int().min(0),
    nextCursor: z.string().min(1).max(128).nullable(),
  })
  .strict();

/**
 * Panel-compatible alias for the activity feed (`events` instead of `items`).
 * The wire payload from `GET /api/admin/activity` uses `events`; the server
 * may return either `items` or `events` — handlers normalize to `events` when
 * serializing for the panel. Both schemas are provided so route handlers
 * and client mappers can pick the shape they need without inventing a new
 * contract.
 */
export const adminActivityFeedResponseSchema = z
  .object({
    events: z.array(adminActivityEventSchema),
    filteredTotal: z.number().int().min(0),
    total: z.number().int().min(0),
    nextCursor: z.string().min(1).max(128).nullable(),
  })
  .strict();

export type AdminActivityEvent = z.infer<typeof adminActivityEventSchema>;
export type AdminActivityQuery = z.infer<typeof adminActivityQuerySchema>;
export type AdminActivityResponse = z.infer<typeof adminActivityResponseSchema>;
export type AdminActivityFeedResponse = z.infer<typeof adminActivityFeedResponseSchema>;

// ============================================================================
// Admin Artifacts — `GET /api/admin/artifacts`
// ============================================================================

/**
 * Query schema for the admin artifact listing.
 *
 * Built by `buildArtifactQuery` / `applyArtifactQuery`:
 *   cursor, lifecycleState / lifecycle, scope, requiredLevel / level, search, limit
 *
 * Both the canonical names (`lifecycleState`, `requiredLevel`) and the task-
 * described aliases (`lifecycle`, `level`) are accepted so that early T6/T7
 * RouteDef stubs and the panel's existing `ArtifactQuery` shape (which uses
 * `requiredLevel` + `lifecycleState`) validate against the same contract
 * without a breaking alias migration.
 */
export const adminArtifactQuerySchema = z
  .object({
    /** Free-text filter over id / title / slug / labels. */
    search: z.string().trim().min(1).max(200).optional(),
    /** Canonical lifecycle filter (panel query param). */
    lifecycleState: lifecycleStateSchema.optional(),
    /** Alias for `lifecycleState` (task-described name). */
    lifecycle: lifecycleStateSchema.optional(),
    /** Governance scope filter. */
    scope: scopeSchema.optional(),
    /** Canonical requiredLevel filter (0..10). Coerced from query string. */
    requiredLevel: z.coerce.number().int().min(0).max(10).optional(),
    /** Alias for `requiredLevel` (task-described name `level`). Coerced from query string. */
    level: z.coerce.number().int().min(0).max(10).optional(),
    /** Opaque offset cursor. */
    cursor: z.string().min(1).max(128).optional(),
    /** Page size — coerced, bounded 1..100, defaults to 20 (panel default). */
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    // If both aliases are present they must agree — avoids ambiguous filtering.
    if (
      value.lifecycle !== undefined &&
      value.lifecycleState !== undefined &&
      value.lifecycle !== value.lifecycleState
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '`lifecycle` and `lifecycleState` must match when both are provided',
        path: ['lifecycle'],
      });
    }
    if (
      value.level !== undefined &&
      value.requiredLevel !== undefined &&
      value.level !== value.requiredLevel
    ) {
      ctx.addIssue({
        code: 'custom',
        message: '`level` and `requiredLevel` must match when both are provided',
        path: ['level'],
      });
    }
  });

/**
 * Paginated response for admin artifact listing.
 * Reuses `skillArtifactSchema` for items so that T6/T7 RouteDefs can
 * return the canonical artifact aggregate without a DTO split.
 */
export const adminArtifactResponseSchema = z
  .object({
    items: z.array(skillArtifactSchema),
    filteredTotal: z.number().int().min(0),
    total: z.number().int().min(0),
    nextCursor: z.string().min(1).max(128).nullable(),
  })
  .strict();

/** Panel-compatible alias — `GET /api/admin/artifacts` returns the same shape. */
export const adminArtifactListResponseSchema = adminArtifactResponseSchema;

export type AdminArtifactQuery = z.infer<typeof adminArtifactQuerySchema>;
export type AdminArtifactResponse = z.infer<typeof adminArtifactResponseSchema>;
export type AdminArtifactListResponse = z.infer<typeof adminArtifactListResponseSchema>;

// ============================================================================
// Admin Graph — `GET /api/admin/graphs/trap` & `GET /api/admin/graphs/skill/:id`
// ============================================================================

/**
 * Graph node shape returned by admin graph endpoints.
 * Kept permissive (passthrough for extra display fields like `severity`,
 * `scope`, `requiredLevel`) but requires the minimal identity triple
 * `(id, label, kind)` that the G6 components rely on.
 */
export const adminGraphNodeSchema = z
  .object({
    id: entityIdSchema,
    label: z.string().min(1).max(280),
    kind: z.string().min(1).max(64),
  })
  .passthrough();

/**
 * Graph edge shape returned by admin graph endpoints.
 */
export const adminGraphEdgeSchema = z
  .object({
    id: entityIdSchema,
    source: entityIdSchema,
    target: entityIdSchema,
    label: z.string().max(280).optional(),
    kind: z.string().max(64).optional(),
  })
  .passthrough();

/**
 * Query schema for admin graph endpoints.
 *
 * - `depth`: trap-graph neighborhood depth (`1`/`2`/`all`)
 * - `search`: free-text node filter (mirrors `applyArtifactQuery` style)
 * - `mode`: skill-graph derivation vs semantic view
 * - `artifactId`: when set, scoped to a single artifact's skill graph
 * - `cursor`/`limit`: optional pagination for large graphs (forward-compatible)
 */
export const adminGraphQuerySchema = z
  .object({
    /** Neighborhood depth for trap graph (`1`, `2`, or `all`). Defaults to `1`. */
    depth: adminGraphDepthSchema.optional().default('1'),
    /** Free-text filter over node labels / ids. */
    search: z.string().trim().min(1).max(200).optional(),
    /** Skill graph mode — `derivation` (file lineage) or `semantic` (mitigation mapping). */
    mode: adminGraphModeSchema.optional().default('derivation'),
    /** When set, scopes the graph to a single skill artifact. */
    artifactId: entityIdSchema.optional(),
    /** Optional offset cursor for paginated large-graph fetches. */
    cursor: z.string().min(1).max(128).optional(),
    /** Optional page size for paginated graph fetches. */
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

/**
 * Response schema for admin graph endpoints.
 * Matches `GraphDataResponse` (`{ nodes, edges }`) from the panel.
 */
export const adminGraphResponseSchema = z
  .object({
    nodes: z.array(adminGraphNodeSchema),
    edges: z.array(adminGraphEdgeSchema),
  })
  .strict();

export type AdminGraphNode = z.infer<typeof adminGraphNodeSchema>;
export type AdminGraphEdge = z.infer<typeof adminGraphEdgeSchema>;
export type AdminGraphQuery = z.infer<typeof adminGraphQuerySchema>;
export type AdminGraphResponse = z.infer<typeof adminGraphResponseSchema>;
// ============================================================================
// Admin Runtime Overview — `GET /api/admin/runtime-overview`
// ============================================================================

/**
 * Health status for a single runtime service as exposed by the panel.
 * Mirrors `RuntimeServiceHealth` in `apps/web-panel/src/shared/enum-types/runtime.ts`.
 */
export const adminRuntimeServiceHealthSchema = z.enum(['healthy', 'degraded', 'failed']);

/**
 * Status for a single runtime service.
 */
export const adminRuntimeServiceStatusSchema = z
  .object({
    detail: z.string().min(1).max(500),
    lastCheckedAt: isoTimestampSchema,
    name: z.string().min(1).max(64),
    status: adminRuntimeServiceHealthSchema,
    version: z.string().min(1).max(64),
  })
  .strict();

/**
 * Queue/workload metric for runtime overview.
 */
export const adminRuntimeQueueMetricSchema = z
  .object({
    label: z.string().min(1).max(64),
    value: z.number().min(0),
  })
  .strict();

/**
 * Response schema for `GET /api/admin/runtime-overview`.
 * Mirrors `RuntimeOverviewResponse` from the panel; all fields are required
 * and use shared primitives where applicable.
 */
export const adminRuntimeOverviewResponseSchema = z
  .object({
    buildId: z.string().min(1).max(128),
    deploymentProfile: z.string().min(1).max(64),
    failedJobsCount: z.number().int().min(0),
    incidents: z.array(z.string().min(1).max(500)),
    lastHealthCheckAt: isoTimestampSchema,
    pendingReviewCount: z.number().int().min(0),
    services: z.array(adminRuntimeServiceStatusSchema),
    throughputPerHour: z.number().min(0),
    workload: z.array(adminRuntimeQueueMetricSchema),
  })
  .strict();

export type AdminRuntimeServiceHealth = z.infer<typeof adminRuntimeServiceHealthSchema>;
export type AdminRuntimeServiceStatus = z.infer<typeof adminRuntimeServiceStatusSchema>;
export type AdminRuntimeQueueMetric = z.infer<typeof adminRuntimeQueueMetricSchema>;
export type AdminRuntimeOverviewResponse = z.infer<typeof adminRuntimeOverviewResponseSchema>;

// ============================================================================
// Admin Manual JSON Edit — `POST /api/admin/reviews/:id/json-edits`
// ============================================================================

/**
 * Request schema for manual JSON edits of a review entry.
 * Path param `id` is the review/entry id; body carries the edited payload
 * plus rationale. `filePath` is optional and defaults to `entry/review-payload.json`
 * on the server when omitted.
 */
export const adminManualJsonEditRequestSchema = z
  .object({
    params: z.object({ id: entityIdSchema }),
    query: z.object({}).strict(),
    headers: z.record(z.string(), z.unknown()).optional(),
    body: z
      .object({
        filePath: z.string().min(1).max(500).optional(),
        payload: z.unknown(),
        rationale: z.string().trim().min(1).max(2000),
        reviewId: entityIdSchema.optional(),
      })
      .strict()
      .superRefine((value, ctx) => {
        if (value.payload === undefined) {
          ctx.addIssue({ code: 'custom', message: 'payload is required', path: ['payload'] });
        }
      }),
  })
  .strict();

/**
 * Response schema for manual JSON edit — returns the server timestamp of the save.
 */
export const adminManualJsonEditResponseSchema = z
  .object({
    savedAt: isoTimestampSchema,
  })
  .strict();

export type AdminManualJsonEditRequest = z.infer<typeof adminManualJsonEditRequestSchema>;
export type AdminManualJsonEditResponse = z.infer<typeof adminManualJsonEditResponseSchema>;
