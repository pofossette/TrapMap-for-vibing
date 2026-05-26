-- Round 10: Read Model Cleanup - Phase 4
-- Goal: Fix duplicate similarity precision, align skill_artifacts unique index.
--
-- Changes:
--   1. candidate_duplicate_cases.highest_similarity: integer → real (store float directly)
--   2. candidate_duplicate_matches.similarity_score: integer → real (store float directly)
--   3. Add unique index on skill_artifacts (COALESCE(team_id,'__global__'), scope, slug)
--      if not already present (aligns Drizzle schema with migration 0007)
--
-- Rollback:
--   ALTER COLUMN highest_similarity TYPE integer USING ROUND(highest_similarity * 100);
--   ALTER COLUMN similarity_score TYPE integer USING ROUND(similarity_score * 100);
--   DROP INDEX IF EXISTS idx_skill_artifacts_scope_team_slug;

-- =============================================================================
-- 1. Convert similarity scores from scaled integer to native real
-- =============================================================================
ALTER TABLE candidate_duplicate_cases
  ALTER COLUMN highest_similarity TYPE real
  USING highest_similarity / 100.0;

ALTER TABLE candidate_duplicate_matches
  ALTER COLUMN similarity_score TYPE real
  USING similarity_score / 100.0;

-- =============================================================================
-- 2. Add scope + team + slug unique index on skill_artifacts (align with Drizzle)
-- =============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS "idx_skill_artifacts_scope_team_slug"
  ON "skill_artifacts" USING btree (COALESCE("team_id", '__global__'), "scope", "slug");
