-- Round 8: Naming Convention Alignment & Constraint Cleanup
-- Renames columns to match plan.md conventions:
--   revision → revision_no (7 tables)
--   submitted_by → submitted_by_user_id (2 tables)
-- Also renames indexes for consistency.

-- =============================================================================
-- 1. Rename revision → revision_no
-- =============================================================================

-- knowledge_embeddings
ALTER TABLE "knowledge_embeddings" RENAME COLUMN "revision" TO "revision_no";
ALTER INDEX "knowledge_embeddings_entry_revision_idx" RENAME TO "knowledge_embeddings_entry_revision_no_idx";

-- knowledge_keywords
ALTER TABLE "knowledge_keywords" RENAME COLUMN "revision" TO "revision_no";
ALTER INDEX "knowledge_keywords_entry_revision_idx" RENAME TO "knowledge_keywords_entry_revision_no_idx";

-- knowledge_revisions
ALTER TABLE "knowledge_revisions" RENAME COLUMN "revision" TO "revision_no";
ALTER INDEX "idx_knowledge_revisions_entry_revision" RENAME TO "idx_knowledge_revisions_entry_revision_no";

-- lifecycle_events
ALTER TABLE "lifecycle_events" RENAME COLUMN "revision" TO "revision_no";

-- artifact_revisions
ALTER TABLE "artifact_revisions" RENAME COLUMN "revision" TO "revision_no";
ALTER INDEX "idx_artifact_revisions_artifact_revision" RENAME TO "idx_artifact_revisions_artifact_revision_no";

-- artifact_lifecycle_events
ALTER TABLE "artifact_lifecycle_events" RENAME COLUMN "revision" TO "revision_no";

-- graph_index_documents
ALTER TABLE "graph_index_documents" RENAME COLUMN "revision" TO "revision_no";
ALTER INDEX "idx_graph_index_documents_source_revision" RENAME TO "idx_graph_index_documents_source_revision_no";

-- =============================================================================
-- 2. Rename submitted_by → submitted_by_user_id
-- =============================================================================

-- candidates
ALTER TABLE "candidates" RENAME COLUMN "submitted_by" TO "submitted_by_user_id";

-- candidate_manual_results
ALTER TABLE "candidate_manual_results" RENAME COLUMN "submitted_by" TO "submitted_by_user_id";

-- =============================================================================
-- 3. Index names in schema.ts must match after rename.
--    Verify with: SELECT indexname FROM pg_indexes WHERE tablename IN
--    ('knowledge_embeddings','knowledge_keywords','knowledge_revisions',
--     'artifact_revisions','graph_index_documents');
-- =============================================================================

-- =============================================================================
-- 4. Add missing foreign key constraints
-- =============================================================================

-- Knowledge domain: derived index tables → knowledge_entries (CASCADE on delete)
ALTER TABLE "knowledge_embeddings"
  ADD CONSTRAINT "fk_knowledge_embeddings_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

ALTER TABLE "knowledge_keywords"
  ADD CONSTRAINT "fk_knowledge_keywords_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

ALTER TABLE "knowledge_search_documents"
  ADD CONSTRAINT "fk_knowledge_search_documents_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

-- Knowledge domain: boundary sub-tables → knowledge_entries (CASCADE on delete)
ALTER TABLE "knowledge_labels"
  ADD CONSTRAINT "fk_knowledge_labels_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

ALTER TABLE "knowledge_boundary_contexts"
  ADD CONSTRAINT "fk_knowledge_boundary_contexts_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

ALTER TABLE "knowledge_boundary_versions"
  ADD CONSTRAINT "fk_knowledge_boundary_versions_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

ALTER TABLE "knowledge_boundary_prerequisites"
  ADD CONSTRAINT "fk_knowledge_boundary_prerequisites_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

ALTER TABLE "knowledge_boundary_signals"
  ADD CONSTRAINT "fk_knowledge_boundary_signals_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

ALTER TABLE "knowledge_boundary_exclusions"
  ADD CONSTRAINT "fk_knowledge_boundary_exclusions_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

ALTER TABLE "knowledge_boundary_evidence"
  ADD CONSTRAINT "fk_knowledge_boundary_evidence_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

ALTER TABLE "knowledge_maintenance_assignments"
  ADD CONSTRAINT "fk_knowledge_maintenance_assignments_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE;

-- Knowledge domain: history tables → knowledge_entries (RESTRICT to preserve history)
ALTER TABLE "knowledge_revisions"
  ADD CONSTRAINT "fk_knowledge_revisions_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE RESTRICT;

ALTER TABLE "lifecycle_events"
  ADD CONSTRAINT "fk_lifecycle_events_entry"
  FOREIGN KEY ("entry_id") REFERENCES "knowledge_entries"("id") ON DELETE RESTRICT;

-- Skill artifact domain: history tables → skill_artifacts
ALTER TABLE "artifact_revisions"
  ADD CONSTRAINT "fk_artifact_revisions_artifact"
  FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE RESTRICT;

ALTER TABLE "artifact_lifecycle_events"
  ADD CONSTRAINT "fk_artifact_lifecycle_events_artifact"
  FOREIGN KEY ("artifact_id") REFERENCES "skill_artifacts"("id") ON DELETE RESTRICT;

-- Candidate domain: sub-tables → candidates (CASCADE on delete)
ALTER TABLE "candidate_analyses"
  ADD CONSTRAINT "fk_candidate_analyses_candidate"
  FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE;

ALTER TABLE "candidate_duplicate_cases"
  ADD CONSTRAINT "fk_candidate_duplicate_cases_candidate"
  FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE;

ALTER TABLE "candidate_manual_results"
  ADD CONSTRAINT "fk_candidate_manual_results_candidate"
  FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE;

ALTER TABLE "candidate_resolution_outcomes"
  ADD CONSTRAINT "fk_candidate_resolution_outcomes_candidate"
  FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE CASCADE;

-- Candidate duplicate matches → candidate_duplicate_cases (CASCADE on delete)
ALTER TABLE "candidate_duplicate_matches"
  ADD CONSTRAINT "fk_candidate_duplicate_matches_case"
  FOREIGN KEY ("duplicate_case_id") REFERENCES "candidate_duplicate_cases"("id") ON DELETE CASCADE;

-- Feedback domain: custom answers → feedback_records (CASCADE on delete)
ALTER TABLE "feedback_custom_answers"
  ADD CONSTRAINT "fk_feedback_custom_answers_feedback"
  FOREIGN KEY ("feedback_id") REFERENCES "feedback_records"("id") ON DELETE CASCADE;
