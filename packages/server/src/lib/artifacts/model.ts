/**
 * Skill artifact model and persistence layer.
 *
 * @module artifacts/model
 * @see ./model/ — sub-modules for each responsibility
 *
 * Re-exports for backward compatibility:
 * - createSkillArtifactRecord(): Create a new artifact aggregate
 * - appendSkillArtifactRevision(): Add a new revision to an existing artifact
 * - toSkillArtifact(): Serialize server record to shared contract
 * - applyDerivedArtifactOutputs(): Apply derived outputs to a revision
 */

export {
  createSkillArtifactRecord,
  appendSkillArtifactRevision,
  toSkillArtifact,
  applyDerivedArtifactOutputs,
} from './model/index.js';
