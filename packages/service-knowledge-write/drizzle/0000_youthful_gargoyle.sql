CREATE SEQUENCE "public"."knowledge_entry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."skill_artifact_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "artifact_lifecycle_events" (
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
CREATE TABLE "artifact_revisions" (
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
CREATE TABLE "canonical_labels" (
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
CREATE TABLE "knowledge_boundary_contexts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowledge_boundary_contexts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" text NOT NULL,
	"context_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_boundary_evidence" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowledge_boundary_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" text NOT NULL,
	"kind" text NOT NULL,
	"identifier" text NOT NULL,
	"url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_boundary_exclusions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowledge_boundary_exclusions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" text NOT NULL,
	"description" text NOT NULL,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_boundary_prerequisites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowledge_boundary_prerequisites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" text NOT NULL,
	"description" text NOT NULL,
	"kind" text,
	"required" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_boundary_signals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowledge_boundary_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" text NOT NULL,
	"pattern" text NOT NULL,
	"kind" text DEFAULT 'keyword' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_boundary_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knowledge_boundary_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"entry_id" text NOT NULL,
	"package_name" text NOT NULL,
	"range_value" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"embedding_cache" jsonb,
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
CREATE TABLE "knowledge_labels" (
	"entry_id" text NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_maintenance_assignments" (
	"entry_id" text PRIMARY KEY NOT NULL,
	"maintainer_user_id" text,
	"maintainer_handle" text,
	"maintainer_level" integer,
	"review_by" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_revisions" (
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
CREATE TABLE "label_aliases" (
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
CREATE TABLE "label_alignment_events" (
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
CREATE TABLE "lifecycle_events" (
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
CREATE TABLE "skill_artifact_agent_reviews" (
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
CREATE TABLE "skill_artifact_boundary_contexts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_boundary_contexts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_id" text NOT NULL,
	"context_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_evidence" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_boundary_evidence_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_id" text NOT NULL,
	"kind" text NOT NULL,
	"identifier" text NOT NULL,
	"url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_exclusions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_boundary_exclusions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_id" text NOT NULL,
	"description" text NOT NULL,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_prerequisites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_boundary_prerequisites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_id" text NOT NULL,
	"description" text NOT NULL,
	"kind" text,
	"required" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_signals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_boundary_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_id" text NOT NULL,
	"pattern" text NOT NULL,
	"kind" text DEFAULT 'keyword' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_boundary_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_id" text NOT NULL,
	"package_name" text NOT NULL,
	"range_value" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_capsules" (
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
CREATE TABLE "skill_artifact_client_manifests" (
	"artifact_revision_id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"source_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_files" (
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
CREATE TABLE "skill_artifact_maintenance_assignments" (
	"artifact_id" text PRIMARY KEY NOT NULL,
	"maintainer_user_id" text,
	"maintainer_handle" text,
	"maintainer_level" integer,
	"review_by" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_manifest_assets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_manifest_assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_revision_id" text NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_manifest_references" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "skill_artifact_manifest_references_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"artifact_revision_id" text NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_manifest_scripts" (
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
CREATE TABLE "skill_artifact_metadata" (
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
CREATE TABLE "skill_artifact_profiles" (
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
CREATE TABLE "skill_artifact_script_descriptors" (
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
CREATE INDEX "idx_artifact_lifecycle_events_artifact" ON "artifact_lifecycle_events" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "idx_artifact_revisions_artifact" ON "artifact_revisions" USING btree ("artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_artifact_revisions_artifact_revision_no" ON "artifact_revisions" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_canonical_labels_normalized_kind" ON "canonical_labels" USING btree ("normalized_name","kind");--> statement-breakpoint
CREATE INDEX "idx_canonical_labels_kind" ON "canonical_labels" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_canonical_labels_status" ON "canonical_labels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_canonical_labels_merged_into" ON "canonical_labels" USING btree ("merged_into_label_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_contexts_entry" ON "knowledge_boundary_contexts" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_boundary_contexts_entry_value" ON "knowledge_boundary_contexts" USING btree ("entry_id","context_value");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_evidence_entry" ON "knowledge_boundary_evidence" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_exclusions_entry" ON "knowledge_boundary_exclusions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_prerequisites_entry" ON "knowledge_boundary_prerequisites" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_signals_entry" ON "knowledge_boundary_signals" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_versions_entry" ON "knowledge_boundary_versions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_entries_lifecycle_state" ON "knowledge_entries" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "idx_knowledge_entries_team" ON "knowledge_entries" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_entries_scope_level" ON "knowledge_entries" USING btree ("scope","required_level");--> statement-breakpoint
CREATE INDEX "idx_knowledge_entries_owner" ON "knowledge_entries" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_entries_dive_log_id" ON "knowledge_entries" USING btree ("dive_log_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_labels_entry_label" ON "knowledge_labels" USING btree ("entry_id","label");--> statement-breakpoint
CREATE INDEX "idx_knowledge_labels_label" ON "knowledge_labels" USING btree ("label");--> statement-breakpoint
CREATE INDEX "idx_knowledge_maintenance_assignments_maintainer" ON "knowledge_maintenance_assignments" USING btree ("maintainer_user_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_maintenance_assignments_review_by" ON "knowledge_maintenance_assignments" USING btree ("review_by");--> statement-breakpoint
CREATE INDEX "idx_knowledge_revisions_entry" ON "knowledge_revisions" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_revisions_entry_revision_no" ON "knowledge_revisions" USING btree ("entry_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_label_aliases_normalized" ON "label_aliases" USING btree ("normalized_alias");--> statement-breakpoint
CREATE INDEX "idx_label_aliases_canonical" ON "label_aliases" USING btree ("canonical_label_id");--> statement-breakpoint
CREATE INDEX "idx_label_alignment_events_raw_label" ON "label_alignment_events" USING btree ("raw_label");--> statement-breakpoint
CREATE INDEX "idx_label_alignment_events_decision" ON "label_alignment_events" USING btree ("decision");--> statement-breakpoint
CREATE INDEX "idx_label_alignment_events_canonical" ON "label_alignment_events" USING btree ("canonical_label_id");--> statement-breakpoint
CREATE INDEX "idx_lifecycle_events_entry" ON "lifecycle_events" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_agent_reviews_status" ON "skill_artifact_agent_reviews" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_contexts_artifact" ON "skill_artifact_boundary_contexts" USING btree ("artifact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_boundary_contexts_artifact_value" ON "skill_artifact_boundary_contexts" USING btree ("artifact_id","context_value");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_evidence_artifact" ON "skill_artifact_boundary_evidence" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_exclusions_artifact" ON "skill_artifact_boundary_exclusions" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_prerequisites_artifact" ON "skill_artifact_boundary_prerequisites" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_signals_artifact" ON "skill_artifact_boundary_signals" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_versions_artifact" ON "skill_artifact_boundary_versions" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_capsules_revision" ON "skill_artifact_capsules" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_capsules_artifact" ON "skill_artifact_capsules" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_client_manifests_artifact" ON "skill_artifact_client_manifests" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_files_artifact_revision" ON "skill_artifact_files" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_files_artifact" ON "skill_artifact_files" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_files_revision_path" ON "skill_artifact_files" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_maintenance_assignments_maintainer" ON "skill_artifact_maintenance_assignments" USING btree ("maintainer_user_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_maintenance_assignments_review_by" ON "skill_artifact_maintenance_assignments" USING btree ("review_by");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_manifest_assets_revision" ON "skill_artifact_manifest_assets" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_manifest_assets_revision_path" ON "skill_artifact_manifest_assets" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_manifest_references_revision" ON "skill_artifact_manifest_references" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_manifest_references_revision_path" ON "skill_artifact_manifest_references" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_manifest_scripts_revision" ON "skill_artifact_manifest_scripts" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_manifest_scripts_revision_path" ON "skill_artifact_manifest_scripts" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_metadata_source_kind" ON "skill_artifact_metadata" USING btree ("source_kind");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_profiles_artifact" ON "skill_artifact_profiles" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_script_descriptors_revision" ON "skill_artifact_script_descriptors" USING btree ("artifact_revision_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_script_descriptors_artifact" ON "skill_artifact_script_descriptors" USING btree ("artifact_id","revision_no");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_script_descriptors_revision_path" ON "skill_artifact_script_descriptors" USING btree ("artifact_revision_id","path");--> statement-breakpoint
CREATE INDEX "idx_skill_artifacts_lifecycle_state" ON "skill_artifacts" USING btree ("lifecycle_state");--> statement-breakpoint
CREATE INDEX "idx_skill_artifacts_team" ON "skill_artifacts" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_skill_artifacts_slug" ON "skill_artifacts" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifacts_scope_team_slug" ON "skill_artifacts" USING btree (COALESCE("team_id", '__global__'),"scope","slug");
