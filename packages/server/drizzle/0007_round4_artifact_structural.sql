CREATE TABLE "skill_artifact_files" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"artifact_revision_id" text NOT NULL,
	"artifact_id" text NOT NULL,
	"revision_no" integer NOT NULL,
	"path" text NOT NULL,
	"kind" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"source_group" text NOT NULL,
	"include_in_derivation" integer NOT NULL DEFAULT 1,
	"activation_only" integer NOT NULL DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_script_descriptors" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "skill_artifact_manifest_references" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"artifact_revision_id" text NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_manifest_assets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"artifact_revision_id" text NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"media_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_manifest_scripts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
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
CREATE TABLE "skill_artifact_boundary_contexts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"artifact_id" text NOT NULL,
	"context_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"artifact_id" text NOT NULL,
	"package_name" text NOT NULL,
	"range_value" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_prerequisites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"artifact_id" text NOT NULL,
	"description" text NOT NULL,
	"kind" text,
	"required" integer NOT NULL DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_signals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"artifact_id" text NOT NULL,
	"pattern" text NOT NULL,
	"kind" text NOT NULL DEFAULT 'keyword',
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_exclusions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"artifact_id" text NOT NULL,
	"description" text NOT NULL,
	"kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_boundary_evidence" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
	"artifact_id" text NOT NULL,
	"kind" text NOT NULL,
	"identifier" text NOT NULL,
	"url" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "skill_artifact_agent_reviews" (
	"artifact_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"duplicate_risk" text NOT NULL,
	"correctness_risk" text NOT NULL,
	"completeness_risk" text NOT NULL,
	"checked_at" timestamp with time zone NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_artifact_metadata" (
	"artifact_id" text PRIMARY KEY NOT NULL,
	"source_kind" text NOT NULL,
	"submission_count" integer NOT NULL DEFAULT 0,
	"resubmission_count" integer NOT NULL DEFAULT 0,
	"revision_count" integer NOT NULL DEFAULT 0,
	"latest_submission_id" text,
	"latest_submitted_at" timestamp with time zone,
	"latest_reviewed_at" timestamp with time zone,
	"latest_decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifacts_scope_team_slug" ON "skill_artifacts" USING btree (COALESCE("team_id", '__global__'), "scope", "slug");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_files_artifact_revision" ON "skill_artifact_files" USING btree ("artifact_revision_id");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_files_artifact" ON "skill_artifact_files" USING btree ("artifact_id","revision_no");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_files_revision_path" ON "skill_artifact_files" USING btree ("artifact_revision_id","path");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_script_descriptors_revision" ON "skill_artifact_script_descriptors" USING btree ("artifact_revision_id");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_script_descriptors_artifact" ON "skill_artifact_script_descriptors" USING btree ("artifact_id","revision_no");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_script_descriptors_revision_path" ON "skill_artifact_script_descriptors" USING btree ("artifact_revision_id","path");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_profiles_artifact" ON "skill_artifact_profiles" USING btree ("artifact_id","revision_no");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_capsules_revision" ON "skill_artifact_capsules" USING btree ("artifact_revision_id");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_capsules_artifact" ON "skill_artifact_capsules" USING btree ("artifact_id","revision_no");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_client_manifests_artifact" ON "skill_artifact_client_manifests" USING btree ("artifact_id","revision_no");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_manifest_references_revision" ON "skill_artifact_manifest_references" USING btree ("artifact_revision_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_manifest_references_revision_path" ON "skill_artifact_manifest_references" USING btree ("artifact_revision_id","path");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_manifest_assets_revision" ON "skill_artifact_manifest_assets" USING btree ("artifact_revision_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_manifest_assets_revision_path" ON "skill_artifact_manifest_assets" USING btree ("artifact_revision_id","path");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_manifest_scripts_revision" ON "skill_artifact_manifest_scripts" USING btree ("artifact_revision_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_manifest_scripts_revision_path" ON "skill_artifact_manifest_scripts" USING btree ("artifact_revision_id","path");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_contexts_artifact" ON "skill_artifact_boundary_contexts" USING btree ("artifact_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_skill_artifact_boundary_contexts_artifact_value" ON "skill_artifact_boundary_contexts" USING btree ("artifact_id","context_value");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_versions_artifact" ON "skill_artifact_boundary_versions" USING btree ("artifact_id");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_prerequisites_artifact" ON "skill_artifact_boundary_prerequisites" USING btree ("artifact_id");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_signals_artifact" ON "skill_artifact_boundary_signals" USING btree ("artifact_id");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_exclusions_artifact" ON "skill_artifact_boundary_exclusions" USING btree ("artifact_id");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_boundary_evidence_artifact" ON "skill_artifact_boundary_evidence" USING btree ("artifact_id");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_maintenance_assignments_maintainer" ON "skill_artifact_maintenance_assignments" USING btree ("maintainer_user_id");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_maintenance_assignments_review_by" ON "skill_artifact_maintenance_assignments" USING btree ("review_by");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_agent_reviews_status" ON "skill_artifact_agent_reviews" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_skill_artifact_metadata_source_kind" ON "skill_artifact_metadata" USING btree ("source_kind");
--> statement-breakpoint
ALTER TABLE "skill_artifact_files" ADD CONSTRAINT "ck_skill_artifact_files_kind" CHECK ("skill_artifact_files"."kind" IN ('skill-markdown', 'reference', 'asset', 'script'));
--> statement-breakpoint
ALTER TABLE "skill_artifact_capsules" ADD CONSTRAINT "ck_skill_artifact_capsules_scope" CHECK ("skill_artifact_capsules"."scope" IN ('global', 'project'));
--> statement-breakpoint
ALTER TABLE "skill_artifact_agent_reviews" ADD CONSTRAINT "ck_skill_artifact_agent_reviews_status" CHECK ("skill_artifact_agent_reviews"."status" IN ('agent-pass', 'agent-rejected'));
--> statement-breakpoint
ALTER TABLE "skill_artifact_agent_reviews" ADD CONSTRAINT "ck_skill_artifact_agent_reviews_duplicate_risk" CHECK ("skill_artifact_agent_reviews"."duplicate_risk" IN ('low', 'medium', 'high'));
--> statement-breakpoint
ALTER TABLE "skill_artifact_agent_reviews" ADD CONSTRAINT "ck_skill_artifact_agent_reviews_correctness_risk" CHECK ("skill_artifact_agent_reviews"."correctness_risk" IN ('low', 'medium', 'high'));
--> statement-breakpoint
ALTER TABLE "skill_artifact_agent_reviews" ADD CONSTRAINT "ck_skill_artifact_agent_reviews_completeness_risk" CHECK ("skill_artifact_agent_reviews"."completeness_risk" IN ('low', 'medium', 'high'));
--> statement-breakpoint
ALTER TABLE "skill_artifact_metadata" ADD CONSTRAINT "ck_skill_artifact_metadata_source_kind" CHECK ("skill_artifact_metadata"."source_kind" IN ('skill-directory', 'single-skill-md', 'legacy-knowledge'));
--> statement-breakpoint
ALTER TABLE "skill_artifact_metadata" ADD CONSTRAINT "ck_skill_artifact_metadata_latest_decision" CHECK ("skill_artifact_metadata"."latest_decision" IS NULL OR "skill_artifact_metadata"."latest_decision" IN ('approve', 'reject'));
--> statement-breakpoint
ALTER TABLE "skill_artifact_files" ADD CONSTRAINT "fk_skill_artifact_files_revision" FOREIGN KEY ("artifact_revision_id") REFERENCES "artifact_revisions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_script_descriptors" ADD CONSTRAINT "fk_skill_artifact_script_descriptors_revision" FOREIGN KEY ("artifact_revision_id") REFERENCES "artifact_revisions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_profiles" ADD CONSTRAINT "fk_skill_artifact_profiles_revision" FOREIGN KEY ("artifact_revision_id") REFERENCES "artifact_revisions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_capsules" ADD CONSTRAINT "fk_skill_artifact_capsules_revision" FOREIGN KEY ("artifact_revision_id") REFERENCES "artifact_revisions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_client_manifests" ADD CONSTRAINT "fk_skill_artifact_client_manifests_revision" FOREIGN KEY ("artifact_revision_id") REFERENCES "artifact_revisions"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_manifest_references" ADD CONSTRAINT "fk_skill_artifact_manifest_references_revision" FOREIGN KEY ("artifact_revision_id") REFERENCES "skill_artifact_client_manifests"("artifact_revision_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_manifest_assets" ADD CONSTRAINT "fk_skill_artifact_manifest_assets_revision" FOREIGN KEY ("artifact_revision_id") REFERENCES "skill_artifact_client_manifests"("artifact_revision_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_manifest_scripts" ADD CONSTRAINT "fk_skill_artifact_manifest_scripts_revision" FOREIGN KEY ("artifact_revision_id") REFERENCES "skill_artifact_client_manifests"("artifact_revision_id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_boundary_contexts" ADD CONSTRAINT "fk_skill_artifact_boundary_contexts_artifact" FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_boundary_versions" ADD CONSTRAINT "fk_skill_artifact_boundary_versions_artifact" FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_boundary_prerequisites" ADD CONSTRAINT "fk_skill_artifact_boundary_prerequisites_artifact" FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_boundary_signals" ADD CONSTRAINT "fk_skill_artifact_boundary_signals_artifact" FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_boundary_exclusions" ADD CONSTRAINT "fk_skill_artifact_boundary_exclusions_artifact" FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_boundary_evidence" ADD CONSTRAINT "fk_skill_artifact_boundary_evidence_artifact" FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_maintenance_assignments" ADD CONSTRAINT "fk_skill_artifact_maintenance_assignments_artifact" FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_agent_reviews" ADD CONSTRAINT "fk_skill_artifact_agent_reviews_artifact" FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "skill_artifact_metadata" ADD CONSTRAINT "fk_skill_artifact_metadata_artifact" FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE CASCADE;
--> statement-breakpoint

INSERT INTO "skill_artifact_files" (
	"artifact_revision_id", "artifact_id", "revision_no", "path", "kind", "sha256", "size_bytes", "media_type", "source_group", "include_in_derivation", "activation_only"
)
SELECT
	ar.id,
	ar.artifact_id,
	ar.revision_no,
	elem->>'path',
	elem->>'kind',
	elem->>'sha256',
	COALESCE((elem->>'sizeBytes')::integer, 0),
	COALESCE(elem->>'mediaType', 'application/octet-stream'),
	COALESCE(elem->>'source', 'SKILL.md'),
	CASE WHEN COALESCE((elem->>'includeInDerivation')::boolean, false) THEN 1 ELSE 0 END,
	CASE WHEN COALESCE((elem->>'activationOnly')::boolean, false) THEN 1 ELSE 0 END
FROM "artifact_revisions" ar,
LATERAL jsonb_array_elements(ar.files) AS elem
ON CONFLICT ("artifact_revision_id","path") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_script_descriptors" (
	"artifact_revision_id", "artifact_id", "revision_no", "path", "sha256", "capability", "args_schema_summary", "side_effect_summary", "default_policy"
)
SELECT
	ar.id,
	ar.artifact_id,
	ar.revision_no,
	elem->>'path',
	elem->>'sha256',
	COALESCE(elem->>'capability', ''),
	COALESCE(elem->>'argsSchemaSummary', ''),
	COALESCE(elem->>'sideEffectSummary', ''),
	COALESCE(elem->>'defaultPolicy', 'manual')
FROM "artifact_revisions" ar,
LATERAL jsonb_array_elements(ar.script_descriptors) AS elem
ON CONFLICT ("artifact_revision_id","path") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_profiles" (
	"artifact_revision_id", "artifact_id", "revision_no", "source_hash", "title", "summary", "keywords", "reference_paths", "content_hash"
)
SELECT
	ar.id,
	ar.artifact_id,
	ar.revision_no,
	COALESCE(ar.derived->'profile'->>'sourceHash', ar.source_hash),
	ar.derived->'profile'->>'title',
	ar.derived->'profile'->>'summary',
	COALESCE(ar.derived->'profile'->'keywords', '[]'::jsonb),
	COALESCE(ar.derived->'profile'->'referencePaths', '[]'::jsonb),
	COALESCE(ar.derived->'profile'->>'contentHash', '')
FROM "artifact_revisions" ar
WHERE ar.derived IS NOT NULL AND ar.derived->'profile' IS NOT NULL
ON CONFLICT ("artifact_revision_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_capsules" (
	"capsule_id", "artifact_revision_id", "artifact_id", "revision_no", "source_hash", "source_paths", "content", "situation", "problem", "goal", "error_text", "contextual_prefix", "labels", "scope", "required_level"
)
SELECT
	elem->>'capsuleId',
	ar.id,
	ar.artifact_id,
	ar.revision_no,
	COALESCE(ar.derived->>'sourceHash', ar.source_hash),
	COALESCE(elem->'sourcePaths', '[]'::jsonb),
	COALESCE(elem->>'content', ''),
	COALESCE(elem->>'situation', ''),
	COALESCE(elem->>'problem', ''),
	COALESCE(elem->>'goal', ''),
	elem->>'errorText',
	elem->>'contextualPrefix',
	COALESCE(elem->'labels', '[]'::jsonb),
	COALESCE(elem->>'scope', 'global'),
	COALESCE((elem->>'requiredLevel')::integer, 0)
FROM "artifact_revisions" ar,
LATERAL jsonb_array_elements(COALESCE(ar.derived->'capsules', '[]'::jsonb)) AS elem
ON CONFLICT ("capsule_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_client_manifests" (
	"artifact_revision_id", "artifact_id", "revision_no", "source_hash"
)
SELECT
	ar.id,
	ar.artifact_id,
	ar.revision_no,
	COALESCE(ar.derived->'clientManifest'->>'sourceHash', ar.source_hash)
FROM "artifact_revisions" ar
WHERE ar.derived IS NOT NULL AND ar.derived->'clientManifest' IS NOT NULL
ON CONFLICT ("artifact_revision_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_manifest_references" (
	"artifact_revision_id", "path", "sha256", "size_bytes", "media_type"
)
SELECT
	ar.id,
	elem->>'path',
	elem->>'sha256',
	COALESCE((elem->>'sizeBytes')::integer, 0),
	COALESCE(elem->>'mediaType', 'application/octet-stream')
FROM "artifact_revisions" ar,
LATERAL jsonb_array_elements(COALESCE(ar.derived->'clientManifest'->'references', '[]'::jsonb)) AS elem
ON CONFLICT ("artifact_revision_id","path") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_manifest_assets" (
	"artifact_revision_id", "path", "sha256", "size_bytes", "media_type"
)
SELECT
	ar.id,
	elem->>'path',
	elem->>'sha256',
	COALESCE((elem->>'sizeBytes')::integer, 0),
	COALESCE(elem->>'mediaType', 'application/octet-stream')
FROM "artifact_revisions" ar,
LATERAL jsonb_array_elements(COALESCE(ar.derived->'clientManifest'->'assets', '[]'::jsonb)) AS elem
ON CONFLICT ("artifact_revision_id","path") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_manifest_scripts" (
	"artifact_revision_id", "path", "sha256", "capability", "args_schema_summary", "side_effect_summary", "default_policy"
)
SELECT
	ar.id,
	elem->>'path',
	elem->>'sha256',
	COALESCE(elem->>'capability', ''),
	COALESCE(elem->>'argsSchemaSummary', ''),
	COALESCE(elem->>'sideEffectSummary', ''),
	COALESCE(elem->>'defaultPolicy', 'manual')
FROM "artifact_revisions" ar,
LATERAL jsonb_array_elements(COALESCE(ar.derived->'clientManifest'->'scripts', '[]'::jsonb)) AS elem
ON CONFLICT ("artifact_revision_id","path") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_boundary_contexts" ("artifact_id", "context_value")
SELECT sa.id, jsonb_array_elements_text(sa.boundary->'context')
FROM "skill_artifacts" sa
WHERE sa.boundary IS NOT NULL AND sa.boundary->'context' IS NOT NULL AND jsonb_array_length(sa.boundary->'context') > 0
ON CONFLICT ("artifact_id","context_value") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_boundary_versions" ("artifact_id", "package_name", "range_value", "note")
SELECT sa.id, elem->>'package', elem->>'range', elem->>'note'
FROM "skill_artifacts" sa, jsonb_array_elements(sa.boundary->'versions') AS elem
WHERE sa.boundary IS NOT NULL AND sa.boundary->'versions' IS NOT NULL AND jsonb_array_length(sa.boundary->'versions') > 0;
--> statement-breakpoint

INSERT INTO "skill_artifact_boundary_prerequisites" ("artifact_id", "description", "kind", "required")
SELECT sa.id, elem->>'description', elem->>'kind', CASE WHEN COALESCE((elem->>'required')::boolean, true) THEN 1 ELSE 0 END
FROM "skill_artifacts" sa, jsonb_array_elements(sa.boundary->'prerequisites') AS elem
WHERE sa.boundary IS NOT NULL AND sa.boundary->'prerequisites' IS NOT NULL AND jsonb_array_length(sa.boundary->'prerequisites') > 0;
--> statement-breakpoint

INSERT INTO "skill_artifact_boundary_signals" ("artifact_id", "pattern", "kind", "description")
SELECT sa.id, elem->>'pattern', COALESCE(elem->>'kind', 'keyword'), elem->>'description'
FROM "skill_artifacts" sa, jsonb_array_elements(sa.boundary->'signals') AS elem
WHERE sa.boundary IS NOT NULL AND sa.boundary->'signals' IS NOT NULL AND jsonb_array_length(sa.boundary->'signals') > 0;
--> statement-breakpoint

INSERT INTO "skill_artifact_boundary_exclusions" ("artifact_id", "description", "kind")
SELECT sa.id, elem->>'description', elem->>'kind'
FROM "skill_artifacts" sa, jsonb_array_elements(sa.boundary->'exclusions') AS elem
WHERE sa.boundary IS NOT NULL AND sa.boundary->'exclusions' IS NOT NULL AND jsonb_array_length(sa.boundary->'exclusions') > 0;
--> statement-breakpoint

INSERT INTO "skill_artifact_boundary_evidence" ("artifact_id", "kind", "identifier", "url", "note")
SELECT sa.id, elem->>'kind', elem->>'identifier', elem->>'url', elem->>'note'
FROM "skill_artifacts" sa, jsonb_array_elements(sa.boundary->'evidence') AS elem
WHERE sa.boundary IS NOT NULL AND sa.boundary->'evidence' IS NOT NULL AND jsonb_array_length(sa.boundary->'evidence') > 0;
--> statement-breakpoint

INSERT INTO "skill_artifact_maintenance_assignments" (
	"artifact_id", "maintainer_user_id", "maintainer_handle", "maintainer_level", "review_by"
)
SELECT
	sa.id,
	sa.maintenance_meta->>'maintainerUserId',
	sa.maintenance_meta->>'maintainerHandle',
	CASE WHEN sa.maintenance_meta->>'maintainerLevel' IS NOT NULL THEN (sa.maintenance_meta->>'maintainerLevel')::integer ELSE NULL END,
	CASE WHEN sa.maintenance_meta->>'reviewBy' IS NOT NULL THEN (sa.maintenance_meta->>'reviewBy')::timestamptz ELSE NULL END
FROM "skill_artifacts" sa
WHERE sa.maintenance_meta IS NOT NULL
ON CONFLICT ("artifact_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_agent_reviews" (
	"artifact_id", "status", "duplicate_risk", "correctness_risk", "completeness_risk", "checked_at", "notes"
)
SELECT
	sa.id,
	sa.agent_review->>'status',
	sa.agent_review->>'duplicateRisk',
	sa.agent_review->>'correctnessRisk',
	sa.agent_review->>'completenessRisk',
	(sa.agent_review->>'checkedAt')::timestamptz,
	COALESCE(sa.agent_review->'notes', '[]'::jsonb)
FROM "skill_artifacts" sa
WHERE sa.agent_review IS NOT NULL
ON CONFLICT ("artifact_id") DO NOTHING;
--> statement-breakpoint

INSERT INTO "skill_artifact_metadata" (
	"artifact_id", "source_kind", "submission_count", "resubmission_count", "revision_count", "latest_submission_id", "latest_submitted_at", "latest_reviewed_at", "latest_decision"
)
SELECT
	sa.id,
	sa.metadata->>'sourceKind',
	COALESCE((sa.metadata->>'submissionCount')::integer, 0),
	COALESCE((sa.metadata->>'resubmissionCount')::integer, 0),
	COALESCE((sa.metadata->>'revisionCount')::integer, 0),
	sa.metadata->>'latestSubmissionId',
	CASE WHEN sa.metadata->>'latestSubmittedAt' IS NOT NULL THEN (sa.metadata->>'latestSubmittedAt')::timestamptz ELSE NULL END,
	CASE WHEN sa.metadata->>'latestReviewedAt' IS NOT NULL THEN (sa.metadata->>'latestReviewedAt')::timestamptz ELSE NULL END,
	sa.metadata->>'latestDecision'
FROM "skill_artifacts" sa
WHERE sa.metadata IS NOT NULL
ON CONFLICT ("artifact_id") DO NOTHING;
