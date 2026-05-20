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
CREATE INDEX "idx_knowledge_boundary_contexts_entry" ON "knowledge_boundary_contexts" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_boundary_contexts_entry_value" ON "knowledge_boundary_contexts" USING btree ("entry_id","context_value");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_evidence_entry" ON "knowledge_boundary_evidence" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_exclusions_entry" ON "knowledge_boundary_exclusions" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_prerequisites_entry" ON "knowledge_boundary_prerequisites" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_signals_entry" ON "knowledge_boundary_signals" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_boundary_versions_entry" ON "knowledge_boundary_versions" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_labels_entry_label" ON "knowledge_labels" USING btree ("entry_id","label");--> statement-breakpoint
CREATE INDEX "idx_knowledge_labels_label" ON "knowledge_labels" USING btree ("label");--> statement-breakpoint
CREATE INDEX "idx_knowledge_maintenance_assignments_maintainer" ON "knowledge_maintenance_assignments" USING btree ("maintainer_user_id");--> statement-breakpoint
CREATE INDEX "idx_knowledge_maintenance_assignments_review_by" ON "knowledge_maintenance_assignments" USING btree ("review_by");--> statement-breakpoint
CREATE INDEX "idx_knowledge_entries_scope_level" ON "knowledge_entries" USING btree ("scope","required_level");--> statement-breakpoint
CREATE INDEX "idx_knowledge_entries_owner" ON "knowledge_entries" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_revisions_entry_revision" ON "knowledge_revisions" USING btree ("entry_id","revision");--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "ck_knowledge_entries_scope" CHECK ("knowledge_entries"."scope" IN ('global', 'project'));--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "ck_knowledge_entries_lifecycle_state" CHECK ("knowledge_entries"."lifecycle_state" IN ('draft', 'submitted', 'agent-pass', 'agent-rejected', 'approved', 'rejected', 'deactivated'));--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "ck_knowledge_entries_required_level" CHECK ("knowledge_entries"."required_level" >= 0 AND "knowledge_entries"."required_level" <= 10);--> statement-breakpoint
ALTER TABLE "lifecycle_events" ADD CONSTRAINT "ck_lifecycle_events_type" CHECK ("lifecycle_events"."type" IN ('submitted', 'resubmitted', 'agent-reviewed', 'reviewer-approved', 'reviewer-rejected', 'updated', 'deactivated'));
--> statement-breakpoint

-- =============================================================================
-- Backfill structured tables from existing JSONB data
-- =============================================================================

-- Backfill knowledge_labels from knowledge_entries.labels JSONB array
INSERT INTO knowledge_labels (entry_id, label)
SELECT id, jsonb_array_elements_text(labels)
FROM knowledge_entries
WHERE labels IS NOT NULL AND jsonb_array_length(labels) > 0
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Backfill knowledge_boundary_contexts from knowledge_entries.boundary JSONB
INSERT INTO knowledge_boundary_contexts (entry_id, context_value)
SELECT id, jsonb_array_elements_text(boundary->'context')
FROM knowledge_entries
WHERE boundary IS NOT NULL AND boundary->'context' IS NOT NULL AND jsonb_array_length(boundary->'context') > 0
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Backfill knowledge_boundary_versions from knowledge_entries.boundary JSONB
INSERT INTO knowledge_boundary_versions (entry_id, package_name, range_value, note)
SELECT id, elem->>'package', elem->>'range', NULLIF(elem->>'note', '')
FROM knowledge_entries, jsonb_array_elements(boundary->'versions') AS elem
WHERE boundary IS NOT NULL AND boundary->'versions' IS NOT NULL AND jsonb_array_length(boundary->'versions') > 0;
--> statement-breakpoint

-- Backfill knowledge_boundary_prerequisites from knowledge_entries.boundary JSONB
INSERT INTO knowledge_boundary_prerequisites (entry_id, description, kind, required)
SELECT id, elem->>'description', NULLIF(elem->>'kind', ''),
  CASE WHEN (elem->>'required')::boolean THEN 1 ELSE 0 END
FROM knowledge_entries, jsonb_array_elements(boundary->'prerequisites') AS elem
WHERE boundary IS NOT NULL AND boundary->'prerequisites' IS NOT NULL AND jsonb_array_length(boundary->'prerequisites') > 0;
--> statement-breakpoint

-- Backfill knowledge_boundary_signals from knowledge_entries.boundary JSONB
INSERT INTO knowledge_boundary_signals (entry_id, pattern, kind, description)
SELECT id, elem->>'pattern', COALESCE(elem->>'kind', 'keyword'), NULLIF(elem->>'description', '')
FROM knowledge_entries, jsonb_array_elements(boundary->'signals') AS elem
WHERE boundary IS NOT NULL AND boundary->'signals' IS NOT NULL AND jsonb_array_length(boundary->'signals') > 0;
--> statement-breakpoint

-- Backfill knowledge_boundary_exclusions from knowledge_entries.boundary JSONB
INSERT INTO knowledge_boundary_exclusions (entry_id, description, kind)
SELECT id, elem->>'description', NULLIF(elem->>'kind', '')
FROM knowledge_entries, jsonb_array_elements(boundary->'exclusions') AS elem
WHERE boundary IS NOT NULL AND boundary->'exclusions' IS NOT NULL AND jsonb_array_length(boundary->'exclusions') > 0;
--> statement-breakpoint

-- Backfill knowledge_boundary_evidence from knowledge_entries.boundary JSONB
INSERT INTO knowledge_boundary_evidence (entry_id, kind, identifier, url, note)
SELECT id, elem->>'kind', elem->>'identifier', NULLIF(elem->>'url', ''), NULLIF(elem->>'note', '')
FROM knowledge_entries, jsonb_array_elements(boundary->'evidence') AS elem
WHERE boundary IS NOT NULL AND boundary->'evidence' IS NOT NULL AND jsonb_array_length(boundary->'evidence') > 0;
--> statement-breakpoint

-- Backfill knowledge_maintenance_assignments from knowledge_entries.maintenance_meta JSONB
INSERT INTO knowledge_maintenance_assignments (entry_id, maintainer_user_id, maintainer_handle, maintainer_level, review_by)
SELECT id, maintenance_meta->>'maintainerUserId', maintenance_meta->>'maintainerHandle',
  (maintenance_meta->>'maintainerLevel')::integer,
  CASE WHEN maintenance_meta->>'reviewBy' IS NOT NULL THEN (maintenance_meta->>'reviewBy')::timestamptz ELSE NULL END
FROM knowledge_entries
WHERE maintenance_meta IS NOT NULL;