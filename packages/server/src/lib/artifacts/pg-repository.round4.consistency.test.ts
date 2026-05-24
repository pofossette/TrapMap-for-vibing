/**
 * Cross-table consistency constraint tests for PgArtifactRepository.
 *
 * Phase 3 of Round 4+ implementation plan:
 *   - Repository-layer validation (assertDerivedConsistency)
 *   - DB-layer composite FK constraints (artifact_id, revision_no)
 *   - DB-layer CHECK constraints (revision_no > 0, required_level range)
 *   - revision_count auto-sync on insert / appendRevision
 *   - Orphan prevention via existing CASCADE FKs
 *
 * Tests use real PostgreSQL (require TRAPMAP_DATABASE_URL)
 * to validate actual DB constraint enforcement.
 */

import type { Boundary } from '@trapmap/contracts';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import type { Pool } from 'pg';
import { Pool as PgPool } from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PgArtifactRepository } from './pg-repository.js';

const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

let poolSingleton: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (!DATABASE_URL) throw new Error('No DATABASE_URL configured');
  if (poolSingleton) return poolSingleton;
  poolSingleton = new PgPool({ connectionString: DATABASE_URL });
  return poolSingleton;
}

function createFixture(artifactId: string): SkillArtifactRecord {
  const now = nowIso();
  const revision: SkillArtifactRecord['latestRevision'] = {
    revision: 1,
    sourceHash: 'source-hash-abc',
    files: [
      {
        path: 'SKILL.md',
        kind: 'skill-markdown',
        sha256: 'sha256-skill',
        sizeBytes: 50,
        mediaType: 'text/markdown',
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
      },
    ],
    submittedAt: now,
    submittedByUserId: 'user_a',
    scriptDescriptors: [],
    derived: null,
  };

  return {
    id: artifactId,
    teamId: null,
    scope: 'global',
    labels: [],
    title: 'Consistency Test',
    slug: `consistency-${artifactId}`,
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_a',
    latestRevision: revision,
    history: [revision],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub_1',
      latestSubmittedAt: now,
      latestReviewedAt: null,
      latestDecision: null,
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: {
      context: [],
      versions: [],
      prerequisites: [],
      signals: [],
      exclusions: [],
      evidence: [],
    },
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createDerivedFixture(artifactId: string, revisionNo: number) {
  return {
    profile: {
      artifactId,
      revision: revisionNo,
      sourceHash: 'source-hash-abc',
      title: 'Test Skill',
      summary: 'Summary',
      keywords: ['test'],
      referencePaths: [],
      contentHash: 'content-hash',
    },
    capsules: [
      {
        capsuleId: `capsule_${artifactId}`,
        artifactId,
        revision: revisionNo,
        sourcePaths: ['SKILL.md'],
        content: 'Capsule content',
        situation: 'testing',
        problem: 'problem',
        goal: 'goal',
        errorText: null,
        labels: ['test'],
        scope: 'global' as const,
        requiredLevel: 0,
      },
    ],
    clientManifest: {
      artifactId,
      revision: revisionNo,
      references: [
        { path: 'refs/a.md', sha256: 'sha-ref', sizeBytes: 1, mediaType: 'text/markdown' },
      ],
      assets: [],
      scripts: [],
      sourceHash: 'source-hash-abc',
    },
    sourceHash: 'source-hash-abc',
    derivedAt: nowIso(),
  };
}

function cleanId(artifactId: string) {
  const revisionId = `${artifactId}_rev1`;

  return async (pool: Pool) => {
    const revisionTables = [
      'skill_artifact_manifest_scripts',
      'skill_artifact_manifest_assets',
      'skill_artifact_manifest_references',
      'skill_artifact_client_manifests',
      'skill_artifact_capsules',
      'skill_artifact_profiles',
      'skill_artifact_script_descriptors',
      'skill_artifact_files',
    ];
    for (const table of revisionTables) {
      await pool.query(`DELETE FROM ${table} WHERE artifact_revision_id = $1`, [revisionId]);
    }

    const artifactTables = [
      'skill_artifact_boundary_evidence',
      'skill_artifact_boundary_exclusions',
      'skill_artifact_boundary_signals',
      'skill_artifact_boundary_prerequisites',
      'skill_artifact_boundary_versions',
      'skill_artifact_boundary_contexts',
      'skill_artifact_agent_reviews',
      'skill_artifact_maintenance_assignments',
      'skill_artifact_metadata',
      'artifact_lifecycle_events',
      'artifact_revisions',
    ];
    for (const table of artifactTables) {
      await pool.query(`DELETE FROM ${table} WHERE artifact_id = $1`, [artifactId]);
    }
    await pool.query('DELETE FROM skill_artifacts WHERE id = $1', [artifactId]);
  };
}

describeIfDb('PgArtifactRepository cross-table consistency (Phase 3)', () => {
  let repo: PgArtifactRepository;
  let pool: Pool;

  beforeAll(async () => {
    pool = await getPool();
    repo = new PgArtifactRepository(pool);
  });

  afterAll(async () => {
    if (poolSingleton) {
      await poolSingleton.end();
      poolSingleton = null;
    }
  });

  // =========================================================================
  // 3.1 Repository-layer validation (assertDerivedConsistency)
  // =========================================================================

  describe('repository-layer derived consistency', () => {
    it('rejects capsule with mismatched artifactId', async () => {
      const id = 'artifact_consistency_rl_cap_art';
      const fixture = createFixture(id);
      fixture.history[0]!.derived = createDerivedFixture(id, 1);
      await repo.insert(fixture);

      // Try to set derived with wrong artifactId in capsule
      const badDerived = createDerivedFixture(id, 1);
      (badDerived.capsules[0]! as any).artifactId = 'WRONG_ARTIFACT';

      await expect(repo.updateRevisionDerived(id, 1, badDerived as any)).rejects.toThrow(
        /capsule.artifactId.*does not match/,
      );

      await cleanId(id)(pool);
    });

    it('rejects capsule with mismatched revision', async () => {
      const id = 'artifact_consistency_rl_cap_rev';
      const fixture = createFixture(id);
      fixture.history[0]!.derived = createDerivedFixture(id, 1);
      await repo.insert(fixture);

      const badDerived = createDerivedFixture(id, 1);
      (badDerived.capsules[0]! as any).revision = 99;

      await expect(repo.updateRevisionDerived(id, 1, badDerived as any)).rejects.toThrow(
        /capsule.revision.*does not match/,
      );

      await cleanId(id)(pool);
    });

    it('rejects profile with mismatched artifactId', async () => {
      const id = 'artifact_consistency_rl_prof_art';
      const fixture = createFixture(id);
      fixture.history[0]!.derived = createDerivedFixture(id, 1);
      await repo.insert(fixture);

      const badDerived = createDerivedFixture(id, 1);
      (badDerived.profile! as any).artifactId = 'WRONG_ARTIFACT';

      await expect(repo.updateRevisionDerived(id, 1, badDerived as any)).rejects.toThrow(
        /derived.profile.artifactId.*does not match/,
      );

      await cleanId(id)(pool);
    });

    it('rejects clientManifest with mismatched artifactId', async () => {
      const id = 'artifact_consistency_rl_man_art';
      const fixture = createFixture(id);
      fixture.history[0]!.derived = createDerivedFixture(id, 1);
      await repo.insert(fixture);

      const badDerived = createDerivedFixture(id, 1);
      (badDerived.clientManifest! as any).artifactId = 'WRONG_ARTIFACT';

      await expect(repo.updateRevisionDerived(id, 1, badDerived as any)).rejects.toThrow(
        /clientManifest.artifactId.*does not match/,
      );

      await cleanId(id)(pool);
    });

    it('rejects clientManifest with mismatched revision', async () => {
      const id = 'artifact_consistency_rl_man_rev';
      const fixture = createFixture(id);
      fixture.history[0]!.derived = createDerivedFixture(id, 1);
      await repo.insert(fixture);

      const badDerived = createDerivedFixture(id, 1);
      (badDerived.clientManifest! as any).revision = 99;

      await expect(repo.updateRevisionDerived(id, 1, badDerived as any)).rejects.toThrow(
        /clientManifest.revision.*does not match/,
      );

      await cleanId(id)(pool);
    });
  });

  // =========================================================================
  // 3.2 DB-layer composite FK constraints
  // =========================================================================

  describe('DB composite FK (artifact_id, revision_no)', () => {
    it('rejects skill_artifact_files with mismatched artifact_id/revision_no', async () => {
      const id = 'artifact_consistency_db_files';
      const fixture = createFixture(id);
      await repo.insert(fixture);

      // Try to directly insert a file row pointing to a non-existent (artifact_id, revision_no) pair
      const revisionId = `${id}_rev1`;
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_files (
            artifact_revision_id, artifact_id, revision_no, path, kind, sha256, size_bytes, media_type, source_group
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            revisionId,
            'NONEXISTENT_ARTIFACT',
            99,
            'fake.md',
            'skill-markdown',
            'sha',
            1,
            'text/markdown',
            'SKILL.md',
          ],
        ),
      ).rejects.toThrow(/foreign key|violates/);

      await cleanId(id)(pool);
    });

    it('rejects skill_artifact_capsules with mismatched artifact_id/revision_no', async () => {
      const id = 'artifact_consistency_db_caps';
      const fixture = createFixture(id);
      await repo.insert(fixture);

      const revisionId = `${id}_rev1`;
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_capsules (
            capsule_id, artifact_revision_id, artifact_id, revision_no, source_hash, source_paths,
            content, situation, problem, goal, labels, scope, required_level
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            'capsule_bad_fk',
            revisionId,
            'WRONG_ARTIFACT',
            99,
            'hash',
            JSON.stringify([]),
            'content',
            'sit',
            'prob',
            'goal',
            JSON.stringify([]),
            'global',
            0,
          ],
        ),
      ).rejects.toThrow(/foreign key|violates/);

      await cleanId(id)(pool);
    });

    it('rejects skill_artifact_profiles with mismatched artifact_id/revision_no', async () => {
      const id = 'artifact_consistency_db_prof';
      const fixture = createFixture(id);
      await repo.insert(fixture);

      const revisionId = `${id}_rev1`;
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_profiles (
            artifact_revision_id, artifact_id, revision_no, source_hash, title, summary, keywords, reference_paths, content_hash
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            revisionId,
            'WRONG_ARTIFACT',
            99,
            'hash',
            'title',
            'summary',
            JSON.stringify([]),
            JSON.stringify([]),
            'ch',
          ],
        ),
      ).rejects.toThrow(/foreign key|violates/);

      await cleanId(id)(pool);
    });

    it('rejects skill_artifact_client_manifests with mismatched artifact_id/revision_no', async () => {
      const id = 'artifact_consistency_db_man';
      const fixture = createFixture(id);
      await repo.insert(fixture);

      const revisionId = `${id}_rev1`;
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_client_manifests (
            artifact_revision_id, artifact_id, revision_no, source_hash
          ) VALUES ($1, $2, $3, $4)`,
          [revisionId, 'WRONG_ARTIFACT', 99, 'hash'],
        ),
      ).rejects.toThrow(/foreign key|violates/);

      await cleanId(id)(pool);
    });
  });

  // =========================================================================
  // 3.3 DB-layer CHECK constraints
  // =========================================================================

  describe('DB CHECK constraints', () => {
    let checkId: string;

    beforeEach(async () => {
      checkId = `artifact_consistency_check_${Date.now()}`;
    });

    afterEach(async () => {
      await cleanId(checkId)(pool);
      await pool.query('DELETE FROM skill_artifacts WHERE id = $1', [checkId]).catch(() => {});
    });

    it('rejects skill_artifact_profiles with revision_no <= 0', async () => {
      const fixture = createFixture(checkId);
      await repo.insert(fixture);

      const revisionId = `${checkId}_rev1`;
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_profiles (
            artifact_revision_id, artifact_id, revision_no, source_hash, title, summary, keywords, reference_paths, content_hash
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            revisionId,
            checkId,
            0,
            'hash',
            'title',
            'summary',
            JSON.stringify([]),
            JSON.stringify([]),
            'ch',
          ],
        ),
      ).rejects.toThrow(/check|violates/);
    });

    it('rejects skill_artifact_capsules with required_level < 0', async () => {
      const fixture = createFixture(checkId);
      await repo.insert(fixture);

      const revisionId = `${checkId}_rev1`;
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_capsules (
            capsule_id, artifact_revision_id, artifact_id, revision_no, source_hash, source_paths,
            content, situation, problem, goal, labels, scope, required_level
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            'capsule_bad_level_neg',
            revisionId,
            checkId,
            1,
            'hash',
            JSON.stringify([]),
            'content',
            'sit',
            'prob',
            'goal',
            JSON.stringify([]),
            'global',
            -1,
          ],
        ),
      ).rejects.toThrow(/check|violates/);
    });

    it('rejects skill_artifact_capsules with required_level > 10', async () => {
      const fixture = createFixture(checkId);
      await repo.insert(fixture);

      const revisionId = `${checkId}_rev1`;
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_capsules (
            capsule_id, artifact_revision_id, artifact_id, revision_no, source_hash, source_paths,
            content, situation, problem, goal, labels, scope, required_level
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            'capsule_bad_level_high',
            revisionId,
            checkId,
            1,
            'hash',
            JSON.stringify([]),
            'content',
            'sit',
            'prob',
            'goal',
            JSON.stringify([]),
            'global',
            11,
          ],
        ),
      ).rejects.toThrow(/check|violates/);
    });
  });

  // =========================================================================
  // 3.4 Orphan prevention (existing CASCADE FKs from 0007)
  // =========================================================================

  describe('orphan prevention (CASCADE FKs)', () => {
    it('rejects manifest_reference without existing client_manifest', async () => {
      const id = 'artifact_consistency_orphan_ref';
      const fixture = createFixture(id);
      await repo.insert(fixture);

      const revisionId = `${id}_rev1`;
      // manifest_references FK → skill_artifact_client_manifests(artifact_revision_id)
      // No client_manifest row exists for this revision, so this must fail
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_manifest_references (
            artifact_revision_id, path, sha256, size_bytes, media_type
          ) VALUES ($1, $2, $3, $4, $5)`,
          [revisionId, 'ref.md', 'sha', 1, 'text/markdown'],
        ),
      ).rejects.toThrow(/foreign key|violates/);

      await cleanId(id)(pool);
    });

    it('rejects manifest_asset without existing client_manifest', async () => {
      const id = 'artifact_consistency_orphan_asset';
      const fixture = createFixture(id);
      await repo.insert(fixture);

      const revisionId = `${id}_rev1`;
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_manifest_assets (
            artifact_revision_id, path, sha256, size_bytes, media_type
          ) VALUES ($1, $2, $3, $4, $5)`,
          [revisionId, 'asset.png', 'sha', 1, 'image/png'],
        ),
      ).rejects.toThrow(/foreign key|violates/);

      await cleanId(id)(pool);
    });

    it('rejects manifest_script without existing client_manifest', async () => {
      const id = 'artifact_consistency_orphan_script';
      const fixture = createFixture(id);
      await repo.insert(fixture);

      const revisionId = `${id}_rev1`;
      await expect(
        pool.query(
          `INSERT INTO skill_artifact_manifest_scripts (
            artifact_revision_id, path, sha256, capability, args_schema_summary, side_effect_summary, default_policy
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [revisionId, 'script.sh', 'sha', 'exec', '{}', 'none', 'manual'],
        ),
      ).rejects.toThrow(/foreign key|violates/);

      await cleanId(id)(pool);
    });

    it('manifest children are CASCADE deleted when client_manifest is removed', async () => {
      const id = 'artifact_consistency_cascade';
      const fixture = createFixture(id);
      fixture.history[0]!.derived = createDerivedFixture(id, 1);
      await repo.insert(fixture);

      const revisionId = `${id}_rev1`;

      // Verify children exist
      const refsBefore = await pool.query(
        'SELECT COUNT(*) AS c FROM skill_artifact_manifest_references WHERE artifact_revision_id = $1',
        [revisionId],
      );
      expect(Number(refsBefore.rows[0]!.c)).toBeGreaterThan(0);

      // Delete the client_manifest → children should cascade
      await pool.query(
        'DELETE FROM skill_artifact_client_manifests WHERE artifact_revision_id = $1',
        [revisionId],
      );

      const refsAfter = await pool.query(
        'SELECT COUNT(*) AS c FROM skill_artifact_manifest_references WHERE artifact_revision_id = $1',
        [revisionId],
      );
      expect(Number(refsAfter.rows[0]!.c)).toBe(0);

      await cleanId(id)(pool);
    });
  });

  // =========================================================================
  // 3.5 revision_count auto-sync
  // =========================================================================

  describe('revision_count sync', () => {
    it('insert syncs revision_count to match actual revision count', async () => {
      const id = 'artifact_consistency_sync_insert';
      const fixture = createFixture(id);
      // Set metadata.revisionCount to wrong value first
      fixture.metadata.revisionCount = 999;
      await repo.insert(fixture);

      const artifact = await repo.getById(id);
      // The syncRevisionCount after insert should have corrected it to 1
      expect(artifact!.metadata.revisionCount).toBe(1);

      await cleanId(id)(pool);
    });

    it('appendRevision auto-increments revision_count', async () => {
      const id = 'artifact_consistency_sync_append';
      const fixture = createFixture(id);
      await repo.insert(fixture);

      // Verify initial count
      let artifact = await repo.getById(id);
      expect(artifact!.metadata.revisionCount).toBe(1);

      // Append a second revision
      const rev2: SkillArtifactRecord['latestRevision'] = {
        revision: 2,
        sourceHash: 'hash-rev2',
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'sha-v2',
            sizeBytes: 60,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
          },
        ],
        submittedAt: nowIso(),
        submittedByUserId: 'user_a',
        scriptDescriptors: [],
        derived: null,
      };
      await repo.appendRevision(id, rev2);

      artifact = await repo.getById(id);
      expect(artifact!.metadata.revisionCount).toBe(2);
      expect(artifact!.history).toHaveLength(2);

      await cleanId(id)(pool);
    });

    it('appendRevision syncs revision_count even when metadata was previously wrong', async () => {
      const id = 'artifact_consistency_sync_correct';
      const fixture = createFixture(id);
      await repo.insert(fixture);

      // Corrupt the metadata.revision_count
      await pool.query(
        'UPDATE skill_artifact_metadata SET revision_count = 42 WHERE artifact_id = $1',
        [id],
      );

      // Append a revision - should correct revision_count
      const rev2: SkillArtifactRecord['latestRevision'] = {
        revision: 2,
        sourceHash: 'hash-rev2',
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'sha-v2',
            sizeBytes: 60,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
          },
        ],
        submittedAt: nowIso(),
        submittedByUserId: 'user_a',
        scriptDescriptors: [],
        derived: null,
      };
      await repo.appendRevision(id, rev2);

      const artifact = await repo.getById(id);
      expect(artifact!.metadata.revisionCount).toBe(2);

      await cleanId(id)(pool);
    });
  });
});
