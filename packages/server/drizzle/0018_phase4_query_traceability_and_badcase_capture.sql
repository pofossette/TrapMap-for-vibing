-- Phase 4: public queryId + durable badcase trace capture

ALTER TABLE "feedback_records"
  ADD COLUMN IF NOT EXISTS "query_id" TEXT,
  ADD COLUMN IF NOT EXISTS "route_family" TEXT,
  ADD COLUMN IF NOT EXISTS "failure_classification" TEXT,
  ADD COLUMN IF NOT EXISTS "expected_correction" TEXT,
  ADD COLUMN IF NOT EXISTS "selected_result_snapshot" JSONB;

CREATE TABLE IF NOT EXISTS "retrieval_badcase_traces" (
  "id" TEXT PRIMARY KEY,
  "feedback_id" TEXT NOT NULL,
  "query_id" TEXT,
  "query_seed" TEXT,
  "route_family" TEXT,
  "entry_id" TEXT NOT NULL,
  "entry_type" TEXT NOT NULL,
  "failure_classification" TEXT,
  "expected_correction" TEXT,
  "selected_result_snapshot" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_retrieval_badcase_query"
ON "retrieval_badcase_traces" ("query_id");

CREATE INDEX IF NOT EXISTS "idx_retrieval_badcase_feedback"
ON "retrieval_badcase_traces" ("feedback_id");

CREATE INDEX IF NOT EXISTS "idx_retrieval_badcase_entry"
ON "retrieval_badcase_traces" ("entry_id", "entry_type");
