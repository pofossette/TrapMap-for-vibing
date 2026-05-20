CREATE TABLE "candidate_analyses" (
	"candidate_id" text PRIMARY KEY NOT NULL,
	"normalized_at" timestamp with time zone NOT NULL,
	"fingerprint" text NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_duplicate_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"candidate_id" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"detection_version" text NOT NULL,
	"highest_similarity" integer NOT NULL,
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
	"similarity_score" integer NOT NULL,
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
	"submitted_by" text NOT NULL,
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
CREATE INDEX "idx_entity_lineage_candidate" ON "entity_lineage" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "idx_entity_lineage_source" ON "entity_lineage" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_entity_lineage_target" ON "entity_lineage" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_candidates_source_type" ON "candidates" USING btree ("source_type");--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "ck_candidates_source_type" CHECK ("candidates"."source_type" IN ('trap', 'skill'));--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "ck_candidates_status" CHECK ("candidates"."status" IN ('received', 'queued', 'analyzing', 'duplicate_detected', 'ready_for_review', 'resolved', 'error'));
--> statement-breakpoint

-- =============================================================================
-- Backfill structured tables from existing JSONB data
-- =============================================================================

-- Backfill candidate_analyses from candidates.analysis_snapshot JSONB
INSERT INTO candidate_analyses (candidate_id, normalized_at, fingerprint, keywords, tokens)
SELECT
  id,
  (analysis_snapshot->>'normalizedAt')::timestamptz,
  analysis_snapshot->>'fingerprint',
  COALESCE(analysis_snapshot->'keywords', '[]'::jsonb),
  COALESCE(analysis_snapshot->'tokens', '[]'::jsonb)
FROM candidates
WHERE analysis_snapshot IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Backfill candidate_duplicate_cases from candidates.duplicate_case JSONB
INSERT INTO candidate_duplicate_cases (id, candidate_id, detected_at, detection_version, highest_similarity, has_exact_duplicate, duplicate_type)
SELECT
  duplicate_case->>'id',
  id,
  (duplicate_case->>'detectedAt')::timestamptz,
  duplicate_case->>'detectionVersion',
  ROUND((duplicate_case->>'highestSimilarity')::numeric * 100)::integer,
  CASE WHEN (duplicate_case->>'hasExactDuplicate')::boolean THEN 1 ELSE 0 END,
  duplicate_case->>'duplicateType'
FROM candidates
WHERE duplicate_case IS NOT NULL AND duplicate_case->>'id' IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Backfill candidate_duplicate_matches from matches[] inside duplicate_case JSONB
INSERT INTO candidate_duplicate_matches (duplicate_case_id, entity_type, entity_id, entity_title, similarity_score, match_type, shared_keywords, shared_tokens, text_overlap_percent)
SELECT
  duplicate_case->>'id',
  elem->>'entityType',
  elem->>'entityId',
  elem->>'entityTitle',
  ROUND((elem->>'similarityScore')::numeric * 100)::integer,
  elem->>'matchType',
  COALESCE(elem->'overlapDetails'->'sharedKeywords', '[]'::jsonb),
  COALESCE(elem->'overlapDetails'->'sharedTokens', '[]'::jsonb),
  COALESCE(ROUND((elem->'overlapDetails'->>'textOverlapPercent')::numeric)::integer, 0)
FROM candidates,
  jsonb_array_elements(duplicate_case->'matches') AS elem
WHERE duplicate_case IS NOT NULL AND duplicate_case->'matches' IS NOT NULL;
--> statement-breakpoint

-- Backfill candidate_manual_results from candidates.manual_result JSONB
INSERT INTO candidate_manual_results (candidate_id, decision, notes, merged_with_entity_type, merged_with_entity_id, merged_with_entity_title, submitted_at, submitted_by)
SELECT
  id,
  manual_result->>'decision',
  manual_result->>'notes',
  manual_result->'mergedWith'->>'entityType',
  manual_result->'mergedWith'->>'entityId',
  manual_result->'mergedWith'->>'entityTitle',
  (manual_result->>'submittedAt')::timestamptz,
  manual_result->>'submittedBy'
FROM candidates
WHERE manual_result IS NOT NULL AND manual_result->>'decision' IS NOT NULL
ON CONFLICT DO NOTHING;