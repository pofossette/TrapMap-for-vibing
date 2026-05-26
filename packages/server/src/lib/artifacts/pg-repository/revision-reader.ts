/**
 * Structured revision data loading from PostgreSQL.
 *
 * Loads files, script descriptors, profiles, capsules, and client manifests
 * for a batch of revision IDs, returning a map keyed by revision ID.
 */

import type { Pool } from 'pg';

import type { SkillScriptDescriptorRecord } from '@trapmap/server/lib/store.js';

import type { StructuredRevisionData } from './record-reconstruction.js';

/**
 * Load structured revision data (files, descriptors, derived) for a batch of revision IDs.
 *
 * Queries 8 sub-tables in parallel and assembles per-revision StructuredRevisionData.
 * Structured (sub-table) data takes precedence over JSONB columns when present.
 */
export async function loadStructuredRevisionData(
  pool: Pool,
  revisionIds: string[],
): Promise<Map<string, StructuredRevisionData>> {
  const result = new Map<string, StructuredRevisionData>();
  if (revisionIds.length === 0) {
    return result;
  }

  const [
    filesRows,
    descriptorRows,
    profileRows,
    capsuleRows,
    manifestRows,
    manifestRefRows,
    manifestAssetRows,
    manifestScriptRows,
  ] = await Promise.all([
    pool.query(
      'SELECT * FROM skill_artifact_files WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_script_descriptors WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_profiles WHERE artifact_revision_id = ANY($1::text[])',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_capsules WHERE artifact_revision_id = ANY($1::text[]) ORDER BY capsule_id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_client_manifests WHERE artifact_revision_id = ANY($1::text[])',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_manifest_references WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_manifest_assets WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_manifest_scripts WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
  ]);

  for (const revisionId of revisionIds) {
    const files = filesRows.rows
      .filter((row: any) => row.artifact_revision_id === revisionId)
      .map((row: any) => ({
        path: row.path,
        kind: row.kind,
        sha256: row.sha256,
        sizeBytes: row.size_bytes,
        mediaType: row.media_type,
        source: row.source_group,
        includeInDerivation: row.include_in_derivation === 1,
        activationOnly: row.activation_only === 1,
      }));

    const scriptDescriptors = descriptorRows.rows
      .filter((row: any) => row.artifact_revision_id === revisionId)
      .map(
        (row: any): SkillScriptDescriptorRecord => ({
          path: row.path,
          sha256: row.sha256,
          capability: row.capability,
          argsSchemaSummary: row.args_schema_summary,
          sideEffectSummary: row.side_effect_summary,
          defaultPolicy: row.default_policy,
        }),
      );

    const profileRow = profileRows.rows.find(
      (row: any) => row.artifact_revision_id === revisionId,
    ) as any;
    const capsuleList = capsuleRows.rows
      .filter((row: any) => row.artifact_revision_id === revisionId)
      .map((row: any) => ({
        capsuleId: row.capsule_id,
        artifactId: row.artifact_id,
        revision: row.revision_no,
        sourcePaths: row.source_paths,
        content: row.content,
        situation: row.situation,
        problem: row.problem,
        goal: row.goal,
        errorText: row.error_text,
        contextualPrefix: row.contextual_prefix ?? undefined,
        labels: row.labels,
        scope: row.scope,
        requiredLevel: row.required_level,
      }));

    const manifestRow = manifestRows.rows.find(
      (row: any) => row.artifact_revision_id === revisionId,
    ) as any;
    const manifest = manifestRow
      ? {
          artifactId: manifestRow.artifact_id,
          revision: manifestRow.revision_no,
          references: manifestRefRows.rows
            .filter((row: any) => row.artifact_revision_id === revisionId)
            .map((row: any) => ({
              path: row.path,
              sha256: row.sha256,
              sizeBytes: row.size_bytes,
              mediaType: row.media_type,
            })),
          assets: manifestAssetRows.rows
            .filter((row: any) => row.artifact_revision_id === revisionId)
            .map((row: any) => ({
              path: row.path,
              sha256: row.sha256,
              sizeBytes: row.size_bytes,
              mediaType: row.media_type,
            })),
          scripts: manifestScriptRows.rows
            .filter((row: any) => row.artifact_revision_id === revisionId)
            .map((row: any) => ({
              path: row.path,
              sha256: row.sha256,
              capability: row.capability,
              argsSchemaSummary: row.args_schema_summary,
              sideEffectSummary: row.side_effect_summary,
              defaultPolicy: row.default_policy,
            })),
          sourceHash: manifestRow.source_hash,
        }
      : null;

    const derived =
      profileRow || capsuleList.length > 0 || manifest
        ? {
            profile: profileRow
              ? {
                  artifactId: profileRow.artifact_id,
                  revision: profileRow.revision_no,
                  sourceHash: profileRow.source_hash,
                  title: profileRow.title,
                  summary: profileRow.summary,
                  keywords: profileRow.keywords,
                  referencePaths: profileRow.reference_paths,
                  contentHash: profileRow.content_hash,
                }
              : null,
            capsules: capsuleList,
            clientManifest: manifest,
            sourceHash:
              profileRow?.source_hash ?? manifest?.sourceHash ?? capsuleList[0]?.artifactId ?? '',
            derivedAt: new Date().toISOString(),
          }
        : null;

    result.set(revisionId, { files, scriptDescriptors, derived });
  }

  return result;
}
