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
	"query_id" text,
	"route_family" text,
	"failure_classification" text,
	"expected_correction" text,
	"selected_result_snapshot" jsonb,
	"submitted_at" timestamp with time zone NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"submitted_by_handle" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" text,
	"triggered_transition" text,
	"remediation_status" text,
	"remediation_opened_at" timestamp with time zone,
	"remediation_opened_by_user_id" text,
	"remediation_resolved_at" timestamp with time zone,
	"remediation_resolved_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_feedback_records_entry_type" CHECK ("feedback_records"."entry_type" IN ('trap', 'skill')),
	CONSTRAINT "ck_feedback_records_problem_type" CHECK ("feedback_records"."problem_type" IN ('incorrect', 'outdated', 'context-mismatch', 'incomplete', 'other')),
	CONSTRAINT "ck_feedback_records_status" CHECK ("feedback_records"."status" IN ('new', 'triaged', 'resolved', 'dismissed')),
	CONSTRAINT "ck_feedback_records_remediation_status" CHECK ("feedback_records"."remediation_status" IS NULL OR "feedback_records"."remediation_status" IN ('pending-human-review', 'in-remediation', 'ready-to-reindex'))
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" text PRIMARY KEY NOT NULL,
	"query_id" text NOT NULL,
	"team_id" text,
	"account_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"entry_id" text NOT NULL,
	"query_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE INDEX "idx_usage_events_team_created" ON "usage_events" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_events_account_created" ON "usage_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_events_entry_type_created" ON "usage_events" USING btree ("entry_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_events_entry_id_created" ON "usage_events" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_usage_rollup_day_team_entry" ON "usage_events_daily_rollup" USING btree ("day","team_id","entry_type","entry_id");--> statement-breakpoint
CREATE INDEX "idx_usage_rollup_entry_type_day" ON "usage_events_daily_rollup" USING btree ("entry_type","day");--> statement-breakpoint
CREATE INDEX "idx_usage_rollup_entry_id_day" ON "usage_events_daily_rollup" USING btree ("entry_id","day");