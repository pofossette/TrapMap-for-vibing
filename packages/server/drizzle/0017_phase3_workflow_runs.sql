-- Phase 3: durable workflow run snapshots

CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "run_id" TEXT PRIMARY KEY,
  "workflow_type" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "step_name" TEXT,
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "stats" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "workflow_runs_type_subject_idx"
ON "workflow_runs" ("workflow_type", "subject_id");

CREATE INDEX IF NOT EXISTS "workflow_runs_status_updated_idx"
ON "workflow_runs" ("status", "updated_at");
