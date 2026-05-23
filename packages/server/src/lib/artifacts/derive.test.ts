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
  ArtifactFilePayloadRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  SkillShareerStore,
} from '@trapmap/server/lib/store.js';
import { JsonStore as JsonStoreClass, nowIso } from '@trapmap/server/lib/store.js';
import { deriveFromPayloads, deriveSkillArtifactOutputs } from './derive.js';
import { applyDerivedArtifactOutputs } from './model.js';

describe('skill artifact derivation (CAPS-01, CAPS-02, CAPS-03)', () => {
  let store: SkillShareerStore;
  let storeData: any;
  let artifact: SkillArtifactRecord;
  let revision: SkillArtifactRevisionRecord;
  const userId = 'user_1';
  const teamId = 'team_1';
  const createdAt = nowIso();

  beforeEach(async () => {
    // Create an in-memory store for testing
    const testDataFile = `/tmp/skill-shareer-derive-test-${Date.now()}-${Math.random()}.json`;
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
      boundary: null,
      decayMeta: null,
      evidenceMeta: null,
      maintenanceMeta: null,
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
        expect(derived1.capsules[i]?.capsuleId).toBe(derived2.capsules[i]?.capsuleId);
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
    it('should persist derived outputs on the revision record', async () => {
      // First derive outputs
      const derived = deriveSkillArtifactOutputs(artifact, revision);

      // Apply derived outputs to record
      const updatedArtifact = await applyDerivedArtifactOutputs(
        storeData,
        artifact,
        revision,
        derived,
        undefined,
      );

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

    it('should cache derived outputs by sourceHash for downstream consumption', async () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);
      const updatedArtifact = await applyDerivedArtifactOutputs(
        storeData,
        artifact,
        revision,
        derived,
        undefined,
      );

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

    it('should inherit governance from artifact root (T-12-11)', async () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);
      const updatedArtifact = await applyDerivedArtifactOutputs(
        storeData,
        artifact,
        revision,
        derived,
        undefined,
      );

      // Capsules should inherit artifact governance
      for (const capsule of updatedArtifact.latestRevision.derived?.capsules ?? []) {
        expect(capsule.scope).toBe(artifact.scope);
        expect(capsule.requiredLevel).toBe(artifact.requiredLevel);
      }

      // Profile should reference artifact id
      expect(updatedArtifact.latestRevision.derived?.profile?.artifactId).toBe(artifact.id);

      // Client manifest should reference artifact id
      expect(updatedArtifact.latestRevision.derived?.clientManifest?.artifactId).toBe(artifact.id);
    });
  });
});

// =============================================================================
// Phase 14 Task 1: Retrieval-grade derivation from actual file content
// Tests that derived profile and capsule content is built from SKILL.md and
// reference text, not just title/labels placeholders.
// =============================================================================

