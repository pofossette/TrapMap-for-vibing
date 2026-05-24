/**
 * Real PostgreSQL round-trip integration tests for PgArtifactRepository.
 *
 * Covers Phase 1 of the Round 4+ implementation plan:
 * - insert -> getById round-trip (all structured fields)
 * - appendRevision -> getById round-trip
 * - updateRevisionDerived -> getById round-trip
 * - listByFilter({ maintainerUserId }) round-trip
 * - Structured precedence assertions (结构化 > JSONB)
 * - Negative tests (invalid agentReview status/risk values)
 */

import type { Boundary } from '@trapmap/contracts';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import type { Pool } from 'pg';
import { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PgArtifactRepository } from './pg-repository.js';

// Skip tests if no DATABASE_URL
const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

let poolSingleton: Pool | null = null;

async function getPool(): Promise<Pool> {
  if (!DATABASE_URL) throw new Error('No DATABASE_URL configured');
  if (poolSingleton) return poolSingleton;
  poolSingleton = new PgPool({ connectionString: DATABASE_URL });
  return poolSingleton;
}

function createBoundaryFixture(): Boundary {
  return {
    context: ['frontend', 'production'],
    versions: [{ package: 'react', range: '>=18.0.0', note: 'React 18+' }],
    prerequisites: [{ description: 'Node.js 20+', kind: 'environment', required: true }],
    signals: [{ pattern: 'useEffect', kind: 'keyword', description: 'React hook signal' }],
    exclusions: [{ description: 'Not applicable for SSR', kind: 'platform' }],
    evidence: [
      {
        kind: 'documentation',
        identifier: 'react-docs',
        url: 'https://react.dev',
        note: 'Official React documentation',
      },
    ],
  };
}

