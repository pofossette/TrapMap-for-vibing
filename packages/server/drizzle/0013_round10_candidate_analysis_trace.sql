-- Round 10: Candidate duplicate-path observability
-- Goal: Persist duplicate detector trace metadata alongside analysis snapshots

ALTER TABLE "candidate_analyses"
ADD COLUMN IF NOT EXISTS "duplicate_trace" JSONB;

