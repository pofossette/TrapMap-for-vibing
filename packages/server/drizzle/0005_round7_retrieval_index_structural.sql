-- =============================================================================
-- Round 7: Retrieval Index Model Optimization
-- Convert JSONB token/label columns to native PostgreSQL text[] types.
-- Add knowledge_search_documents (tsvector) and graph_index_documents tables.
-- =============================================================================

-- =============================================================================
-- 1. knowledge_keywords: Convert tokens from jsonb to text[]
-- =============================================================================

-- Add new text[] column for tokens
ALTER TABLE "knowledge_keywords" ADD COLUMN "tokens_new" text[] DEFAULT '{}' NOT NULL;

-- Backfill from jsonb array to text[]
UPDATE "knowledge_keywords"
SET "tokens_new" = ARRAY(
  SELECT jsonb_array_elements_text("tokens")
)
WHERE "tokens" IS NOT NULL
  AND jsonb_array_length("tokens") > 0;

-- Drop old jsonb column and its GIN index (index drops automatically with column)
ALTER TABLE "knowledge_keywords" DROP COLUMN "tokens";

-- Rename new column to original name
ALTER TABLE "knowledge_keywords" RENAME COLUMN "tokens_new" TO "tokens";

-- Recreate GIN index on text[] column
CREATE INDEX "idx_knowledge_keywords_tokens_gin" ON "knowledge_keywords" USING gin ("tokens");

-- =============================================================================
-- 2. knowledge_keywords: Split field_tokens jsonb into three text[] columns
-- =============================================================================

-- Add new text[] columns
ALTER TABLE "knowledge_keywords" ADD COLUMN "field_tokens_shortcut" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "knowledge_keywords" ADD COLUMN "field_tokens_detail" text[] DEFAULT '{}' NOT NULL;
ALTER TABLE "knowledge_keywords" ADD COLUMN "field_tokens_labels" text[] DEFAULT '{}' NOT NULL;

-- Backfill from jsonb object to text[] columns
UPDATE "knowledge_keywords"
SET
  "field_tokens_shortcut" = ARRAY(
    SELECT jsonb_array_elements_text("field_tokens"->'shortcut')
  ),
  "field_tokens_detail" = ARRAY(
    SELECT jsonb_array_elements_text("field_tokens"->'detail')
  ),
  "field_tokens_labels" = ARRAY(
    SELECT jsonb_array_elements_text("field_tokens"->'labels')
  )
WHERE "field_tokens" IS NOT NULL;

-- Drop old jsonb column
ALTER TABLE "knowledge_keywords" DROP COLUMN "field_tokens";

-- =============================================================================
-- 3. knowledge_embeddings: Convert labels from jsonb to text[]
-- =============================================================================

-- Add new text[] column
ALTER TABLE "knowledge_embeddings" ADD COLUMN "labels_new" text[] DEFAULT '{}' NOT NULL;

-- Backfill from jsonb array to text[]
UPDATE "knowledge_embeddings"
SET "labels_new" = ARRAY(
  SELECT jsonb_array_elements_text("labels")
)
WHERE "labels" IS NOT NULL
  AND jsonb_array_length("labels") > 0;

-- Drop old jsonb column
ALTER TABLE "knowledge_embeddings" DROP COLUMN "labels";

-- Rename new column to original name
ALTER TABLE "knowledge_embeddings" RENAME COLUMN "labels_new" TO "labels";

-- =============================================================================
-- 4. knowledge_search_documents: tsvector full-text search table
-- =============================================================================

CREATE TABLE "knowledge_search_documents" (
  "entry_id" text NOT NULL,
  "revision_no" integer NOT NULL,
  "document" tsvector NOT NULL,
  "labels" text[] DEFAULT '{}' NOT NULL,
  "status" text DEFAULT 'synced' NOT NULL,
  "last_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_search_documents_pkey" PRIMARY KEY ("entry_id", "revision_no")
);

-- GIN index on tsvector for full-text search
CREATE INDEX "idx_knowledge_search_documents_gin"
  ON "knowledge_search_documents" USING gin ("document");

-- Index on entry_id for sync lookups
CREATE INDEX "idx_knowledge_search_documents_entry"
  ON "knowledge_search_documents" USING btree ("entry_id");

