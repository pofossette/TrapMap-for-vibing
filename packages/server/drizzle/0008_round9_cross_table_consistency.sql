-- Round 9: Cross-table Consistency Constraints for Skill Artifact Domain
-- Phase 3 of Round 4+ implementation plan
--
-- DB-layer constraints added:
--   3.1 Composite FKs: (artifact_id, revision_no) → artifact_revisions(parent)
--      Ensures derived tables never reference mismatched artifact_id / revision_no
--   3.2 Additional CHECK constraints for data quality
--      - skill_artifact_profiles.revision_no > 0
--      - skill_artifact_capsules.required_level IN [0,10]
--
-- 3.3 Root-level governance FKs already exist in 0006/0007:
--      - skill_artifact_metadata.artifact_id → skill_artifacts.id ✅
--      - skill_artifact_maintenance_assignments.artifact_id → skill_artifacts.id ✅
--      - skill_artifact_agent_reviews.artifact_id → skill_artifacts.id ✅
--    revision_count sync handled at repository layer (not DB trigger)
--
-- 3.1 capsule_id uniqueness already enforced by PRIMARY KEY on skill_artifact_capsules
--
-- 3.2 Manifest sub-item FKs already exist in 0007:
--      - manifest_references → client_manifests ✅
--      - manifest_assets → client_manifests ✅
--      - manifest_scripts → client_manifests ✅

-- =============================================================================
-- 3.1 Composite FKs: (artifact_id, revision_no) → artifact_revisions
-- =============================================================================

ALTER TABLE "skill_artifact_files"
  ADD CONSTRAINT "fk_saf_artifact_revision_composite"
  FOREIGN KEY ("artifact_id", "revision_no")
  REFERENCES "artifact_revisions"("artifact_id", "revision_no") ON DELETE CASCADE;

ALTER TABLE "skill_artifact_script_descriptors"
  ADD CONSTRAINT "fk_sasd_artifact_revision_composite"
  FOREIGN KEY ("artifact_id", "revision_no")
  REFERENCES "artifact_revisions"("artifact_id", "revision_no") ON DELETE CASCADE;

ALTER TABLE "skill_artifact_profiles"
  ADD CONSTRAINT "fk_sap_artifact_revision_composite"
  FOREIGN KEY ("artifact_id", "revision_no")
  REFERENCES "artifact_revisions"("artifact_id", "revision_no") ON DELETE CASCADE;

ALTER TABLE "skill_artifact_capsules"
  ADD CONSTRAINT "fk_sac_artifact_revision_composite"
  FOREIGN KEY ("artifact_id", "revision_no")
  REFERENCES "artifact_revisions"("artifact_id", "revision_no") ON DELETE CASCADE;

ALTER TABLE "skill_artifact_client_manifests"
  ADD CONSTRAINT "fk_sacm_artifact_revision_composite"
  FOREIGN KEY ("artifact_id", "revision_no")
  REFERENCES "artifact_revisions"("artifact_id", "revision_no") ON DELETE CASCADE;

-- =============================================================================
-- 3.2 Additional CHECK constraints
-- =============================================================================

ALTER TABLE "skill_artifact_profiles"
  ADD CONSTRAINT "ck_skill_artifact_profiles_revision_no"
  CHECK ("revision_no" > 0);

ALTER TABLE "skill_artifact_capsules"
  ADD CONSTRAINT "ck_skill_artifact_capsules_required_level"
  CHECK ("required_level" >= 0 AND "required_level" <= 10);
