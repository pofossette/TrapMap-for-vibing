CREATE TABLE "domain_event_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"worker_id" text,
	"started_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "task_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"dedupe_key" text,
	"process_after" timestamp with time zone DEFAULT now() NOT NULL,
	"worker_id" text,
	"started_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"run_id" text PRIMARY KEY NOT NULL,
	"workflow_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"status" text NOT NULL,
	"step_name" text,
	"attempt" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"stats" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "domain_event_outbox_pending_idx" ON "domain_event_outbox" USING btree ("event_name","available_at","created_at") WHERE "domain_event_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "domain_event_outbox_processing_lease_idx" ON "domain_event_outbox" USING btree ("event_name","lease_until","created_at") WHERE "domain_event_outbox"."status" = 'processing';--> statement-breakpoint
CREATE INDEX "task_queue_type_dedupe_idx" ON "task_queue" USING btree ("type","dedupe_key");--> statement-breakpoint
CREATE INDEX "task_queue_running_lease_idx" ON "task_queue" USING btree ("type","lease_until","updated_at") WHERE "task_queue"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "task_queue_dedupe_pending_idx" ON "task_queue" USING btree ("type","dedupe_key") WHERE "task_queue"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE INDEX "workflow_runs_type_subject_idx" ON "workflow_runs" USING btree ("workflow_type","subject_id");--> statement-breakpoint
CREATE INDEX "workflow_runs_status_updated_idx" ON "workflow_runs" USING btree ("status","updated_at");