-- Backfill from knowledge_entries + knowledge_labels
INSERT INTO "knowledge_search_documents" (entry_id, revision_no, document, labels, status)
SELECT
  ke.id AS entry_id,
  COALESCE(kr.revision, 1) AS revision_no,
  setweight(to_tsvector('english', COALESCE(ke.shortcut, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(ke.detail, '')), 'B') ||
    setweight(to_tsvector('english', (
      SELECT string_agg(kl.label, ' ')
      FROM knowledge_labels kl
      WHERE kl.entry_id = ke.id
    )), 'C') AS document,
  COALESCE(
    ARRAY(SELECT kl.label FROM knowledge_labels kl WHERE kl.entry_id = ke.id ORDER BY kl.label),
    '{}'::text[]
  ) AS labels,
  'synced' AS status
FROM knowledge_entries ke
LEFT JOIN LATERAL (
  SELECT MAX(revision) AS revision
  FROM knowledge_revisions kr
  WHERE kr.entry_id = ke.id
) kr ON true
ON CONFLICT (entry_id, revision_no) DO NOTHING;

-- =============================================================================
-- 5. graph_index_documents: GraphRAG-lite persistence table
-- =============================================================================

CREATE TABLE "graph_index_documents" (
  "id" text PRIMARY KEY NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "revision" integer NOT NULL,
  "content_hash" text NOT NULL,
  "team_id" text,
  "scope" text NOT NULL,
  "required_level" integer DEFAULT 0 NOT NULL,
  "nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "edges" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidence" text DEFAULT '' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_graph_index_documents_source_type" CHECK ("source_type" IN ('trap', 'skill')),
  CONSTRAINT "ck_graph_index_documents_scope" CHECK ("scope" IN ('global', 'project'))
);

-- Indexes for graph index queries
CREATE INDEX "idx_graph_index_documents_source"
  ON "graph_index_documents" USING btree ("source_type", "source_id");

CREATE UNIQUE INDEX "idx_graph_index_documents_source_revision"
  ON "graph_index_documents" USING btree ("source_type", "source_id", "revision");

CREATE INDEX "idx_graph_index_documents_team"
  ON "graph_index_documents" USING btree ("team_id");

-- Backfill graph index documents from store_snapshot JSONB
-- The graphIndexDocuments array in store_snapshot contains full document records
INSERT INTO "graph_index_documents" (
  id, source_type, source_id, revision, content_hash,
  team_id, scope, required_level, nodes, edges, evidence,
  created_at, updated_at
)
SELECT
  doc->>'id',
  doc->>'sourceType',
  doc->>'sourceId',
  (doc->>'revision')::integer,
  doc->>'contentHash',
  doc->>'teamId',
  doc->>'scope',
  COALESCE((doc->>'requiredLevel')::integer, 0),
  COALESCE(doc->'nodes', '[]'::jsonb),
  COALESCE(doc->'edges', '[]'::jsonb),
  COALESCE(doc->>'evidence', ''),
  COALESCE((doc->>'createdAt')::timestamptz, now()),
  COALESCE((doc->>'updatedAt')::timestamptz, now())
FROM store_snapshot,
  jsonb_array_elements(data->'graphIndexDocuments') AS doc
WHERE data->'graphIndexDocuments' IS NOT NULL
  AND jsonb_array_length(data->'graphIndexDocuments') > 0
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 6. Sync status indexes for operational monitoring
-- =============================================================================

-- Index on knowledge_search_documents status for monitoring stale/failed entries
CREATE INDEX "idx_knowledge_search_documents_status"
  ON "knowledge_search_documents" USING btree ("status");

-- Index on knowledge_keywords status for monitoring (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'knowledge_keywords'
    AND indexname = 'idx_knowledge_keywords_status'
  ) THEN
    CREATE INDEX "idx_knowledge_keywords_status"
      ON "knowledge_keywords" USING btree ("status");
  END IF;
END $$;

-- Index on knowledge_embeddings status for monitoring (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'knowledge_embeddings'
    AND indexname = 'idx_knowledge_embeddings_status'
  ) THEN
    CREATE INDEX "idx_knowledge_embeddings_status"
      ON "knowledge_embeddings" USING btree ("status");
  END IF;
END $$;