describe('retrieval-grade derivation (RETR-03, CAPS-04, Phase 14 Task 1)', () => {
  let store: SkillShareerStore;
  let storeData: any;
  const userId = 'user_1';
  const teamId = 'team_1';
  const createdAt = nowIso();

  // Sample file content for testing derivation
  const skillMdContent = `---
title: Docker Node Version Mismatch
labels:
  - docker
  - node
  - version
---

# Docker Node Version Mismatch

## Situation
When deploying containers with a Node.js application, the Node version in the
container may not match the version expected by the application.

## Problem
The application fails with "syntax error" or "unexpected token" because the
container's Node version is older than the version used during development.

## Goal
Ensure the Dockerfile specifies an explicit Node version tag instead of using
:latest to prevent runtime version mismatches.
`;

  const reference1Content = `# Docker Version Pinning

Always pin your Node.js version in Dockerfile:

\`\`\`dockerfile
FROM node:20.11.1-alpine
\`\`\`

Never use :latest as it can introduce unexpected breaking changes.
`;

  const reference2Content = `# Common Node Version Errors

If you see "unexpected token" errors in production but not development, check
your Node version with:

\`\`\`bash
node --version
docker exec <container> node --version
\`\`\`

The versions must match exactly for consistent behavior.
`;

  const assetContent = 'version: "3.8"\nservices:\n  app:\n    image: node:latest\n';
  const scriptContent = '#!/bin/bash\necho "Setup script"\n';

  beforeEach(async () => {
    const testDataFile = `/tmp/skill-shareer-retrieval-derive-test-${Date.now()}-${Math.random()}.json`;
    store = new JsonStoreClass(testDataFile);
    storeData = await store.snapshot();
    storeData.counters = { user: 1, team: 1, artifact: 0 };
    storeData.users.push({
      id: userId,
      handle: 'skillowner',
      notes: null,
      createdAt,
      updatedAt: createdAt,
    });
    storeData.teams.push({
      id: teamId,
      name: 'Test Team',
      slug: 'test-team',
      description: 'Test team for derivation',
      createdAt,
      updatedAt: createdAt,
    });
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
  });

  describe('deriveFromPayloads() with actual file content', () => {
    it('should build profile summary from SKILL.md and reference text content', async () => {
      // Create artifact with file payloads
      const artifactId = store.nextId(storeData, 'artifact');
      const filePayloads: ArtifactFilePayloadRecord[] = [
        {
          artifactId,
          revision: 1,
          path: 'SKILL.md',
          sha256: 'a'.repeat(64),
          sizeBytes: skillMdContent.length,
          mediaType: 'text/markdown',
          content: skillMdContent,
          storedAt: createdAt,
        },
        {
          artifactId,
          revision: 1,
          path: 'references/docker-version.md',
          sha256: 'b'.repeat(64),
          sizeBytes: reference1Content.length,
          mediaType: 'text/markdown',
          content: reference1Content,
          storedAt: createdAt,
        },
        {
          artifactId,
          revision: 1,
          path: 'references/node-errors.md',
          sha256: 'c'.repeat(64),
          sizeBytes: reference2Content.length,
          mediaType: 'text/markdown',
          content: reference2Content,
          storedAt: createdAt,
        },
        // Asset and script should be excluded from derivation
        {
          artifactId,
          revision: 1,
          path: 'assets/docker-compose.yml',
          sha256: 'd'.repeat(64),
          sizeBytes: assetContent.length,
          mediaType: 'text/yaml',
          content: assetContent,
          storedAt: createdAt,
        },
        {
          artifactId,
          revision: 1,
          path: 'scripts/setup.sh',
          sha256: 'e'.repeat(64),
          sizeBytes: scriptContent.length,
          mediaType: 'text/x-shellscript',
          content: scriptContent,
          storedAt: createdAt,
        },
      ];

      // Derive from payloads
      const derived = await deriveFromPayloads(filePayloads, {
        artifactId,
        labels: ['docker', 'node', 'version'],
        title: 'Docker Node Version Mismatch',
        scope: 'project',
        requiredLevel: 3,
      });

      // Profile should have meaningful summary, not just title placeholder
      expect(derived.profile).toBeDefined();
      expect(derived.profile?.summary).toBeDefined();
      expect(derived.profile?.summary.length).toBeGreaterThan(10);
      // Should contain words from actual content
      expect(derived.profile?.summary.toLowerCase()).toMatch(/docker|node|version/);

      // Keywords should be extracted from content
      expect(derived.profile?.keywords.length).toBeGreaterThan(0);
    });

    it('should produce multiple capsules from meaningful text sections', async () => {
      const artifactId = store.nextId(storeData, 'artifact');
      const filePayloads: ArtifactFilePayloadRecord[] = [
        {
          artifactId,
          revision: 1,
          path: 'SKILL.md',
          sha256: 'a'.repeat(64),
          sizeBytes: skillMdContent.length,
          mediaType: 'text/markdown',
          content: skillMdContent,
          storedAt: createdAt,
        },
        {
          artifactId,
          revision: 1,
          path: 'references/docker-version.md',
          sha256: 'b'.repeat(64),
          sizeBytes: reference1Content.length,
          mediaType: 'text/markdown',
          content: reference1Content,
          storedAt: createdAt,
        },
        {
          artifactId,
          revision: 1,
          path: 'references/node-errors.md',
          sha256: 'c'.repeat(64),
          sizeBytes: reference2Content.length,
          mediaType: 'text/markdown',
          content: reference2Content,
          storedAt: createdAt,
        },
      ];

      const derived = await deriveFromPayloads(filePayloads, {
        artifactId,
        labels: ['docker', 'node', 'version'],
        title: 'Docker Node Version Mismatch',
        scope: 'project',
        requiredLevel: 3,
      });

      // Should produce at least one capsule from the content
      expect(derived.capsules.length).toBeGreaterThanOrEqual(1);

      // Each capsule should have meaningful content fields
      for (const capsule of derived.capsules) {
        expect(capsule.situation.length).toBeGreaterThan(5);
        expect(capsule.problem.length).toBeGreaterThan(5);
        expect(capsule.goal.length).toBeGreaterThan(5);
        expect(capsule.content.length).toBeGreaterThan(10);

        // Source paths should only reference derivation-eligible files
        for (const path of capsule.sourcePaths) {
          expect(path).not.toMatch(/^assets\//);
          expect(path).not.toMatch(/^scripts\//);
        }
      }
    });

    it('should exclude assets and scripts from profile/capsule content', async () => {
      const artifactId = store.nextId(storeData, 'artifact');
      const filePayloads: ArtifactFilePayloadRecord[] = [
        {
          artifactId,
          revision: 1,
          path: 'SKILL.md',
          sha256: 'a'.repeat(64),
          sizeBytes: skillMdContent.length,
          mediaType: 'text/markdown',
          content: skillMdContent,
          storedAt: createdAt,
        },
        {
          artifactId,
          revision: 1,
          path: 'assets/docker-compose.yml',
          sha256: 'd'.repeat(64),
          sizeBytes: assetContent.length,
          mediaType: 'text/yaml',
          content: assetContent,
          storedAt: createdAt,
        },
        {
          artifactId,
          revision: 1,
          path: 'scripts/setup.sh',
          sha256: 'e'.repeat(64),
          sizeBytes: scriptContent.length,
          mediaType: 'text/x-shellscript',
          content: scriptContent,
          storedAt: createdAt,
        },
      ];

      const derived = await deriveFromPayloads(filePayloads, {
        artifactId,
        labels: ['docker', 'node'],
        title: 'Test Artifact',
        scope: 'project',
        requiredLevel: 3,
      });

      // Profile should not contain asset/script content
      const profileContent = [derived.profile?.summary, ...(derived.profile?.keywords ?? [])]
        .join(' ')
        .toLowerCase();
      expect(profileContent).not.toContain('setup script');
      expect(profileContent).not.toContain('version: "3.8"');

      // Capsules should not reference asset/script paths
      for (const capsule of derived.capsules) {
        for (const path of capsule.sourcePaths) {
          expect(path).not.toMatch(/^assets\//);
          expect(path).not.toMatch(/^scripts\//);
        }
        // Capsule content should not contain asset/script content
        expect(capsule.content.toLowerCase()).not.toContain('setup script');
      }
    });
  });

  describe('deriveFromPayloads() with contextual enrichment', () => {
    function mockChat(response: string) {
      let callCount = 0;
      return {
        provider: 'mock',
        isConfigured: true,
        invoke: async () => {
          callCount++;
          // First call = manifest, subsequent calls = content generation
          if (callCount === 1) {
            return JSON.stringify({
              documentTitle: 'Docker Node Version Mismatch',
              documentLabels: ['docker', 'node'],
              capsules: [
                {
                  capsuleIndex: 0,
                  title: 'Docker Node Version',
                  description: 'Resolving version conflicts',
                  contentScope: 'Docker with Node.js',
                  sourceType: 'skill-main',
                  sourcePath: 'SKILL.md',
                  tags: ['docker', 'node'],
                },
              ],
            });
          }
          return response;
        },
      };
    }

    it('should add contextualPrefix when chat provider is given', async () => {
      const artifactId = store.nextId(storeData, 'artifact');
      const filePayloads: ArtifactFilePayloadRecord[] = [
        {
          artifactId,
          revision: 1,
          path: 'SKILL.md',
          sha256: 'a'.repeat(64),
          sizeBytes: skillMdContent.length,
          mediaType: 'text/markdown',
          content: skillMdContent,
          storedAt: createdAt,
        },
      ];

      const chat = mockChat('Docker skills doc — main section on version mismatch resolution');
      const derived = await deriveFromPayloads(filePayloads, {
        artifactId,
        labels: ['docker', 'node'],
        title: 'Docker Node Version Mismatch',
        scope: 'project',
        requiredLevel: 3,
        chat,
      });

      expect(derived.capsules.length).toBeGreaterThan(0);
      expect(derived.capsules[0]!.contextualPrefix).toBeDefined();
      expect(derived.capsules[0]!.contextualPrefix!.length).toBeLessThanOrEqual(300);
      expect(derived.capsules[0]!.contextualPrefix!.length).toBeGreaterThan(0);
    });

    it('should omit contextualPrefix when no chat provider is given (backward compat)', async () => {
      const artifactId = store.nextId(storeData, 'artifact');
      const filePayloads: ArtifactFilePayloadRecord[] = [
        {
          artifactId,
          revision: 1,
          path: 'SKILL.md',
          sha256: 'a'.repeat(64),
          sizeBytes: skillMdContent.length,
          mediaType: 'text/markdown',
          content: skillMdContent,
          storedAt: createdAt,
        },
      ];

      const derived = await deriveFromPayloads(filePayloads, {
        artifactId,
        labels: ['docker', 'node'],
        title: 'Docker Node Version Mismatch',
        scope: 'project',
        requiredLevel: 3,
      });

      expect(derived.capsules.length).toBeGreaterThan(0);
      // No chat provided → contextualPrefix should not be set
      expect(derived.capsules[0]!.contextualPrefix).toBeUndefined();
    });

    it('should use fallback prefix when LLM manifest generation fails', async () => {
      const artifactId = store.nextId(storeData, 'artifact');
      const filePayloads: ArtifactFilePayloadRecord[] = [
        {
          artifactId,
          revision: 1,
          path: 'SKILL.md',
          sha256: 'a'.repeat(64),
          sizeBytes: skillMdContent.length,
          mediaType: 'text/markdown',
          content: skillMdContent,
          storedAt: createdAt,
        },
      ];

      const failingChat = {
        provider: 'mock',
        isConfigured: true,
        invoke: async () => {
          throw new Error('LLM failed');
        },
      };
      const derived = await deriveFromPayloads(filePayloads, {
        artifactId,
        labels: ['docker', 'node'],
        title: 'Docker Node Version Mismatch',
        scope: 'project',
        requiredLevel: 3,
        chat: failingChat,
      });

      expect(derived.capsules[0]!.contextualPrefix).toBeDefined();
      // Should contain fallback prefix text
      expect(derived.capsules[0]!.contextualPrefix).toContain('Docker Node Version Mismatch');
    });

    it('should use fallback prefix when chat is not configured', async () => {
      const artifactId = store.nextId(storeData, 'artifact');
      const filePayloads: ArtifactFilePayloadRecord[] = [
        {
          artifactId,
          revision: 1,
          path: 'SKILL.md',
          sha256: 'a'.repeat(64),
          sizeBytes: skillMdContent.length,
          mediaType: 'text/markdown',
          content: skillMdContent,
          storedAt: createdAt,
        },
      ];

      const unconfiguredChat = {
        provider: 'fallback',
        isConfigured: false,
        invoke: async () => {
          throw new Error('Should not be called');
        },
      };
      const derived = await deriveFromPayloads(filePayloads, {
        artifactId,
        labels: ['docker', 'node'],
        title: 'Docker Node Version Mismatch',
        scope: 'project',
        requiredLevel: 3,
        chat: unconfiguredChat,
      });

      expect(derived.capsules[0]!.contextualPrefix).toBeDefined();
      expect(derived.capsules[0]!.contextualPrefix).toContain('main document');
    });
  });
});
