ALTER TABLE "audit_events"
  ADD COLUMN IF NOT EXISTS "event_version" integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "source_service" text NOT NULL DEFAULT 'server-compatibility-seam',
  ADD COLUMN IF NOT EXISTS "request_id" text,
  ADD COLUMN IF NOT EXISTS "trace_id" text,
  ADD COLUMN IF NOT EXISTS "operation_id" text,
  ADD COLUMN IF NOT EXISTS "causation_id" text,
  ADD COLUMN IF NOT EXISTS "outcome" text NOT NULL DEFAULT 'success';

CREATE INDEX IF NOT EXISTS "audit_events_request_id_idx" ON "audit_events" ("request_id");
CREATE INDEX IF NOT EXISTS "audit_events_trace_id_idx" ON "audit_events" ("trace_id");
CREATE INDEX IF NOT EXISTS "audit_events_operation_id_idx" ON "audit_events" ("operation_id");
CREATE INDEX IF NOT EXISTS "audit_events_causation_id_idx" ON "audit_events" ("causation_id");
