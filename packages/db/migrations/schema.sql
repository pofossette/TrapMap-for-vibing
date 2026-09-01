-- Source: packages/persistence-schema/drizzle/0001_drop_task_queue_type_dedupe_idx.sql
-- A7 迁移窗口批处理：冗余索引退役（部分唯一索引 task_queue_dedupe_pending_idx 已覆盖同列组查询）
DROP INDEX IF EXISTS task_queue_type_dedupe_idx;

-- Source: packages/service-candidate-ingestion/drizzle/0000_colorful_silk_fever.sql
CREATE TABLE IF NOT EXISTS "candidate_analyses" (
	"candidate_id" text PRIMARY KEY NOT NULL,
	"normalized_at" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_duplicate_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"detection_version" text NOT NULL,
	"highest_similarity" real NOT NULL,
	"has_exact_duplicate" integer DEFAULT 0 NOT NULL,
	"duplicate_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_candidate_duplicate_cases_type" CHECK ("candidate_duplicate_cases"."duplicate_type" IN ('exact', 'semantic', 'none'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_duplicate_matches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "candidate_duplicate_matches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"duplicate_case_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_title" text NOT NULL,
	"similarity_score" real NOT NULL,
	"match_type" text NOT NULL,
	"shared_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"shared_tokens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"text_overlap_percent" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ck_candidate_duplicate_matches_entity_type" CHECK ("candidate_duplicate_matches"."entity_type" IN ('trap', 'skill')),
	CONSTRAINT "ck_candidate_duplicate_matches_match_type" CHECK ("candidate_duplicate_matches"."match_type" IN ('exact', 'high-overlap', 'semantic-similar'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_manual_results" (
	"candidate_id" text PRIMARY KEY NOT NULL,
	"decision" text NOT NULL,
	"notes" text NOT NULL,
	"merged_with_entity_type" text,
	"merged_with_entity_id" text,
	"merged_with_entity_title" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_candidate_manual_results_decision" CHECK ("candidate_manual_results"."decision" IN ('independent', 'merged'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidate_resolution_outcomes" (
	"candidate_id" text PRIMARY KEY NOT NULL,
	"decision" text NOT NULL,
	"published_entity_id" text,
	"merged_into_entity_id" text,
	"entity_type" text,
	"resolved_at" timestamp with time zone NOT NULL,
	"resolved_by" text NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_candidate_resolution_outcomes_decision" CHECK ("candidate_resolution_outcomes"."decision" IN ('independent', 'merged'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"submitted_by_user_id" text NOT NULL,
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_candidates_source_type" CHECK ("candidates"."source_type" IN ('trap', 'skill')),
	CONSTRAINT "ck_candidates_status" CHECK ("candidates"."status" IN ('received', 'queued', 'analyzing', 'duplicate_detected', 'ready_for_review', 'resolved', 'error'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_lineage" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"relationship_type" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"notes" text,
	CONSTRAINT "ck_entity_lineage_relationship_type" CHECK ("entity_lineage"."relationship_type" IN ('published_as', 'merged_into')),
	CONSTRAINT "ck_entity_lineage_source_type" CHECK ("entity_lineage"."source_type" IN ('candidate', 'trap', 'skill')),
	CONSTRAINT "ck_entity_lineage_target_type" CHECK ("entity_lineage"."target_type" IN ('trap', 'skill'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidate_analyses_fingerprint" ON "candidate_analyses" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidate_duplicate_cases_candidate" ON "candidate_duplicate_cases" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidate_duplicate_cases_type" ON "candidate_duplicate_cases" USING btree ("duplicate_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidate_duplicate_matches_case" ON "candidate_duplicate_matches" USING btree ("duplicate_case_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidate_duplicate_matches_entity" ON "candidate_duplicate_matches" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidates_status" ON "candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidates_team" ON "candidates" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_candidates_source_type" ON "candidates" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entity_lineage_candidate" ON "entity_lineage" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entity_lineage_source" ON "entity_lineage" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_entity_lineage_target" ON "entity_lineage" USING btree ("target_type","target_id");
-- Source: packages/service-candidate-ingestion/drizzle/0001_drop_candidates_legacy_jsonb.sql
-- A7 迁移窗口批处理：candidates 表 3 个 legacy JSONB 列退役
ALTER TABLE candidates
  DROP COLUMN IF EXISTS analysis_snapshot,
  DROP COLUMN IF EXISTS duplicate_case,
  DROP COLUMN IF EXISTS manual_result;

-- Source: packages/service-cron/drizzle/0000_cron_jobs.sql
CREATE TABLE IF NOT EXISTS "cron_jobs" (
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
CREATE INDEX IF NOT EXISTS "cron_jobs_next_run_enabled_idx" ON "cron_jobs" USING btree ("next_run_at") WHERE "cron_jobs"."enabled";

-- Source: packages/service-governance-review/drizzle/0000_shiny_swarm.sql
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conflict_relations" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id_a" text NOT NULL,
	"entry_id_b" text NOT NULL,
	"conflict_type" text NOT NULL,
	"context" text NOT NULL,
	"problem_overlap_score" double precision NOT NULL,
	"solution_diff_score" double precision NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ck_conflict_relations_canonical_order" CHECK ("conflict_relations"."entry_id_a" < "conflict_relations"."entry_id_b"),
	CONSTRAINT "ck_conflict_relations_type" CHECK ("conflict_relations"."conflict_type" IN ('alternative', 'contradictory', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback_records" (
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
	"custom_answers" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_feedback_records_entry_type" CHECK ("feedback_records"."entry_type" IN ('trap', 'skill')),
	CONSTRAINT "ck_feedback_records_problem_type" CHECK ("feedback_records"."problem_type" IN ('incorrect', 'outdated', 'context-mismatch', 'incomplete', 'other')),
	CONSTRAINT "ck_feedback_records_status" CHECK ("feedback_records"."status" IN ('new', 'triaged', 'resolved', 'dismissed')),
	CONSTRAINT "ck_feedback_records_remediation_status" CHECK ("feedback_records"."remediation_status" IS NULL OR "feedback_records"."remediation_status" IN ('pending-human-review', 'in-remediation', 'ready-to-reindex'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_events" (
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
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_conflict_relations_entry_pair" ON "conflict_relations" USING btree ("entry_id_a","entry_id_b");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conflict_relations_entry_a" ON "conflict_relations" USING btree ("entry_id_a");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conflict_relations_entry_b" ON "conflict_relations" USING btree ("entry_id_b");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_records_entry" ON "feedback_records" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_records_entry_type" ON "feedback_records" USING btree ("entry_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_records_status" ON "feedback_records" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_records_problem_type" ON "feedback_records" USING btree ("problem_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_feedback_records_submitted_by" ON "feedback_records" USING btree ("submitted_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_feedback_records_custom_answers_gin" ON "feedback_records" USING gin ("custom_answers");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_entries_boundary_gin" ON "knowledge_entries" USING gin ("boundary");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifacts_boundary_gin" ON "skill_artifacts" USING gin ("boundary");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_events_team_created" ON "usage_events" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_events_account_created" ON "usage_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_events_entry_type_created" ON "usage_events" USING btree ("entry_type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_usage_events_entry_id_created" ON "usage_events" USING btree ("entry_id","created_at");--> statement-breakpoint

-- Source: packages/service-identity-access/drizzle/0000_identity_access_baseline.sql
CREATE SEQUENCE IF NOT EXISTS "public"."access_key_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."audit_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."membership_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."session_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."team_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "access_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_preview" text NOT NULL,
	"issued_by_user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"level" integer NOT NULL,
	"notes" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_keys_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"source_service" text DEFAULT 'server-compatibility-seam' NOT NULL,
	"request_id" text,
	"trace_id" text,
	"operation_id" text,
	"causation_id" text,
	"outcome" text DEFAULT 'success' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"role_template" text NOT NULL,
	"security_level" integer NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" text,
	"active_team_id" text,
	"subject_type" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
-- A7 迁移窗口批处理：store_snapshot 幽灵表已从基线移除（Wave-9 退役模块残留，persistence-schema 无此表）
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
ALTER TABLE "access_keys" ADD CONSTRAINT "access_keys_member_id_memberships_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_keys" ADD CONSTRAINT "access_keys_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_keys" ADD CONSTRAINT "access_keys_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_team_id_teams_id_fk" FOREIGN KEY ("active_team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_keys_token_hash_idx" ON "access_keys" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_keys_member_id_idx" ON "access_keys" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_keys_team_id_idx" ON "access_keys" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "access_keys_issued_by_user_id_idx" ON "access_keys" USING btree ("issued_by_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_team_id_idx" ON "audit_events" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_actor_id_idx" ON "audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_entity_id_idx" ON "audit_events" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_request_id_idx" ON "audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_trace_id_idx" ON "audit_events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_operation_id_idx" ON "audit_events" USING btree ("operation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_causation_id_idx" ON "audit_events" USING btree ("causation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_events_created_at_idx" ON "audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "memberships_user_team_uidx" ON "memberships" USING btree ("user_id","team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memberships_user_id_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "memberships_team_id_idx" ON "memberships" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_token_hash_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "teams_slug_uidx" ON "teams" USING btree ("slug");
-- Source: packages/service-job-runtime/drizzle/0000_sharp_old_lace.sql
CREATE TABLE IF NOT EXISTS "domain_event_outbox" (
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
CREATE TABLE IF NOT EXISTS "task_queue" (
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
CREATE TABLE IF NOT EXISTS "workflow_runs" (
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
CREATE INDEX IF NOT EXISTS "domain_event_outbox_pending_idx" ON "domain_event_outbox" USING btree ("event_name","available_at","created_at") WHERE "domain_event_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "domain_event_outbox_processing_lease_idx" ON "domain_event_outbox" USING btree ("event_name","lease_until","created_at") WHERE "domain_event_outbox"."status" = 'processing';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_queue_type_dedupe_idx" ON "task_queue" USING btree ("type","dedupe_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_queue_running_lease_idx" ON "task_queue" USING btree ("type","lease_until","updated_at") WHERE "task_queue"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "task_queue_dedupe_pending_idx" ON "task_queue" USING btree ("type","dedupe_key") WHERE "task_queue"."status" IN ('pending', 'running');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_type_subject_idx" ON "workflow_runs" USING btree ("workflow_type","subject_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_status_updated_idx" ON "workflow_runs" USING btree ("status","updated_at");
-- Source: packages/service-knowledge-read/drizzle/0000_sharp_talos.sql
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canonical_label_embeddings" (
	"canonical_label_id" text PRIMARY KEY NOT NULL,
	"vector" vector(384) NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "graph_index_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"content_hash" text NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_graph_index_documents_source_type" CHECK ("graph_index_documents"."source_type" IN ('trap', 'skill')),
	CONSTRAINT "ck_graph_index_documents_scope" CHECK ("graph_index_documents"."scope" IN ('global', 'project'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_embeddings" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"content_hash" text NOT NULL,
	"vector" vector(384) NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_keywords" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"content_hash" text NOT NULL,
	"tokens" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_shortcut" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_detail" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_labels" text[] DEFAULT '{}' NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_search_documents" (
	"entry_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"document" text NOT NULL,
	"labels" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_search_documents_entry_id_revision_no_pk" PRIMARY KEY("entry_id","revision_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "retrieval_badcase_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"feedback_id" text NOT NULL,
	"query_id" text,
	"query_seed" text,
	"route_family" text,
	"entry_id" text NOT NULL,
	"entry_type" text NOT NULL,
	"failure_classification" text,
	"expected_correction" text,
	"selected_result_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_retrieval_badcase_entry_type" CHECK ("retrieval_badcase_traces"."entry_type" IN ('trap', 'skill')),
	CONSTRAINT "ck_retrieval_badcase_route_family" CHECK ("retrieval_badcase_traces"."route_family" IS NULL OR "retrieval_badcase_traces"."route_family" IN ('entry', 'capsule', 'graph-plan'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_capsule_embeddings" (
	"capsule_id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"embedding" vector(384) NOT NULL,
	"content_hash" text NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_skill_artifact_capsule_embeddings_scope" CHECK ("skill_artifact_capsule_embeddings"."scope" IN ('global', 'project'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_capsule_keywords" (
	"capsule_id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"team_id" text,
	"scope" text NOT NULL,
	"required_level" integer NOT NULL,
	"status" text DEFAULT 'synced' NOT NULL,
	"tokens" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_content" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_situation" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_problem" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_goal" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_labels" text[] DEFAULT '{}' NOT NULL,
	"field_tokens_contextual_prefix" text[] DEFAULT '{}' NOT NULL,
	"content_hash" text NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_skill_artifact_capsule_keywords_scope" CHECK ("skill_artifact_capsule_keywords"."scope" IN ('global', 'project'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_canonical_label_embeddings_hash" ON "canonical_label_embeddings" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_index_documents_source" ON "graph_index_documents" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_graph_index_documents_source_revision_no" ON "graph_index_documents" USING btree ("source_type","source_id","revision_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_graph_index_documents_team" ON "graph_index_documents" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_embeddings_entry_revision_no_idx" ON "knowledge_embeddings" USING btree ("entry_id","revision_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_embeddings_status" ON "knowledge_embeddings" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_keywords_entry_revision_no_idx" ON "knowledge_keywords" USING btree ("entry_id","revision_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_keywords_tokens_gin" ON "knowledge_keywords" USING gin ("tokens");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_keywords_status" ON "knowledge_keywords" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_search_documents_entry" ON "knowledge_search_documents" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_search_documents_status" ON "knowledge_search_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_retrieval_badcase_query" ON "retrieval_badcase_traces" USING btree ("query_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_retrieval_badcase_feedback" ON "retrieval_badcase_traces" USING btree ("feedback_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_retrieval_badcase_entry" ON "retrieval_badcase_traces" USING btree ("entry_id","entry_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capsule_embeddings_artifact_revision" ON "skill_artifact_capsule_embeddings" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capsule_embeddings_status" ON "skill_artifact_capsule_embeddings" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capsule_keywords_artifact_revision" ON "skill_artifact_capsule_keywords" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capsule_keywords_tokens_gin" ON "skill_artifact_capsule_keywords" USING gin ("tokens");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_capsule_keywords_status" ON "skill_artifact_capsule_keywords" USING btree ("status");

-- Source: packages/service-knowledge-write/drizzle/0000_youthful_gargoyle.sql
CREATE SEQUENCE IF NOT EXISTS "public"."knowledge_entry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "public"."skill_artifact_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artifact_lifecycle_events" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"actor_user_id" text,
	"submission_id" text,
	"revision_no" integer,
	"state" text NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artifact_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"source_hash" text NOT NULL,
	"files" jsonb NOT NULL,
	"script_descriptors" jsonb NOT NULL,
	"derived" jsonb,
	"submitted_at" timestamp with time zone NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canonical_labels" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"definition" text,
	"status" text DEFAULT 'active' NOT NULL,
	"merged_into_label_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_canonical_labels_status" CHECK ("canonical_labels"."status" IN ('active', 'merged', 'disabled'))
);
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_entries" (
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
	"embedding_cache" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"agent_review" jsonb,
	"index_state" jsonb,
	"decay_meta" jsonb,
	"evidence_meta" jsonb,
	"remediation" jsonb,
	"dive_log_id" text,
	"dive_site" text,
	"slang_level" text,
	"raw_content" text,
	"parsed_blocks" jsonb,
	"template_id" text,
	"pinned" integer DEFAULT 0 NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_knowledge_entries_scope" CHECK ("knowledge_entries"."scope" IN ('global', 'project')),
	CONSTRAINT "ck_knowledge_entries_lifecycle_state" CHECK ("knowledge_entries"."lifecycle_state" IN ('draft', 'submitted', 'agent-pass', 'agent-rejected', 'approved', 'rejected', 'deactivated')),
	CONSTRAINT "ck_knowledge_entries_required_level" CHECK ("knowledge_entries"."required_level" >= 0 AND "knowledge_entries"."required_level" <= 10)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_labels" (
	"entry_id" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_maintenance_assignments" (
	"entry_id" text PRIMARY KEY NOT NULL,
	"maintainer_user_id" text,
	"maintainer_handle" text,
	"maintainer_level" integer,
	"review_by" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"shortcut" text NOT NULL,
	"detail" text NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"review_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_review_decisions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowledge_review_decisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"decided_by_user_id" text NOT NULL,
	"decision" text NOT NULL,
	"notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_knowledge_review_decisions_decision" CHECK ("knowledge_review_decisions"."decision" IN ('approve', 'reject'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"submitted_at" timestamp with time zone NOT NULL,
	"submitted_by_user_id" text NOT NULL,
	"lifecycle_state" text NOT NULL,
	"resubmission_of" text,
	"agent_review" jsonb,
	"reviewer_decision" jsonb,
	"review_notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "label_aliases" (
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"canonical_label_id" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_label_aliases_source" CHECK ("label_aliases"."source" IN ('manual', 'llm', 'backfill')),
	CONSTRAINT "ck_label_aliases_confidence" CHECK ("label_aliases"."confidence" >= 0.0 AND "label_aliases"."confidence" <= 1.0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "label_alignment_events" (
	"id" text PRIMARY KEY NOT NULL,
	"raw_label" text NOT NULL,
	"raw_evidence" text DEFAULT '' NOT NULL,
	"decision" text NOT NULL,
	"canonical_label_id" text,
	"canonical_name" text,
	"confidence" real NOT NULL,
	"reasoning" text DEFAULT '' NOT NULL,
	"candidate_snapshot" jsonb DEFAULT '[]'::jsonb,
	"source_context" text DEFAULT 'extraction' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_label_alignment_events_decision" CHECK ("label_alignment_events"."decision" IN ('existing', 'new', 'unsure')),
	CONSTRAINT "ck_label_alignment_events_source_context" CHECK ("label_alignment_events"."source_context" IN ('extraction', 'backfill', 'repair', 'manual'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lifecycle_events" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"actor_user_id" text,
	"submission_id" text,
	"revision_no" integer,
	"state" text NOT NULL,
	"note" text,
	CONSTRAINT "ck_lifecycle_events_type" CHECK ("lifecycle_events"."type" IN ('submitted', 'resubmitted', 'agent-reviewed', 'reviewer-approved', 'reviewer-rejected', 'updated', 'deactivated'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_agent_reviews" (
	"artifact_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"duplicate_risk" text NOT NULL,
	"correctness_risk" text NOT NULL,
	"completeness_risk" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_skill_artifact_agent_reviews_status" CHECK ("skill_artifact_agent_reviews"."status" IN ('agent-pass', 'agent-rejected')),
	CONSTRAINT "ck_skill_artifact_agent_reviews_duplicate_risk" CHECK ("skill_artifact_agent_reviews"."duplicate_risk" IN ('low', 'medium', 'high')),
	CONSTRAINT "ck_skill_artifact_agent_reviews_correctness_risk" CHECK ("skill_artifact_agent_reviews"."correctness_risk" IN ('low', 'medium', 'high')),
	CONSTRAINT "ck_skill_artifact_agent_reviews_completeness_risk" CHECK ("skill_artifact_agent_reviews"."completeness_risk" IN ('low', 'medium', 'high'))
);
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_capsules" (
	"capsule_id" text PRIMARY KEY NOT NULL,
	"artifact_revision_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"source_hash" text NOT NULL,
	"source_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content" text NOT NULL,
	"situation" text NOT NULL,
	"problem" text NOT NULL,
	"goal" text NOT NULL,
	"error_text" text,
	"contextual_prefix" text,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope" text NOT NULL,
	"required_level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_skill_artifact_capsules_scope" CHECK ("skill_artifact_capsules"."scope" IN ('global', 'project'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_client_manifests" (
	"artifact_revision_id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"source_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_files_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_revision_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"content" text NOT NULL,
	"source_group" text NOT NULL,
	"include_in_derivation" integer DEFAULT 1 NOT NULL,
	"activation_only" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_skill_artifact_files_kind" CHECK ("skill_artifact_files"."kind" IN ('skill-markdown', 'reference', 'asset', 'script'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_maintenance_assignments" (
	"artifact_id" text PRIMARY KEY NOT NULL,
	"maintainer_user_id" text,
	"maintainer_handle" text,
	"maintainer_level" integer,
	"review_by" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_manifest_assets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_manifest_assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_revision_id" text NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_manifest_references" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_manifest_references_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_revision_id" text NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_manifest_scripts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_manifest_scripts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_revision_id" text NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"capability" text NOT NULL,
	"args_schema_summary" text NOT NULL,
	"side_effect_summary" text NOT NULL,
	"default_policy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_metadata" (
	"artifact_id" text PRIMARY KEY NOT NULL,
	"source_kind" text NOT NULL,
	"submission_count" integer DEFAULT 0 NOT NULL,
	"resubmission_count" integer DEFAULT 0 NOT NULL,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"latest_submission_id" text,
	"latest_submitted_at" timestamp with time zone,
	"latest_reviewed_at" timestamp with time zone,
	"latest_decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_skill_artifact_metadata_source_kind" CHECK ("skill_artifact_metadata"."source_kind" IN ('skill-directory', 'single-skill-md', 'legacy-knowledge')),
	CONSTRAINT "ck_skill_artifact_metadata_latest_decision" CHECK ("skill_artifact_metadata"."latest_decision" IS NULL OR "skill_artifact_metadata"."latest_decision" IN ('approve', 'reject'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_profiles" (
	"artifact_revision_id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"source_hash" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference_paths" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifact_script_descriptors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_script_descriptors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_revision_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"capability" text NOT NULL,
	"args_schema_summary" text NOT NULL,
	"side_effect_summary" text NOT NULL,
	"default_policy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skill_artifacts" (
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
CREATE INDEX IF NOT EXISTS "idx_artifact_lifecycle_events_artifact" ON "artifact_lifecycle_events" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_artifact_revisions_artifact" ON "artifact_revisions" USING btree ("artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_artifact_revisions_artifact_revision_no" ON "artifact_revisions" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_canonical_labels_normalized_kind" ON "canonical_labels" USING btree ("normalized_name","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_canonical_labels_kind" ON "canonical_labels" USING btree ("kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_canonical_labels_status" ON "canonical_labels" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_canonical_labels_merged_into" ON "canonical_labels" USING btree ("merged_into_label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_entries_lifecycle_state" ON "knowledge_entries" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_entries_team" ON "knowledge_entries" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_entries_scope_level" ON "knowledge_entries" USING btree ("scope","required_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_entries_owner" ON "knowledge_entries" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_entries_dive_log_id" ON "knowledge_entries" USING btree ("dive_log_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_knowledge_labels_entry_label" ON "knowledge_labels" USING btree ("entry_id","label");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_labels_label" ON "knowledge_labels" USING btree ("label");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_maintenance_assignments_maintainer" ON "knowledge_maintenance_assignments" USING btree ("maintainer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_maintenance_assignments_review_by" ON "knowledge_maintenance_assignments" USING btree ("review_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_revisions_entry" ON "knowledge_revisions" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_knowledge_revisions_entry_revision_no" ON "knowledge_revisions" USING btree ("entry_id","revision_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_review_decisions_entry" ON "knowledge_review_decisions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_review_decisions_decided_at" ON "knowledge_review_decisions" USING btree ("decided_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_knowledge_submissions_entry" ON "knowledge_submissions" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_knowledge_submissions_entry_revision" ON "knowledge_submissions" USING btree ("entry_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_label_aliases_normalized" ON "label_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_label_aliases_canonical" ON "label_aliases" USING btree ("canonical_label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_label_alignment_events_raw_label" ON "label_alignment_events" USING btree ("raw_label");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_label_alignment_events_decision" ON "label_alignment_events" USING btree ("decision");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_label_alignment_events_canonical" ON "label_alignment_events" USING btree ("canonical_label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_lifecycle_events_entry" ON "lifecycle_events" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_agent_reviews_status" ON "skill_artifact_agent_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_capsules_revision" ON "skill_artifact_capsules" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_capsules_artifact" ON "skill_artifact_capsules" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_client_manifests_artifact" ON "skill_artifact_client_manifests" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_files_artifact_revision" ON "skill_artifact_files" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_files_artifact" ON "skill_artifact_files" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_artifact_files_revision_path" ON "skill_artifact_files" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_maintenance_assignments_maintainer" ON "skill_artifact_maintenance_assignments" USING btree ("maintainer_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_maintenance_assignments_review_by" ON "skill_artifact_maintenance_assignments" USING btree ("review_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_manifest_assets_revision" ON "skill_artifact_manifest_assets" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_artifact_manifest_assets_revision_path" ON "skill_artifact_manifest_assets" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_manifest_references_revision" ON "skill_artifact_manifest_references" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_artifact_manifest_references_revision_path" ON "skill_artifact_manifest_references" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_manifest_scripts_revision" ON "skill_artifact_manifest_scripts" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_artifact_manifest_scripts_revision_path" ON "skill_artifact_manifest_scripts" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_metadata_source_kind" ON "skill_artifact_metadata" USING btree ("source_kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_profiles_artifact" ON "skill_artifact_profiles" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_script_descriptors_revision" ON "skill_artifact_script_descriptors" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifact_script_descriptors_artifact" ON "skill_artifact_script_descriptors" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_artifact_script_descriptors_revision_path" ON "skill_artifact_script_descriptors" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifacts_lifecycle_state" ON "skill_artifacts" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifacts_team" ON "skill_artifacts" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_skill_artifacts_slug" ON "skill_artifacts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_artifacts_scope_team_slug" ON "skill_artifacts" USING btree (COALESCE("team_id", '__global__'),"scope","slug");

-- Source: packages/service-knowledge-write/drizzle/0001_artifact_revision_version.sql
ALTER TABLE "artifact_revisions" ADD COLUMN IF NOT EXISTS "version" text;

-- Source: packages/service-knowledge-write/drizzle/0002_experience_genes.sql
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experience_genes" (
  "id" text PRIMARY KEY NOT NULL,
  "schema_version" text NOT NULL,
  "status" text NOT NULL,
  "title" text NOT NULL,
  "signals_match" jsonb NOT NULL,
  "summary" text NOT NULL,
  "strategy" jsonb NOT NULL,
  "avoid" jsonb NOT NULL,
  "constraints" jsonb NOT NULL,
  "validation" jsonb NOT NULL,
  "labels" jsonb NOT NULL,
  "scope" text NOT NULL,
  "team_id" text,
  "required_level" integer NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "source_revision" integer NOT NULL,
  "source_hash" text NOT NULL,
  "artifact_id" text,
  "capsule_id" text,
  "artifact_revision" integer,
  "derivation_unit_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "content_hash" text NOT NULL,
  "parent_event_id" text,
  "prior_gene_hash" text,
  "generator_kind" text NOT NULL,
  "generator_model" text,
  "prompt_version" text NOT NULL,
  "index_status" text NOT NULL,
  "index_last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_experience_genes_schema_version" CHECK ("experience_genes"."schema_version" = '1'),
  CONSTRAINT "ck_experience_genes_status" CHECK ("experience_genes"."status" IN ('candidate', 'validated', 'solidified', 'stale', 'deprecated')),
  CONSTRAINT "ck_experience_genes_source_kind" CHECK ("experience_genes"."source_type" IN ('trap', 'skill-artifact', 'skill-capsule')),
  CONSTRAINT "ck_experience_genes_scope" CHECK ("experience_genes"."scope" IN ('global', 'project')),
  CONSTRAINT "ck_experience_genes_generator_kind" CHECK ("experience_genes"."generator_kind" IN ('rule', 'llm', 'hybrid')),
  CONSTRAINT "ck_experience_genes_index_status" CHECK ("experience_genes"."index_status" IN ('pending', 'ready', 'failed'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experience_gene_events" (
  "id" text PRIMARY KEY NOT NULL,
  "gene_id" text NOT NULL,
  "type" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "source_revision" integer NOT NULL,
  "source_hash" text NOT NULL,
  "actor_kind" text NOT NULL,
  "actor_id" text,
  "validator_summary" jsonb NOT NULL,
  "reason_class" text,
  "payload_snapshot_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL,
  CONSTRAINT "ck_experience_gene_events_type" CHECK ("experience_gene_events"."type" IN ('derived', 'validated', 'rejected', 'solidified', 'staled', 'deprecated', 'index-failed')),
  CONSTRAINT "ck_experience_gene_events_actor_kind" CHECK ("experience_gene_events"."actor_kind" IN ('system', 'user', 'agent'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experience_gene_embeddings" (
  "gene_id" text PRIMARY KEY NOT NULL,
  "content_hash" text NOT NULL,
  "embedding" vector(384) NOT NULL,
  "embedding_model_version" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_experience_gene_embeddings_status" CHECK ("experience_gene_embeddings"."status" IN ('pending', 'ready', 'failed'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experience_gene_search_documents" (
  "gene_id" text PRIMARY KEY NOT NULL,
  "content_hash" text NOT NULL,
  "document" text NOT NULL,
  "labels" text[] DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_experience_gene_search_documents_status" CHECK ("experience_gene_search_documents"."status" IN ('pending', 'ready', 'failed'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_experience_genes_active_idempotency" ON "experience_genes" USING btree ("idempotency_key") WHERE "experience_genes"."status" IN ('candidate', 'validated', 'solidified');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_experience_genes_status_updated" ON "experience_genes" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_experience_genes_source" ON "experience_genes" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_experience_genes_governance" ON "experience_genes" USING btree ("scope","team_id","required_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_experience_gene_events_gene_time" ON "experience_gene_events" USING btree ("gene_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_experience_gene_embeddings_content_hash" ON "experience_gene_embeddings" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_experience_gene_embeddings_vector_hnsw" ON "experience_gene_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_experience_gene_search_documents_content_hash" ON "experience_gene_search_documents" USING btree ("content_hash");--> statement-breakpoint
ALTER TABLE "experience_gene_search_documents" ALTER COLUMN "document" TYPE tsvector USING to_tsvector('english', "document");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_experience_gene_search_documents_document_gin" ON "experience_gene_search_documents" USING gin ("document");
