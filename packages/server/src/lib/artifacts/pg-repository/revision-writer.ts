/**
 * Structured revision data writing to PostgreSQL.
 *
 * Handles upserting files, script descriptors, and derived output rows
 * (profiles, capsules, client manifests) into the structured sub-tables.
 */

import type { Pool } from 'pg';

import type { SkillArtifactRevisionRecord } from '@trapmap/server/lib/store.js';

// =============================================================================
// Consistency Assertions
// =============================================================================

/**
 * Validate that derived data references match the parent artifact and revision.
 */
function assertDerivedConsistency(artifactId: string, revision: SkillArtifactRevisionRecord): void {
  const revNo = revision.revision;
  const derived = revision.derived;
  if (!derived) return;

  if (derived.profile) {
    if (derived.profile.artifactId !== artifactId) {
      throw new Error(
        `derived.profile.artifactId "${derived.profile.artifactId}" does not match artifact "${artifactId}"`,
      );
    }
    if (derived.profile.revision !== revNo) {
      throw new Error(
        `derived.profile.revision ${derived.profile.revision} does not match revision ${revNo}`,
      );
    }
  }

  for (const capsule of derived.capsules) {
    if (capsule.artifactId !== artifactId) {
      throw new Error(
        `capsule.artifactId "${capsule.artifactId}" does not match artifact "${artifactId}"`,
      );
    }
    if (capsule.revision !== revNo) {
      throw new Error(`capsule.revision ${capsule.revision} does not match revision ${revNo}`);
    }
  }

  if (derived.clientManifest) {
    if (derived.clientManifest.artifactId !== artifactId) {
      throw new Error(
        `clientManifest.artifactId "${derived.clientManifest.artifactId}" does not match artifact "${artifactId}"`,
      );
    }
    if (derived.clientManifest.revision !== revNo) {
      throw new Error(
        `clientManifest.revision ${derived.clientManifest.revision} does not match revision ${revNo}`,
      );
    }
  }
}

// =============================================================================
// Revision Count Sync
// =============================================================================

/**
 * Synchronize the revision_count in skill_artifact_metadata with the actual
 * number of rows in artifact_revisions.
 */
export async function syncRevisionCount(
  client: Pick<Pool, 'query'>,
  artifactId: string,
): Promise<void> {
  const { rows } = await client.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM artifact_revisions WHERE artifact_id = $1',
    [artifactId],
  );
  if (rows.length === 0) return;
  const actualCount = Number(rows[0]!.count);
  await client.query(
    `INSERT INTO skill_artifact_metadata (
      artifact_id, source_kind, submission_count, resubmission_count, revision_count,
      latest_submission_id, latest_submitted_at, latest_reviewed_at, latest_decision, updated_at
    ) VALUES ($1, 'skill-directory', 1, 0, $2, NULL, NULL, NULL, NULL, NOW())
    ON CONFLICT (artifact_id) DO UPDATE SET revision_count = $2, updated_at = NOW()`,
    [artifactId, actualCount],
  );
}

// =============================================================================
// Derived Row Replacement
// =============================================================================

/**
 * Replace all structured derived output rows for a revision.
 * Deletes existing rows in profiles, capsules, manifests, then inserts new ones.
 */
