-- Round 11: DiveLog fields on knowledge_entries
-- Goal: Add structured DiveLog columns for raw content, parsed blocks,
--        dive site metadata, template binding, and UI pin/archive state.

-- 1. New columns (all nullable except pinned/archived which have defaults)
ALTER TABLE "knowledge_entries"
  ADD COLUMN IF NOT EXISTS "dive_log_id"      text,
  ADD COLUMN IF NOT EXISTS "dive_site"         text,
  ADD COLUMN IF NOT EXISTS "slang_level"       text,
  ADD COLUMN IF NOT EXISTS "raw_content"       text,
  ADD COLUMN IF NOT EXISTS "parsed_blocks"     jsonb,
  ADD COLUMN IF NOT EXISTS "template_id"       text,
  ADD COLUMN IF NOT EXISTS "pinned"            integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "archived"          integer NOT NULL DEFAULT 0;

-- 2. Index for stable DiveLog document lookups
CREATE INDEX IF NOT EXISTS "idx_knowledge_entries_dive_log_id"
  ON "knowledge_entries" ("dive_log_id");
