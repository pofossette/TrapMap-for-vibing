CREATE TABLE "feedback_custom_answers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "feedback_custom_answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"feedback_id" text NOT NULL,
	"question_key" text NOT NULL,
	"answer_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_records" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"problem_type" text NOT NULL,
	"description" text NOT NULL,
	"context" text,
	"query_seed" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"submitted_by_handle" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"triggered_transition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_feedback_records_entry_type" CHECK ("feedback_records"."entry_type" IN ('trap', 'skill')),
	CONSTRAINT "ck_feedback_records_problem_type" CHECK ("feedback_records"."problem_type" IN ('incorrect', 'outdated', 'context-mismatch', 'incomplete', 'other')),
	CONSTRAINT "ck_feedback_records_status" CHECK ("feedback_records"."status" IN ('new', 'triaged', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE TABLE "usage_events_daily_rollup" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usage_events_daily_rollup_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"day" timestamp with time zone NOT NULL,
	"team_id" text,
	"entry_type" text NOT NULL,
	"entry_id" text NOT NULL,
	"hit_count" integer NOT NULL,
	"unique_queries" integer NOT NULL,
	"unique_accounts" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_feedback_custom_answers_feedback" ON "feedback_custom_answers" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX "idx_feedback_records_entry" ON "feedback_records" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_feedback_records_entry_type" ON "feedback_records" USING btree ("entry_type");--> statement-breakpoint
CREATE INDEX "idx_feedback_records_status" ON "feedback_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_feedback_records_problem_type" ON "feedback_records" USING btree ("problem_type");--> statement-breakpoint
CREATE INDEX "idx_feedback_records_submitted_by" ON "feedback_records" USING btree ("submitted_by_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_usage_rollup_day_team_entry" ON "usage_events_daily_rollup" USING btree ("day","team_id","entry_type","entry_id");--> statement-breakpoint
CREATE INDEX "idx_usage_rollup_entry_type_day" ON "usage_events_daily_rollup" USING btree ("entry_type","day");--> statement-breakpoint
CREATE INDEX "idx_usage_rollup_entry_id_day" ON "usage_events_daily_rollup" USING btree ("entry_id","day");
--> statement-breakpoint

-- =============================================================================
-- Backfill: feedback_records from store_snapshot JSONB
-- =============================================================================

INSERT INTO feedback_records (
  id, entry_id, entry_type, problem_type, description,
  context, query_seed, submitted_at, submitted_by_user_id,
  submitted_by_handle, status, admin_notes, resolved_at,
  resolved_by_user_id, triggered_transition, created_at, updated_at
)
SELECT
  elem->>'id',
  elem->>'entryId',
  elem->>'entryType',
  elem->>'problemType',
  elem->>'description',
  elem->>'context',
  elem->>'querySeed',
  (elem->>'submittedAt')::timestamptz,
  elem->>'submittedByUserId',
  elem->>'submittedByHandle',
  COALESCE(elem->>'status', 'new'),
  elem->>'adminNotes',
  CASE WHEN elem->>'resolvedAt' IS NOT NULL
    THEN (elem->>'resolvedAt')::timestamptz
    ELSE NULL
  END,
  elem->>'resolvedByUserId',
  elem->>'triggeredTransition',
  COALESCE((elem->>'createdAt')::timestamptz, now()),
  COALESCE((elem->>'updatedAt')::timestamptz, now())
FROM store_snapshot,
  jsonb_array_elements(data->'feedbackQueue') AS elem
WHERE data->'feedbackQueue' IS NOT NULL
  AND jsonb_array_length(data->'feedbackQueue') > 0
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- =============================================================================
-- Backfill: feedback_custom_answers from nested arrays
-- =============================================================================

INSERT INTO feedback_custom_answers (feedback_id, question_key, answer_text)
SELECT
  elem->>'id',
  ans->>'prompt',
  ans->>'answer'
FROM store_snapshot,
  jsonb_array_elements(data->'feedbackQueue') AS elem,
  jsonb_array_elements(elem->'customAnswers') AS ans
WHERE data->'feedbackQueue' IS NOT NULL
  AND elem->'customAnswers' IS NOT NULL
  AND jsonb_array_length(elem->'customAnswers') > 0;
--> statement-breakpoint

-- =============================================================================
-- Backfill: usage_events_daily_rollup from existing usage_events
-- =============================================================================

INSERT INTO usage_events_daily_rollup (day, team_id, entry_type, entry_id, hit_count, unique_queries, unique_accounts)
SELECT
  date_trunc('day', created_at) AS day,
  team_id,
  entry_type,
  entry_id,
  COUNT(*) AS hit_count,
  COUNT(DISTINCT query_id) AS unique_queries,
  COUNT(DISTINCT account_id) AS unique_accounts
FROM usage_events
GROUP BY date_trunc('day', created_at), team_id, entry_type, entry_id
ON CONFLICT DO NOTHING;