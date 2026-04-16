/**
 * Tests for skill artifact derivation (TDD RED phase).
 *
 * This module covers:
 * - CAPS-01: Deterministic derivation of profile, capsules, and client manifest
 * - CAPS-02: assets/ excluded from profile/capsule text
 * - CAPS-03: scripts/ excluded from model context, metadata-only in client manifest
 * - COMP-01: Contract-shaped derived outputs
 * - COMP-02: Derived outputs inherit artifact governance
 *
 * T-12-09: Deterministic derivation from SKILL.md + references/ only
 * T-12-10: assets/ and scripts/ excluded from profile/capsule content
 * T-12-11: Derived outputs inherit governance from artifact root
 * T-12-12: Revision-scoped caching with deterministic source hash
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type {
  JsonStore,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
} from '../store.js';
import { JsonStore as JsonStoreClass, nowIso } from '../store.js';
import { deriveSkillArtifactOutputs } from './derive.js';
import { applyDerivedArtifactOutputs } from './model.js';

describe('skill artifact derivation (CAPS-01, CAPS-02, CAPS-03)', () => {
  let store: JsonStore;
  let storeData: any;
  let artifact: SkillArtifactRecord;
  let revision: SkillArtifactRevisionRecord;
  const userId = 'user_1';
  const teamId = 'team_1';
  const createdAt = nowIso();

  beforeEach(async () => {
    // Create an in-memory store for testing
    const testDataFile = `/tmp/skill-shareer-derive-test-${Date.now()}-${Math.random()}.json`;
    process.env.SKILL_SHAREER_DATA_FILE = testDataFile;
    store = new JsonStoreClass(testDataFile);
    storeData = await store.snapshot();

    // Initialize counters
    storeData.counters = { user: 1, team: 1, artifact: 0 };

    // Create a user
    storeData.users.push({
      id: userId,
      handle: 'skillowner',
      notes: null,
      createdAt,
      updatedAt: createdAt,
    });

    // Create a team
    storeData.teams.push({
      id: teamId,
      name: 'Test Team',
      slug: 'test-team',
      description: 'Test team for derivation',
      createdAt,
      updatedAt: createdAt,
    });

    // Create membership
    storeData.memberships.push({
      id: store.nextId(storeData, 'membership'),
      userId,
      teamId,
      roleTemplate: 'user',
      securityLevel: 3,
      permissions: ['knowledge:read', 'knowledge:write'],
      notes: null,
      createdAt,
      updatedAt: createdAt,
    });

    // Create a revision fixture with concrete SKILL.md and reference content
    const skillMdHash = 'a'.repeat(64);
    const ref1Hash = 'b'.repeat(64);
    const ref2Hash = 'c'.repeat(64);
    const assetHash = 'd'.repeat(64);
    const scriptHash = 'e'.repeat(64);

    revision = {
      revision: 1,
      sourceHash: [skillMdHash, ref1Hash, ref2Hash, assetHash, scriptHash].join(''),
      files: [
        {
          path: 'SKILL.md',
          kind: 'skill-markdown',
          sha256: skillMdHash,
          sizeBytes: 256,
          mediaType: 'text/markdown',
          source: 'SKILL.md',
          includeInDerivation: true,
          activationOnly: false,
        },
        {
          path: 'references/docker-trap.md',
          kind: 'reference',
          sha256: ref1Hash,
          sizeBytes: 512,
          mediaType: 'text/markdown',
          source: 'references/',
          includeInDerivation: true,
          activationOnly: false,
        },
        {
          path: 'references/node-version-bug.md',
          kind: 'reference',
          sha256: ref2Hash,
          sizeBytes: 384,
          mediaType: 'text/markdown',
          source: 'references/',
          includeInDerivation: true,
          activationOnly: false,
        },
        {
          path: 'assets/docker-compose.yml',
          kind: 'asset',
          sha256: assetHash,
          sizeBytes: 1024,
          mediaType: 'text/yaml',
          source: 'assets/',
          includeInDerivation: false,
          activationOnly: true,
        },
        {
          path: 'scripts/setup.sh',
          kind: 'script',
          sha256: scriptHash,
          sizeBytes: 2048,
          mediaType: 'text/x-shellscript',
          source: 'scripts/',
          includeInDerivation: false,
          activationOnly: true,
        },
      ],
      submittedAt: createdAt,
      submittedByUserId: userId,
      scriptDescriptors: [
        {
          path: 'scripts/setup.sh',
          sha256: scriptHash,
          capability: 'Docker environment setup',
          argsSchemaSummary: '{ env: string, projectName: string }',
          sideEffectSummary: 'Creates docker-compose.yml and .env file',
          defaultPolicy: 'manual',
        },
      ],
      derived: null,
    };

    // Create an artifact record
    artifact = {
      id: store.nextId(storeData, 'artifact'),
      teamId,
      scope: 'project',
      labels: ['docker', 'node', 'version'],
      title: 'Docker Node Version Trap',
      slug: 'docker-node-version-trap',
      requiredLevel: 3,
      lifecycleState: 'agent-pass',
      ownerUserId: userId,
      latestRevision: revision,
      history: [revision],
      metadata: {
        sourceKind: 'skill-directory',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: store.nextId(storeData, 'artifact_submission'),
        latestSubmittedAt: createdAt,
        latestReviewedAt: createdAt,
        latestDecision: null,
      },
      agentReview: null,
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      createdAt,
      updatedAt: createdAt,
    };
  });

  /**
   * Test 1: Deterministic derivation produces stable hashes and capsule IDs
   *
   * This test verifies:
   * - Same revision input produces same contentHash, capsuleId, and ordered referencePaths
   * - Derivation is deterministic and reproducible
   *
   * T-12-09: derive hashes from ordered SKILL.md + references/ text only
   */
  describe('deriveSkillArtifactOutputs() determinism', () => {
    it('should produce the same contentHash, capsuleId, and ordered referencePaths for the same revision input', () => {
      // First derivation
      const derived1 = deriveSkillArtifactOutputs(artifact, revision);

      // Second derivation with same input
      const derived2 = deriveSkillArtifactOutputs(artifact, revision);

      // Assert deterministic outputs
      expect(derived1.sourceHash).toBe(derived2.sourceHash);
      expect(derived1.profile?.contentHash).toBe(derived2.profile?.contentHash);

      // Check capsules have stable IDs
      expect(derived1.capsules).toHaveLength(derived2.capsules.length);
      for (let i = 0; i < derived1.capsules.length; i++) {
        expect(derived1.capsules[i]!.capsuleId).toBe(derived2.capsules[i]!.capsuleId);
      }

      // Check reference paths are ordered
      expect(derived1.profile?.referencePaths).toEqual([
        'references/docker-trap.md',
        'references/node-version-bug.md',
      ]);

      // Check client manifest is deterministic
      expect(derived1.clientManifest?.sourceHash).toBe(derived2.clientManifest?.sourceHash);
    });

    it('should generate a stable sourceHash from SKILL.md and references/ only', () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);

      // Source hash should be based only on derivation-eligible files
      // (SKILL.md + references/, excluding assets/ and scripts/)
      expect(derived.sourceHash).toBeDefined();
      expect(derived.sourceHash).toHaveLength(64);
      expect(derived.sourceHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  /**
   * Test 2: Text boundaries - SKILL.md + references/ only
   *
   * This test verifies:
   * - Capsules and profile text include only SKILL.md and references/ content
   * - assets/ and scripts/ are explicitly excluded from profile and capsules
   *
   * T-12-10: exclude assets/ and scripts/ bodies from profile/capsule content
   */
  describe('text boundaries (CAPS-02, CAPS-03)', () => {
    it('should include only SKILL.md and references/ in profile and capsules', () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);

      // Profile should exist
      expect(derived.profile).toBeDefined();
      expect(derived.profile?.artifactId).toBe(artifact.id);
      expect(derived.profile?.revision).toBe(revision.revision);

      // Profile reference paths should only include references/
      expect(derived.profile?.referencePaths).toEqual([
        'references/docker-trap.md',
        'references/node-version-bug.md',
      ]);

      // Profile should not include assets or scripts
      expect(derived.profile?.referencePaths).not.toContain('assets/docker-compose.yml');
      expect(derived.profile?.referencePaths).not.toContain('scripts/setup.sh');

      // Capsules should exist
      expect(derived.capsules.length).toBeGreaterThan(0);

      // Each capsule should only reference SKILL.md or references/
      for (const capsule of derived.capsules) {
        for (const path of capsule.sourcePaths) {
          const file = revision.files.find((f) => f.path === path);
          expect(file).toBeDefined();
          expect(file?.includeInDerivation).toBe(true);
          expect(file?.source).toMatch(/^(SKILL\.md|references\/)$/);
        }
      }
    });

    it('should explicitly exclude assets/ and scripts/ from profile and capsule content', () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);

      // Check profile doesn't reference assets or scripts
      for (const path of derived.profile?.referencePaths ?? []) {
        expect(path).not.toMatch(/^assets\//);
        expect(path).not.toMatch(/^scripts\//);
      }

      // Check capsules don't reference assets or scripts
      for (const capsule of derived.capsules) {
        for (const path of capsule.sourcePaths) {
          expect(path).not.toMatch(/^assets\//);
          expect(path).not.toMatch(/^scripts\//);
        }
      }
    });
  });

  /**
   * Test 3: Client manifest includes activation metadata
   *
   * This test verifies:
   * - Client manifest includes metadata for references, assets, and scripts
   * - Script entries expose policy/descriptor fields without body text
   *
   * T-12-10: expose assets/ and scripts/ through clientManifest metadata only
   */
  describe('client manifest (CAPS-02, CAPS-03)', () => {
    it('should include activation metadata for references, assets, and scripts', () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);

      // Client manifest should exist
      expect(derived.clientManifest).toBeDefined();
      expect(derived.clientManifest?.artifactId).toBe(artifact.id);
      expect(derived.clientManifest?.revision).toBe(revision.revision);

      // Should include reference metadata
      expect(derived.clientManifest?.references).toHaveLength(2);
      expect(derived.clientManifest?.references[0]?.path).toBe('references/docker-trap.md');
      expect(derived.clientManifest?.references[1]?.path).toBe('references/node-version-bug.md');

      // Should include asset metadata
      expect(derived.clientManifest?.assets).toHaveLength(1);
      expect(derived.clientManifest?.assets[0]?.path).toBe('assets/docker-compose.yml');
      expect(derived.clientManifest?.assets[0]?.sha256).toBeDefined();
      expect(derived.clientManifest?.assets[0]?.sizeBytes).toBe(1024);

      // Should include script metadata (capability only, no bodies)
      expect(derived.clientManifest?.scripts).toHaveLength(1);
      expect(derived.clientManifest?.scripts[0]?.path).toBe('scripts/setup.sh');
      expect(derived.clientManifest?.scripts[0]?.sha256).toBeDefined();
    });

    it('should expose script policy and descriptor fields without body text', () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);

      const scriptEntry = derived.clientManifest?.scripts[0];
      expect(scriptEntry).toBeDefined();

      // Should have capability description
      expect(scriptEntry?.capability).toBe('Docker environment setup');

      // Should have policy
      expect(scriptEntry?.defaultPolicy).toBe('manual');

      // Should have argument schema summary
      expect(scriptEntry?.argsSchemaSummary).toBe('{ env: string, projectName: string }');

      // Should have side effect summary
      expect(scriptEntry?.sideEffectSummary).toBe('Creates docker-compose.yml and .env file');

      // Should NOT have body text
      expect(scriptEntry).not.toHaveProperty('body');
      expect(scriptEntry).not.toHaveProperty('content');
    });

    it('should not include asset or script content in manifest', () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);

      // Assets should only have metadata
      for (const asset of derived.clientManifest?.assets ?? []) {
        expect(asset).toHaveProperty('path');
        expect(asset).toHaveProperty('sha256');
        expect(asset).toHaveProperty('sizeBytes');
        expect(asset).toHaveProperty('mediaType');
        expect(asset).not.toHaveProperty('content');
        expect(asset).not.toHaveProperty('body');
      }

      // Scripts should only have metadata
      for (const script of derived.clientManifest?.scripts ?? []) {
        expect(script).toHaveProperty('path');
        expect(script).toHaveProperty('sha256');
        expect(script).toHaveProperty('capability');
        expect(script).not.toHaveProperty('content');
        expect(script).not.toHaveProperty('body');
      }
    });
  });

  /**
   * Test 4: applyDerivedArtifactOutputs persistence
   *
   * This test verifies:
   * - Derived outputs are cached on the revision record
   * - Caching is keyed by sourceHash and contentHash
   *
   * T-12-12: keep derivation deterministic and revision-scoped with cached outputs
   */
  describe('applyDerivedArtifactOutputs() persistence', () => {
    it('should persist derived outputs on the revision record', () => {
      // First derive outputs
      const derived = deriveSkillArtifactOutputs(artifact, revision);

      // Apply derived outputs to record
      const updatedArtifact = applyDerivedArtifactOutputs(storeData, artifact, revision, derived);

      // Verify derived outputs are cached on latestRevision
      expect(updatedArtifact.latestRevision.derived).toBeDefined();
      expect(updatedArtifact.latestRevision.derived?.profile).toBeDefined();
      expect(updatedArtifact.latestRevision.derived?.capsules).toBeDefined();
      expect(updatedArtifact.latestRevision.derived?.clientManifest).toBeDefined();

      // Verify hashes match
      expect(updatedArtifact.latestRevision.derived?.sourceHash).toBe(derived.sourceHash);
      expect(updatedArtifact.latestRevision.derived?.profile?.contentHash).toBe(
        derived.profile?.contentHash,
      );
    });

    it('should cache derived outputs by sourceHash for downstream consumption', () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);
      const updatedArtifact = applyDerivedArtifactOutputs(storeData, artifact, revision, derived);

      // Source hash should be preserved
      expect(updatedArtifact.latestRevision.derived?.sourceHash).toBe(derived.sourceHash);

      // Derived timestamp should be set
      expect(updatedArtifact.latestRevision.derived?.derivedAt).toBeDefined();
      expect(updatedArtifact.latestRevision.derived?.derivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      // All derived components should share the same source hash
      expect(updatedArtifact.latestRevision.derived?.profile?.sourceHash).toBe(derived.sourceHash);
      expect(updatedArtifact.latestRevision.derived?.clientManifest?.sourceHash).toBe(
        derived.sourceHash,
      );
    });

    it('should inherit governance from artifact root (T-12-11)', () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);
      const updatedArtifact = applyDerivedArtifactOutputs(storeData, artifact, revision, derived);

      // Capsules should inherit artifact governance
      for (const capsule of updatedArtifact.latestRevision.derived?.capsules ?? []) {
        expect(capsule.scope).toBe(artifact.scope);
        expect(capsule.requiredLevel).toBe(artifact.requiredLevel);
      }

      // Profile should reference artifact id
      expect(updatedArtifact.latestRevision.derived?.profile?.artifactId).toBe(artifact.id);

      // Client manifest should reference artifact id
      expect(updatedArtifact.latestRevision.derived?.clientManifest?.artifactId).toBe(
        artifact.id,
      );
    });
  });
});
