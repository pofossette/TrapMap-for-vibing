CREATE TABLE "candidate_analyses" (
	"candidate_id" text PRIMARY KEY NOT NULL,
	"normalized_at" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duplicate_trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_duplicate_cases" (
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
CREATE TABLE "candidate_duplicate_matches" (
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
CREATE TABLE "candidate_manual_results" (
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
CREATE TABLE "candidate_resolution_outcomes" (
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
CREATE TABLE "candidates" (
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
CREATE TABLE "entity_lineage" (
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
CREATE INDEX "idx_candidate_analyses_fingerprint" ON "candidate_analyses" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "idx_candidate_duplicate_cases_candidate" ON "candidate_duplicate_cases" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_duplicate_cases_type" ON "candidate_duplicate_cases" USING btree ("duplicate_type");--> statement-breakpoint
CREATE INDEX "idx_candidate_duplicate_matches_case" ON "candidate_duplicate_matches" USING btree ("duplicate_case_id");--> statement-breakpoint
CREATE INDEX "idx_candidate_duplicate_matches_entity" ON "candidate_duplicate_matches" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_candidates_status" ON "candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_candidates_team" ON "candidates" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_candidates_source_type" ON "candidates" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_entity_lineage_candidate" ON "entity_lineage" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_entity_lineage_source" ON "entity_lineage" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_entity_lineage_target" ON "entity_lineage" USING btree ("target_type","target_id");