CREATE SEQUENCE "public"."knowledge_entry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."skill_artifact_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "artifact_lifecycle_events" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"actor_user_id" text,
	"submission_id" text,
	"revision" integer,
	"state" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "artifact_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"revision" integer NOT NULL,
	"source_hash" text NOT NULL,
	"files" jsonb NOT NULL,
	"script_descriptors" jsonb NOT NULL,
	"derived" jsonb,
	"submitted_at" timestamp with time zone NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"submitted_by" text NOT NULL,
	"team_id" text,
	"status" text NOT NULL,
	"original_payload" jsonb NOT NULL,
	"analysis_snapshot" jsonb,
	"duplicate_case" jsonb,
	"received_at" timestamp with time zone NOT NULL,
	"queued_at" timestamp with time zone,
	"analyzing_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"manual_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"revision" integer NOT NULL,
	"content_hash" text NOT NULL,
	"vector" vector(384) NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shortcut" text NOT NULL,
	"detail" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"lifecycle_state" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"boundary" jsonb,
	"maintenance_meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"revision" integer NOT NULL,
	"content_hash" text NOT NULL,
	"tokens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"field_tokens" jsonb DEFAULT '{"shortcut":[],"detail":[],"labels":[]}'::jsonb NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"revision" integer NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"shortcut" text NOT NULL,
	"detail" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lifecycle_events" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"actor_user_id" text,
	"submission_id" text,
	"revision" integer,
	"state" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "skill_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"lifecycle_state" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"agent_review" jsonb,
	"maintenance_meta" jsonb,
	"boundary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_snapshot" (
	"key" text PRIMARY KEY DEFAULT 'main' NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE INDEX "idx_artifact_lifecycle_events_artifact" ON "artifact_lifecycle_events" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "idx_artifact_revisions_artifact" ON "artifact_revisions" USING btree ("artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artifact_revisions_artifact_revision" ON "artifact_revisions" USING btree ("artifact_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_embeddings_entry_revision_idx" ON "knowledge_embeddings" USING btree ("entry_id","revision");--> statement-breakpoint
CREATE INDEX "idx_knowledge_entries_lifecycle_state" ON "knowledge_entries" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "idx_knowledge_entries_team" ON "knowledge_entries" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_keywords_entry_revision_idx" ON "knowledge_keywords" USING btree ("entry_id","revision");--> statement-breakpoint
CREATE INDEX "idx_knowledge_keywords_tokens_gin" ON "knowledge_keywords" USING gin ("tokens");--> statement-breakpoint
CREATE INDEX "idx_knowledge_revisions_entry" ON "knowledge_revisions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_lifecycle_events_entry" ON "lifecycle_events" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifacts_lifecycle_state" ON "skill_artifacts" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "idx_skill_artifacts_team" ON "skill_artifacts" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifacts_slug" ON "skill_artifacts" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_usage_events_team_created" ON "usage_events" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_events_account_created" ON "usage_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_events_entry_type_created" ON "usage_events" USING btree ("entry_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_events_entry_id_created" ON "usage_events" USING btree ("entry_id","created_at");