export async function replaceStructuredDerivedRows(
  client: Pick<Pool, 'query'>,
  artifactId: string,
  revisionId: string,
  revision: SkillArtifactRevisionRecord,
): Promise<void> {
  assertDerivedConsistency(artifactId, revision);

  await client.query('DELETE FROM skill_artifact_profiles WHERE artifact_revision_id = $1', [
    revisionId,
  ]);
  await client.query('DELETE FROM skill_artifact_capsules WHERE artifact_revision_id = $1', [
    revisionId,
  ]);
  await client.query(
    'DELETE FROM skill_artifact_manifest_references WHERE artifact_revision_id = $1',
    [revisionId],
  );
  await client.query('DELETE FROM skill_artifact_manifest_assets WHERE artifact_revision_id = $1', [
    revisionId,
  ]);
  await client.query(
    'DELETE FROM skill_artifact_manifest_scripts WHERE artifact_revision_id = $1',
    [revisionId],
  );
  await client.query(
    'DELETE FROM skill_artifact_client_manifests WHERE artifact_revision_id = $1',
    [revisionId],
  );

  if (!revision.derived) {
    return;
  }

  if (revision.derived.profile) {
    await client.query(
      `INSERT INTO skill_artifact_profiles (
        artifact_revision_id, artifact_id, revision_no, source_hash, title, summary, keywords, reference_paths, content_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        revisionId,
        artifactId,
        revision.revision,
        revision.derived.profile.sourceHash,
        revision.derived.profile.title,
        revision.derived.profile.summary,
        JSON.stringify(revision.derived.profile.keywords),
        JSON.stringify(revision.derived.profile.referencePaths),
        revision.derived.profile.contentHash,
      ],
    );
  }

  for (const capsule of revision.derived.capsules) {
    await client.query(
      `INSERT INTO skill_artifact_capsules (
        capsule_id, artifact_revision_id, artifact_id, revision_no, source_hash, source_paths, content, situation,
        problem, goal, error_text, contextual_prefix, labels, scope, required_level
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        capsule.capsuleId,
        revisionId,
        artifactId,
        revision.revision,
        revision.derived.sourceHash,
        JSON.stringify(capsule.sourcePaths),
        capsule.content,
        capsule.situation,
        capsule.problem,
        capsule.goal,
        capsule.errorText,
        capsule.contextualPrefix ?? null,
        JSON.stringify(capsule.labels),
        capsule.scope,
        capsule.requiredLevel,
      ],
    );
  }

  if (revision.derived.clientManifest) {
    await client.query(
      `INSERT INTO skill_artifact_client_manifests (
        artifact_revision_id, artifact_id, revision_no, source_hash
      ) VALUES ($1,$2,$3,$4)`,
      [revisionId, artifactId, revision.revision, revision.derived.clientManifest.sourceHash],
    );

    for (const item of revision.derived.clientManifest.references) {
      await client.query(
        `INSERT INTO skill_artifact_manifest_references (
          artifact_revision_id, path, sha256, size_bytes, media_type
        ) VALUES ($1,$2,$3,$4,$5)`,
        [revisionId, item.path, item.sha256, item.sizeBytes, item.mediaType],
      );
    }
    for (const item of revision.derived.clientManifest.assets) {
      await client.query(
        `INSERT INTO skill_artifact_manifest_assets (
          artifact_revision_id, path, sha256, size_bytes, media_type
        ) VALUES ($1,$2,$3,$4,$5)`,
        [revisionId, item.path, item.sha256, item.sizeBytes, item.mediaType],
      );
    }
    for (const item of revision.derived.clientManifest.scripts) {
      await client.query(
        `INSERT INTO skill_artifact_manifest_scripts (
          artifact_revision_id, path, sha256, capability, args_schema_summary, side_effect_summary, default_policy
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          revisionId,
          item.path,
          item.sha256,
          item.capability,
          item.argsSchemaSummary,
          item.sideEffectSummary,
          item.defaultPolicy,
        ],
      );
    }
  }
}

// =============================================================================
// Full Revision Upsert
// =============================================================================

/**
 * Upsert all structured revision rows (files, script descriptors, derived).
 * Deletes existing rows first, then inserts fresh data.
 */
export async function upsertStructuredRevisionRows(
  client: Pick<Pool, 'query'>,
  artifactId: string,
  revisionId: string,
  revision: SkillArtifactRevisionRecord,
): Promise<void> {
  await client.query('DELETE FROM skill_artifact_files WHERE artifact_revision_id = $1', [
    revisionId,
  ]);
  for (const file of revision.files) {
    await client.query(
      `INSERT INTO skill_artifact_files (
        artifact_revision_id, artifact_id, revision_no, path, kind, sha256, size_bytes, media_type,
        source_group, include_in_derivation, activation_only
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        revisionId,
        artifactId,
        revision.revision,
        file.path,
        file.kind,
        file.sha256,
        file.sizeBytes,
        file.mediaType,
        file.source,
        file.includeInDerivation ? 1 : 0,
        file.activationOnly ? 1 : 0,
      ],
    );
  }

  await client.query(
    'DELETE FROM skill_artifact_script_descriptors WHERE artifact_revision_id = $1',
    [revisionId],
  );
  for (const descriptor of revision.scriptDescriptors) {
    await client.query(
      `INSERT INTO skill_artifact_script_descriptors (
        artifact_revision_id, artifact_id, revision_no, path, sha256, capability, args_schema_summary,
        side_effect_summary, default_policy
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        revisionId,
        artifactId,
        revision.revision,
        descriptor.path,
        descriptor.sha256,
        descriptor.capability,
        descriptor.argsSchemaSummary,
        descriptor.sideEffectSummary,
        descriptor.defaultPolicy,
      ],
    );
  }

  await replaceStructuredDerivedRows(client, artifactId, revisionId, revision);
}
