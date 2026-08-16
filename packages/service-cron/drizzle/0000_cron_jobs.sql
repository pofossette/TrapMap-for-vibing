CREATE TABLE "cron_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"schedule" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"task_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" text,
	"last_error" text,
	"run_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "cron_jobs_next_run_enabled_idx" ON "cron_jobs" USING btree ("next_run_at") WHERE "cron_jobs"."enabled";
