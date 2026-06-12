-- Phase 0: atomic delivery and crash-recovery leases
-- Goal:
--   1. Add reclaimable lease metadata to task_queue and domain_event_outbox
--   2. Add lease-oriented indexes for stuck work recovery

ALTER TABLE "task_queue"
  ADD COLUMN IF NOT EXISTS "worker_id" TEXT,
  ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "heartbeat_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lease_until" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "task_queue_running_lease_idx"
ON "task_queue" ("type", "lease_until", "updated_at")
WHERE "status" = 'running';

ALTER TABLE "domain_event_outbox"
  ADD COLUMN IF NOT EXISTS "worker_id" TEXT,
  ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "heartbeat_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lease_until" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "domain_event_outbox_processing_lease_idx"
ON "domain_event_outbox" ("event_name", "lease_until", "created_at")
WHERE "status" = 'processing';
