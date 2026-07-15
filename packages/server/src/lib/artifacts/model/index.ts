/**
 * Skill artifact model — barrel re-export.
 *
 * Sub-modules:
 * - helpers.ts   : Store lookups, actor refs, record-to-contract converters
 * - commands.ts  : createSkillArtifactRecord, appendSkillArtifactRevision
 * - serialize.ts : toSkillArtifact (server record -> shared contract)
 * - derive.ts    : applyDerivedArtifactOutputs
 */

export { toSkillArtifact } from './serialize.js';
