-- Round 10: Lifecycle Outbox - Phase 2
-- Goal: Move lifecycle side effects to outbox-driven projections
--
-- Changes:
--   1. Create domain_event_outbox table for async event processing
--   2. Add pending event index for efficient polling
--
-- Rollback: DROP TABLE domain_event_outbox

-- =============================================================================
-- 1. Create domain event outbox table
-- =============================================================================
CREATE TABLE IF NOT EXISTS "domain_event_outbox" (
  "id" TEXT PRIMARY KEY,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "event_name" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "available_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "published_at" TIMESTAMPTZ
);

-- =============================================================================
-- 2. Index for efficient pending event polling
--    Matches the claim query predicate:
--      WHERE status = 'pending' AND available_at <= NOW()
--      ORDER BY event_name, created_at ASC
-- =============================================================================
CREATE INDEX IF NOT EXISTS "domain_event_outbox_pending_idx"
ON "domain_event_outbox" ("event_name", "available_at", "created_at")
WHERE "status" = 'pending';
