CREATE TABLE IF NOT EXISTS "candidates" ("id" text PRIMARY KEY, "source_type" text NOT NULL, "submitted_by_user_id" text NOT NULL, "team_id" text, "status" text NOT NULL, "original_payload" jsonb NOT NULL, "analysis_snapshot" jsonb, "duplicate_case" jsonb, "received_at" timestamptz NOT NULL, "queued_at" timestamptz, "analyzing_at" timestamptz, "completed_at" timestamptz, "last_error" text, "retry_count" integer NOT NULL DEFAULT 0, "manual_result" jsonb, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_analyses" ("id" text PRIMARY KEY, "candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE, "analysis" jsonb NOT NULL, "duplicate_trace" jsonb, "created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_duplicate_cases" ("id" text PRIMARY KEY, "candidate_id" text NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE, "highest_similarity" real NOT NULL DEFAULT 0, "created_at" timestamptz NOT NULL DEFAULT now());
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_lineage" ("id" text PRIMARY KEY, "candidate_id" text NOT NULL REFERENCES "candidates"("id"), "source_entity_id" text NOT NULL, "target_entity_id" text NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now());
