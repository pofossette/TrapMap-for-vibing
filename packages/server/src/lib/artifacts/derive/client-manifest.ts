/**
 * Client activation manifest builder.
 *
 * T-12-10: expose assets/ and scripts/ through clientManifest metadata only
 * T-12-10: scripts are metadata-only (no bodies)
 */

import type {
  ClientManifestAssetRecord,
  ClientManifestRecord,
  ClientManifestReferenceRecord,
  ClientManifestScriptRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  SkillScriptDescriptorRecord,
} from '@trapmap/server/lib/store.js';
import { getFilesBySource } from './extract-files.js';

/**
 * Build client activation manifest for references, assets, and scripts.
 *
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision
 * @param sourceHash - Hash of all source files for this manifest
 * @returns Client activation manifest
 */
export function buildClientManifest(
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
  sourceHash: string,
): ClientManifestRecord | null {
  const referenceFiles = getFilesBySource(revision, 'references/');
  const assetFiles = getFilesBySource(revision, 'assets/');
  const scriptFiles = getFilesBySource(revision, 'scripts/');

  if (referenceFiles.length === 0 && assetFiles.length === 0 && scriptFiles.length === 0) {
    return null;
  }

  // Build reference metadata
  const references: ClientManifestReferenceRecord[] = referenceFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({
      path: f.path,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mediaType: f.mediaType,
    }));

  // Build asset metadata (T-12-10: metadata only)
  const assets: ClientManifestAssetRecord[] = assetFiles
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => ({
      path: f.path,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mediaType: f.mediaType,
    }));

  // Build script metadata (T-12-10: capability only, no bodies)
  const scripts: ClientManifestScriptRecord[] = revision.scriptDescriptors
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((d: SkillScriptDescriptorRecord) => ({
      path: d.path,
      sha256: d.sha256,
      capability: d.capability,
      argsSchemaSummary: d.argsSchemaSummary,
      sideEffectSummary: d.sideEffectSummary,
      defaultPolicy: d.defaultPolicy,
    }));

  return {
    artifactId: artifact.id,
    revision: revision.revision,
    references,
    assets,
    scripts,
    sourceHash,
  };
}
