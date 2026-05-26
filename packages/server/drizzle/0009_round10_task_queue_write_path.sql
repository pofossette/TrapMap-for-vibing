-- Round 10: Task Queue Write Path - Phase 1
-- Goal: Make candidate ingestion route through durable PG queue
--
-- Changes:
--   1. Add dedupe_key column to prevent duplicate task registration
--   2. Replace generic index with dequeue-optimized partial index
--   3. Add unique partial index for deduplication guard
--
-- Rollback: DROP INDEX + DROP COLUMN + recreate old index

-- =============================================================================
-- 1. Add dedupe_key column (nullable — only used when deduplication is needed)
-- =============================================================================
ALTER TABLE "task_queue" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;

-- =============================================================================
-- 2. Drop old non-optimized index
-- =============================================================================
DROP INDEX IF EXISTS "task_queue_type_status_priority_idx";

-- =============================================================================
-- 3. Create dequeue-optimized partial index
--    Matches the actual dequeue query predicate:
--      WHERE type = $1 AND status = 'pending' AND process_after <= NOW()
--      ORDER BY priority DESC, created_at ASC
-- =============================================================================
CREATE INDEX IF NOT EXISTS "task_queue_pending_dequeue_idx"
ON "task_queue" ("type", "process_after", "priority" DESC, "created_at" ASC)
WHERE "status" = 'pending';

-- =============================================================================
-- 4. Deduplication guard: prevent same (type, dedupe_key) from being enqueued
--    when a pending or running task already exists
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "task_queue_dedupe_pending_idx"
ON "task_queue" ("type", "dedupe_key")
WHERE "status" IN ('pending', 'running');