function createFullArtifactFixture(artifactId: string): SkillArtifactRecord {
  const now = nowIso();

  const revision: SkillArtifactRecord['latestRevision'] = {
    revision: 1,
    sourceHash: 'source-hash-abc123',
    files: [
      {
        path: 'SKILL.md',
        kind: 'skill-markdown',
        sha256: 'sha256-skill',
        sizeBytes: 100,
        mediaType: 'text/markdown',
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
      },
      {
        path: 'references/appendix.md',
        kind: 'reference',
        sha256: 'sha256-ref',
        sizeBytes: 50,
        mediaType: 'text/markdown',
        source: 'references/',
        includeInDerivation: true,
        activationOnly: false,
      },
      {
        path: 'assets/logo.png',
        kind: 'asset',
        sha256: 'sha256-asset',
        sizeBytes: 200,
        mediaType: 'image/png',
        source: 'assets/',
        includeInDerivation: false,
        activationOnly: true,
      },
      {
        path: 'scripts/setup.sh',
        kind: 'script',
        sha256: 'sha256-script',
        sizeBytes: 75,
        mediaType: 'text/x-shellscript',
        source: 'scripts/',
        includeInDerivation: false,
        activationOnly: true,
      },
    ],
    submittedAt: now,
    submittedByUserId: 'user_tester',
    scriptDescriptors: [
      {
        path: 'scripts/setup.sh',
        sha256: 'sha256-script',
        capability: 'filesystem.write',
        argsSchemaSummary: '{"env_file":"string"}',
        sideEffectSummary: 'Creates .env file on disk',
        defaultPolicy: 'manual',
      },
    ],
    derived: {
      profile: {
        artifactId,
        revision: 1,
        sourceHash: 'source-hash-abc123',
        title: 'Test Skill',
        summary: 'A test skill for round-trip validation',
        keywords: ['test', 'roundtrip'],
        referencePaths: ['references/appendix.md'],
        contentHash: 'content-hash-xyz',
      },
      capsules: [
        {
          capsuleId: `capsule_${artifactId}`,
          artifactId,
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content:
            'When encountering a test failure, run the setup script to bootstrap the environment.',
          situation: 'testing',
          problem: 'test failures due to missing environment configuration',
          goal: 'resolve test failures by ensuring proper environment setup',
          errorText: null,
          contextualPrefix: 'Testing',
          labels: ['test', 'debugging'],
          scope: 'global',
          requiredLevel: 0,
        },
      ],
      clientManifest: {
        artifactId,
        revision: 1,
        references: [
          {
            path: 'references/appendix.md',
            sha256: 'sha256-ref',
            sizeBytes: 50,
            mediaType: 'text/markdown',
          },
        ],
        assets: [
          {
            path: 'assets/logo.png',
            sha256: 'sha256-asset',
            sizeBytes: 200,
            mediaType: 'image/png',
          },
        ],
        scripts: [
          {
            path: 'scripts/setup.sh',
            sha256: 'sha256-script',
            capability: 'filesystem.write',
            argsSchemaSummary: '{"env_file":"string"}',
            sideEffectSummary: 'Creates .env file on disk',
            defaultPolicy: 'manual',
          },
        ],
        sourceHash: 'source-hash-abc123',
      },
      sourceHash: 'source-hash-abc123',
      derivedAt: now,
    },
  };

  return {
    id: artifactId,
    teamId: null,
    scope: 'global',
    labels: ['test', 'roundtrip'],
    title: 'Test Skill',
    slug: 'test-skill',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_tester',
    latestRevision: revision,
    history: [revision],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub_test_1',
      latestSubmittedAt: now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    agentReview: {
      status: 'agent-pass',
      duplicateRisk: 'low',
      correctnessRisk: 'medium',
      completenessRisk: 'low',
      checkedAt: now,
      notes: ['All automated checks passed'],
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: createBoundaryFixture(),
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: {
      maintainerUserId: 'user_maintainer_alice',
      maintainerHandle: 'alice',
      maintainerLevel: 3,
      reviewBy: '2026-12-31T23:59:59.000Z',
    },
    createdAt: now,
    updatedAt: now,
  };
}

describeIfDb('PgArtifactRepository Round 4 real PG round-trip', () => {
  let repo: PgArtifactRepository;
  let testPool: Pool;

  beforeAll(async () => {
    testPool = await getPool();
    repo = new PgArtifactRepository(testPool);
  });

  afterAll(async () => {
    if (poolSingleton) {
      await poolSingleton.end();
      poolSingleton = null;
    }
  });

  beforeEach(async () => {
    // Clean all test artifact data before each test.
    // Tables keyed by artifact_revision_id (revision scoped sub-tables)
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
      await testPool.query(
        `DELETE FROM ${table} WHERE artifact_revision_id LIKE 'artifact_round4_test_%'`,
      );
    }
    // Tables keyed by artifact_id (artifact-scoped sub-tables)
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
      await testPool.query(`DELETE FROM ${table} WHERE artifact_id LIKE 'artifact_round4_test_%'`);
    }
    // Main artifact table (keyed by id)
    await testPool.query(`DELETE FROM skill_artifacts WHERE id LIKE 'artifact_round4_test_%'`);
  });

  // 1.1 insert -> getById round-trip
  describe('insert -> getById round-trip', () => {
    it('persists and reads back all root-level fields', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_1');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_1');

      expect(artifact).not.toBeNull();
      expect(artifact!.id).toBe('artifact_round4_test_1');
      expect(artifact!.teamId).toBeNull();
      expect(artifact!.scope).toBe('global');
      expect(artifact!.labels).toEqual(['test', 'roundtrip']);
      expect(artifact!.title).toBe('Test Skill');
      expect(artifact!.slug).toBe('test-skill');
      expect(artifact!.requiredLevel).toBe(0);
      expect(artifact!.lifecycleState).toBe('approved');
      expect(artifact!.ownerUserId).toBe('user_tester');
    });

    it('persists and reads back structured metadata (事实源)', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_meta');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_meta');

      expect(artifact!.metadata.sourceKind).toBe('skill-directory');
      expect(artifact!.metadata.submissionCount).toBe(1);
      expect(artifact!.metadata.resubmissionCount).toBe(0);
      expect(artifact!.metadata.revisionCount).toBe(1);
      expect(artifact!.metadata.latestSubmissionId).toBe('sub_test_1');
      expect(artifact!.metadata.latestDecision).toBe('approve');
    });

    it('persists and reads back structured boundary (事实源)', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_bound');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_bound');

      expect(artifact!.boundary).not.toBeNull();
      expect(artifact!.boundary!.context).toContain('frontend');
      expect(artifact!.boundary!.context).toContain('production');
      expect(artifact!.boundary!.versions).toHaveLength(1);
      expect(artifact!.boundary!.versions[0]!.package).toBe('react');
      expect(artifact!.boundary!.versions[0]!.range).toBe('>=18.0.0');
      expect(artifact!.boundary!.versions[0]!.note).toBe('React 18+');
      expect(artifact!.boundary!.prerequisites).toHaveLength(1);
      expect(artifact!.boundary!.prerequisites[0]!.description).toBe('Node.js 20+');
      expect(artifact!.boundary!.prerequisites[0]!.required).toBe(true);
      expect(artifact!.boundary!.signals[0]!.pattern).toBe('useEffect');
      expect(artifact!.boundary!.signals[0]!.description).toBe('React hook signal');
      expect(artifact!.boundary!.exclusions[0]!.description).toBe('Not applicable for SSR');
      expect(artifact!.boundary!.evidence[0]!.identifier).toBe('react-docs');
      expect(artifact!.boundary!.evidence[0]!.url).toBe('https://react.dev');
    });

    it('persists and reads back structured maintenanceMeta (事实源)', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_mnt');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_mnt');

      expect(artifact!.maintenanceMeta).not.toBeNull();
      expect(artifact!.maintenanceMeta!.maintainerUserId).toBe('user_maintainer_alice');
      expect(artifact!.maintenanceMeta!.maintainerHandle).toBe('alice');
      expect(artifact!.maintenanceMeta!.maintainerLevel).toBe(3);
      expect(artifact!.maintenanceMeta!.reviewBy).toBe('2026-12-31T23:59:59.000Z');
    });

    it('persists and reads back structured agentReview (事实源)', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_arv');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_arv');

      expect(artifact!.agentReview).not.toBeNull();
      expect(artifact!.agentReview!.status).toBe('agent-pass');
      expect(artifact!.agentReview!.duplicateRisk).toBe('low');
      expect(artifact!.agentReview!.correctnessRisk).toBe('medium');
      expect(artifact!.agentReview!.completenessRisk).toBe('low');
      expect(artifact!.agentReview!.notes).toContain('All automated checks passed');
    });

    it('persists and reads back structured files (事实源)', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_files');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_files');

      expect(artifact!.history).toHaveLength(1);
      const rev = artifact!.history[0]!;
      expect(rev.files).toHaveLength(4);

      const skillFile = rev.files.find((f) => f.path === 'SKILL.md');
      expect(skillFile).toBeDefined();
      expect(skillFile!.kind).toBe('skill-markdown');
      expect(skillFile!.includeInDerivation).toBe(true);
      expect(skillFile!.activationOnly).toBe(false);

      const assetFile = rev.files.find((f) => f.path === 'assets/logo.png');
      expect(assetFile!.kind).toBe('asset');
      expect(assetFile!.includeInDerivation).toBe(false);
      expect(assetFile!.activationOnly).toBe(true);

      const scriptFile = rev.files.find((f) => f.path === 'scripts/setup.sh');
      expect(scriptFile!.kind).toBe('script');
    });

    it('persists and reads back structured scriptDescriptors (事实源)', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_scrd');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_scrd');

      const rev = artifact!.history[0]!;
      expect(rev.scriptDescriptors).toHaveLength(1);
      expect(rev.scriptDescriptors[0]!.path).toBe('scripts/setup.sh');
      expect(rev.scriptDescriptors[0]!.capability).toBe('filesystem.write');
      expect(rev.scriptDescriptors[0]!.defaultPolicy).toBe('manual');
    });

    it('persists and reads back structured derived.profile (事实源)', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_dprof');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_dprof');

      const rev = artifact!.history[0]!;
      expect(rev.derived?.profile).not.toBeNull();
      expect(rev.derived!.profile!.title).toBe('Test Skill');
      expect(rev.derived!.profile!.summary).toBe('A test skill for round-trip validation');
      expect(rev.derived!.profile!.keywords).toEqual(['test', 'roundtrip']);
      expect(rev.derived!.profile!.referencePaths).toContain('references/appendix.md');
      expect(rev.derived!.profile!.contentHash).toBe('content-hash-xyz');
    });

    it('persists and reads back structured derived.capsules (事实源)', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_dcap');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_dcap');

      const rev = artifact!.history[0]!;
      expect(rev.derived?.capsules).toHaveLength(1);
      const capsule = rev.derived!.capsules[0]!;
      expect(capsule.capsuleId).toBe('capsule_artifact_round4_test_dcap');
      expect(capsule.situation).toBe('testing');
      expect(capsule.problem).toBe('test failures due to missing environment configuration');
      expect(capsule.goal).toBe('resolve test failures by ensuring proper environment setup');
      expect(capsule.contextualPrefix).toBe('Testing');
      expect(capsule.labels).toEqual(['test', 'debugging']);
    });

    it('persists and reads back structured derived.clientManifest (事实源)', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_dman');
      await repo.insert(fixture);

      const artifact = await repo.getById('artifact_round4_test_dman');

      const rev = artifact!.history[0]!;
      const manifest = rev.derived?.clientManifest;
      expect(manifest).not.toBeNull();
      expect(manifest!.references).toHaveLength(1);
      expect(manifest!.references[0]!.path).toBe('references/appendix.md');
      expect(manifest!.references[0]!.sha256).toBe('sha256-ref');
      expect(manifest!.assets).toHaveLength(1);
      expect(manifest!.assets[0]!.path).toBe('assets/logo.png');
      expect(manifest!.assets[0]!.mediaType).toBe('image/png');
      expect(manifest!.scripts).toHaveLength(1);
      expect(manifest!.scripts[0]!.path).toBe('scripts/setup.sh');
      expect(manifest!.scripts[0]!.capability).toBe('filesystem.write');
      expect(manifest!.sourceHash).toBe('source-hash-abc123');
    });
  });

  // 1.2 appendRevision -> getById round-trip
  describe('appendRevision -> getById round-trip', () => {
    it('appends a second revision and reads both back with structured fields', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_apprev');
      await repo.insert(fixture);

      const now2 = nowIso();
      const rev2: SkillArtifactRecord['latestRevision'] = {
        revision: 2,
        sourceHash: 'source-hash-rev2-def456',
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'sha256-skill-v2',
            sizeBytes: 150,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
          },
        ],
        submittedAt: now2,
        submittedByUserId: 'user_tester',
        scriptDescriptors: [
          {
            path: 'scripts/migrate.sh',
            sha256: 'sha256-migrate',
            capability: 'exec',
            argsSchemaSummary: '{}',
            sideEffectSummary: 'Runs database migrations',
            defaultPolicy: 'manual',
          },
        ],
        derived: {
          profile: {
            artifactId: 'artifact_round4_test_apprev',
            revision: 2,
            sourceHash: 'source-hash-rev2-def456',
            title: 'Test Skill v2',
            summary: 'Updated test skill',
            keywords: ['test', 'v2'],
            referencePaths: [],
            contentHash: 'content-hash-v2',
          },
          capsules: [
            {
              capsuleId: 'capsule_test_2',
              artifactId: 'artifact_round4_test_apprev',
              revision: 2,
              sourcePaths: ['SKILL.md'],
              content: 'Use migrate.sh before running tests.',
              situation: 'migration',
              problem: 'schema out of date',
              goal: 'keep schema current',
              errorText: null,
              labels: ['migration'],
              scope: 'global',
              requiredLevel: 0,
            },
          ],
          clientManifest: null,
          sourceHash: 'source-hash-rev2-def456',
          derivedAt: now2,
        },
      };

      await repo.appendRevision('artifact_round4_test_apprev', rev2);

      const artifact = await repo.getById('artifact_round4_test_apprev');

      expect(artifact!.history).toHaveLength(2);
      expect(artifact!.latestRevision.revision).toBe(2);

      // Verify revision 1 still intact
      const rev1 = artifact!.history.find((r) => r.revision === 1);
      expect(rev1).toBeDefined();
      expect(rev1!.files[0]!.path).toBe('SKILL.md');
      expect(rev1!.derived?.profile?.title).toBe('Test Skill');

      // Verify revision 2 data
      const rev2Read = artifact!.history.find((r) => r.revision === 2);
      expect(rev2Read).toBeDefined();
      expect(rev2Read!.sourceHash).toBe('source-hash-rev2-def456');
      expect(rev2Read!.files[0]!.sha256).toBe('sha256-skill-v2');
      expect(rev2Read!.scriptDescriptors[0]!.path).toBe('scripts/migrate.sh');
      expect(rev2Read!.derived?.profile?.title).toBe('Test Skill v2');
      expect(rev2Read!.derived?.capsules[0]!.capsuleId).toBe('capsule_test_2');
      expect(rev2Read!.derived?.capsules[0]!.situation).toBe('migration');
    });
  });

  // 1.3 updateRevisionDerived -> getById round-trip
  describe('updateRevisionDerived -> getById round-trip', () => {
    it('updates derived data on an existing revision and reads back correctly', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_updder');
      await repo.insert(fixture);

      const now2 = nowIso();
      await repo.updateRevisionDerived('artifact_round4_test_updder', 1, {
        profile: {
          artifactId: 'artifact_round4_test_updder',
          revision: 1,
          sourceHash: 'source-hash-abc123',
          title: 'Test Skill (Revised)',
          summary: 'Revised summary after derivation',
          keywords: ['test', 'revised'],
          referencePaths: ['references/appendix.md'],
          contentHash: 'content-hash-revised',
        },
        capsules: [
          {
            capsuleId: 'capsule_test_1_v2',
            artifactId: 'artifact_round4_test_updder',
            revision: 1,
            sourcePaths: ['SKILL.md', 'references/appendix.md'],
            content: 'Updated capsule content for revised derivation.',
            situation: 'testing-revised',
            problem: 'updated problem description',
            goal: 'updated goal',
            errorText: null,
            contextualPrefix: 'Testing Revised',
            labels: ['test', 'updated'],
            scope: 'global',
            requiredLevel: 0,
          },
        ],
        clientManifest: {
          artifactId: 'artifact_round4_test_updder',
          revision: 1,
          references: [
            {
              path: 'references/appendix.md',
              sha256: 'sha256-ref',
              sizeBytes: 50,
              mediaType: 'text/markdown',
            },
          ],
          assets: [],
          scripts: [],
          sourceHash: 'source-hash-abc123',
        },
        sourceHash: 'source-hash-abc123',
        derivedAt: now2,
      });

      const artifact = await repo.getById('artifact_round4_test_updder');

      expect(artifact!.history).toHaveLength(1);
      const rev = artifact!.history[0]!;

      // Profile should be updated
      expect(rev.derived?.profile?.title).toBe('Test Skill (Revised)');
      expect(rev.derived?.profile?.keywords).toEqual(['test', 'revised']);

      // Capsules should be replaced (not appended) - only the new capsule
      expect(rev.derived?.capsules).toHaveLength(1);
      expect(rev.derived!.capsules[0]!.capsuleId).toBe('capsule_test_1_v2');
      expect(rev.derived!.capsules[0]!.contextualPrefix).toBe('Testing Revised');
    });
  });

  // 1.4 listByFilter({ maintainerUserId }) round-trip
  describe('listByFilter', () => {
    it('finds artifacts by maintainerUserId via structured maintenance table left join', async () => {
      const fixture1 = createFullArtifactFixture('artifact_round4_test_list1');
      await repo.insert(fixture1);

      const fixture2 = createFullArtifactFixture('artifact_round4_test_list2');
      fixture2.maintenanceMeta = {
        maintainerUserId: 'user_maintainer_bob',
        maintainerHandle: 'bob',
        maintainerLevel: 2,
        reviewBy: '2026-06-01T00:00:00.000Z',
      };
      fixture2.history = [fixture2.latestRevision];
      await repo.insert(fixture2);

      // Filter by alice - should only get fixture1
      const aliceResults = await repo.listByFilter({ maintainerUserId: 'user_maintainer_alice' });
      const aliceIds = aliceResults.map((a) => a.id);
      expect(aliceIds).toContain('artifact_round4_test_list1');
      expect(aliceIds).not.toContain('artifact_round4_test_list2');

      // Filter by bob - should only get fixture2
      const bobResults = await repo.listByFilter({ maintainerUserId: 'user_maintainer_bob' });
      const bobIds = bobResults.map((a) => a.id);
      expect(bobIds).toContain('artifact_round4_test_list2');
      expect(bobIds).not.toContain('artifact_round4_test_list1');
    });
  });

  // 1.5 Structured precedence assertions (结构化优先读取)
  describe('structured precedence (结构化 > JSONB)', () => {
    it('reads structured metadata in preference to corrupted JSONB cache', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_prec1');
      await repo.insert(fixture);

      // Verify initial state
      const initial = await repo.getById('artifact_round4_test_prec1');
      expect(initial!.metadata.revisionCount).toBe(1);
      expect(initial!.metadata.sourceKind).toBe('skill-directory');

      // Corrupt the JSONB cache with different values
      await testPool.query('UPDATE skill_artifacts SET metadata = $1 WHERE id = $2', [
        JSON.stringify({
          ...fixture.metadata,
          revisionCount: 999,
          sourceKind: 'legacy-knowledge',
          submissionCount: 42,
          latestDecision: 'reject',
        }),
        'artifact_round4_test_prec1',
      ]);

      // Read back - structured values should take precedence
      const artifact = await repo.getById('artifact_round4_test_prec1');

      expect(artifact!.metadata.revisionCount).toBe(1);
      expect(artifact!.metadata.sourceKind).toBe('skill-directory');
      expect(artifact!.metadata.submissionCount).toBe(1);
      expect(artifact!.metadata.latestDecision).toBe('approve');
    });

    it('reads structured agentReview in preference to corrupted JSONB cache', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_prec2');
      await repo.insert(fixture);

      // Corrupt the JSONB agent_review column
      await testPool.query('UPDATE skill_artifacts SET agent_review = $1 WHERE id = $2', [
        JSON.stringify({
          status: 'agent-rejected',
          duplicateRisk: 'high',
          correctnessRisk: 'high',
          completenessRisk: 'high',
          checkedAt: '2000-01-01T00:00:00.000Z',
          notes: ['corrupted'],
        }),
        'artifact_round4_test_prec2',
      ]);

      const artifact = await repo.getById('artifact_round4_test_prec2');

      expect(artifact!.agentReview!.status).toBe('agent-pass');
      expect(artifact!.agentReview!.duplicateRisk).toBe('low');
      expect(artifact!.agentReview!.correctnessRisk).toBe('medium');
      expect(artifact!.agentReview!.completenessRisk).toBe('low');
    });

    it('reads structured boundary in preference to corrupted JSONB cache', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_prec3');
      await repo.insert(fixture);

      // Corrupt the JSONB boundary column
      await testPool.query('UPDATE skill_artifacts SET boundary = $1 WHERE id = $2', [
        JSON.stringify({
          context: ['corrupted-only'],
          versions: [],
          prerequisites: [],
          signals: [],
          exclusions: [],
          evidence: [],
        }),
        'artifact_round4_test_prec3',
      ]);

      const artifact = await repo.getById('artifact_round4_test_prec3');

      expect(artifact!.boundary!.context).toContain('frontend');
      expect(artifact!.boundary!.context).toContain('production');
      expect(artifact!.boundary!.versions).toHaveLength(1);
      expect(artifact!.boundary!.versions[0]!.package).toBe('react');
    });

    it('reads structured maintenanceMeta in preference to corrupted JSONB cache', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_prec4');
      await repo.insert(fixture);

      // Corrupt the JSONB maintenance_meta column
      await testPool.query('UPDATE skill_artifacts SET maintenance_meta = $1 WHERE id = $2', [
        JSON.stringify({
          maintainerUserId: 'wrong_user',
          maintainerHandle: 'intruder',
          maintainerLevel: 99,
          reviewBy: '2000-01-01T00:00:00.000Z',
        }),
        'artifact_round4_test_prec4',
      ]);

      const artifact = await repo.getById('artifact_round4_test_prec4');

      expect(artifact!.maintenanceMeta!.maintainerUserId).toBe('user_maintainer_alice');
      expect(artifact!.maintenanceMeta!.maintainerHandle).toBe('alice');
      expect(artifact!.maintenanceMeta!.maintainerLevel).toBe(3);
    });

    it('reads structured files in preference to corrupted JSONB cache on revisions', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_prec5');
      await repo.insert(fixture);

      // Corrupt the JSONB files column on the revision
      await testPool.query(
        'UPDATE artifact_revisions SET files = $1 WHERE artifact_id = $2 AND revision_no = $3',
        [
          JSON.stringify([
            {
              path: 'HACKED.md',
              kind: 'skill-markdown',
              sha256: 'bad',
              sizeBytes: 1,
              mediaType: 'text/plain',
              source: 'SKILL.md',
              includeInDerivation: false,
              activationOnly: false,
            },
          ]),
          'artifact_round4_test_prec5',
          1,
        ],
      );

      const artifact = await repo.getById('artifact_round4_test_prec5');

      // Structured data from skill_artifact_files should take precedence
      const files = artifact!.history[0]!.files;
      expect(files.some((f) => f.path === 'SKILL.md')).toBe(true);
      expect(files.some((f) => f.path === 'HACKED.md')).toBe(false);
      expect(files.some((f) => f.path === 'references/appendix.md')).toBe(true);
    });

    it('reads structured derived data in preference to corrupted JSONB derived cache', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_prec6');
      await repo.insert(fixture);

      // Corrupt the JSONB derived column
      await testPool.query(
        'UPDATE artifact_revisions SET derived = $1 WHERE artifact_id = $2 AND revision_no = $3',
        [
          JSON.stringify({
            profile: {
              artifactId: 'artifact_round4_test_prec6',
              revision: 1,
              sourceHash: 'bad-hash',
              title: 'CORRUPTED TITLE',
              summary: 'bad',
              keywords: ['bad'],
              referencePaths: [],
              contentHash: 'bad',
            },
            capsules: [],
            clientManifest: null,
            sourceHash: 'bad-hash',
            derivedAt: '2000-01-01T00:00:00.000Z',
          }),
          'artifact_round4_test_prec6',
          1,
        ],
      );

      const artifact = await repo.getById('artifact_round4_test_prec6');

      const rev = artifact!.history[0]!;
      // Structured derived should take precedence
      expect(rev.derived?.profile?.title).toBe('Test Skill');
      expect(rev.derived?.capsules).toHaveLength(1);
      expect(rev.derived?.capsules[0]!.capsuleId).toBe('capsule_artifact_round4_test_prec6');
      expect(rev.derived?.clientManifest?.scripts[0]!.path).toBe('scripts/setup.sh');
    });
  });

  // 1.6 Negative tests (负例覆盖)
  describe('negative tests (负例)', () => {
    it('rejects insert with invalid agentReview.status', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_neg1');
      // Set invalid status that violates DB check constraint
      (fixture.agentReview as any).status = 'invalid-status';

      await expect(repo.insert(fixture)).rejects.toThrow();
    });

    it('rejects insert with invalid agentReview.duplicateRisk', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_neg2');
      // Set invalid risk value
      (fixture.agentReview as any).duplicateRisk = 'critical';

      await expect(repo.insert(fixture)).rejects.toThrow();
    });

    it('rejects insert with invalid agentReview.correctnessRisk', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_neg3');
      (fixture.agentReview as any).correctnessRisk = 'unknown';

      await expect(repo.insert(fixture)).rejects.toThrow();
    });

    it('rejects insert with invalid agentReview.completenessRisk', async () => {
      const fixture = createFullArtifactFixture('artifact_round4_test_neg4');
      (fixture.agentReview as any).completenessRisk = 'none';

      await expect(repo.insert(fixture)).rejects.toThrow();
    });
  });
});
