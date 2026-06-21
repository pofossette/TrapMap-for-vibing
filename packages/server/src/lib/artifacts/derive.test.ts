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
import { deriveAndApplyOutputs, deriveFromPayloads, deriveSkillArtifactOutputs } from './derive.js';
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
      expect(derived1.profile).toBeNull();
      expect(derived2.profile).toBeNull();

      // Check capsules have stable IDs
      expect(derived1.capsules).toHaveLength(derived2.capsules.length);
      for (let i = 0; i < derived1.capsules.length; i++) {
        expect(derived1.capsules[i]?.capsuleId).toBe(derived2.capsules[i]?.capsuleId);
      }

      // Check reference paths are ordered in client manifest
      expect(derived1.clientManifest?.references.map((item) => item.path)).toEqual([
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

      // Legacy derivation must not invent retrieval semantics.
      expect(derived.profile).toBeNull();
      expect(derived.capsules).toEqual([]);

      // Client manifest should still expose deterministic reference metadata.
      expect(derived.clientManifest?.references.map((item) => item.path)).toEqual([
        'references/docker-trap.md',
        'references/node-version-bug.md',
      ]);
    });

    it('should explicitly exclude assets/ and scripts/ from profile and capsule content', () => {
      const derived = deriveSkillArtifactOutputs(artifact, revision);

      expect(derived.profile).toBeNull();
      expect(derived.capsules).toEqual([]);
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
      expect(updatedArtifact.latestRevision.derived?.profile).toBeNull();
      expect(updatedArtifact.latestRevision.derived?.capsules).toBeDefined();
      expect(updatedArtifact.latestRevision.derived?.clientManifest).toBeDefined();

      // Verify hashes match
      expect(updatedArtifact.latestRevision.derived?.sourceHash).toBe(derived.sourceHash);
      expect(updatedArtifact.latestRevision.derived?.profile).toBe(derived.profile);
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

      // Client manifest should share the same source hash
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
        expect(capsule.situation?.length ?? 0).toBeGreaterThan(5);
        expect(capsule.problem?.length ?? 0).toBeGreaterThan(5);
        expect(capsule.goal?.length ?? 0).toBeGreaterThan(5);
        expect(capsule.content.length).toBeGreaterThan(10);

        // Source paths should only reference derivation-eligible files
        for (const path of capsule.sourcePaths) {
          expect(path).not.toMatch(/^assets\//);
          expect(path).not.toMatch(/^scripts\//);
        }
      }
    });

    it('should not generate capsules when text lacks explicit semantic sections', async () => {
      const artifactId = store.nextId(storeData, 'artifact');
      const filePayloads: ArtifactFilePayloadRecord[] = [
        {
          artifactId,
          revision: 1,
          path: 'SKILL.md',
          sha256: 'a'.repeat(64),
          sizeBytes: 120,
          mediaType: 'text/markdown',
          content: '# Minimal Skill\n\nThis file has summary text but no structured sections.',
          storedAt: createdAt,
        },
        {
          artifactId,
          revision: 1,
          path: 'references/plain.md',
          sha256: 'b'.repeat(64),
          sizeBytes: 90,
          mediaType: 'text/markdown',
          content:
            '# Plain Reference\n\nBackground details without explicit situation/problem/goal.',
          storedAt: createdAt,
        },
      ];

      const derived = await deriveFromPayloads(filePayloads, {
        artifactId,
        labels: ['docker'],
        title: 'Minimal Skill',
        scope: 'project',
        requiredLevel: 3,
      });

      expect(derived.profile).not.toBeNull();
      expect(derived.profile?.summary).toContain('Background details');
      expect(derived.capsules).toEqual([]);
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

// =============================================================================
// Phase 1 Regression: retrieval reading stale derived data
//
// Documents the wiring debt where appendSkillArtifactRevision() always creates
// revisions with derived: null.  After an edit, latestRevision.derived is null
// even though the previous revision may have had fully populated derived data.
// This means retrieval consumers (capsule-recall, skill-lookup, candidate
// scoring) read null/empty data after every edit until derivation is re-run.
//
// Phase 2 will fix appendSkillArtifactRevision() to carry forward derived data
// or re-derive before persisting.
// =============================================================================

describe('Phase 1 regression: retrieval reads stale derived data after edit', () => {
  let store: SkillShareerStore;
  let storeData: any;
  let artifact: SkillArtifactRecord;
  let revision1: SkillArtifactRevisionRecord;
  const userId = 'user_1';
  const teamId = 'team_1';
  const createdAt = nowIso();

  beforeEach(async () => {
    const testDataFile = `/tmp/skill-shareer-stale-derived-regression-${Date.now()}-${Math.random()}.json`;
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
      description: 'Test team for regression',
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

    // --- Revision 1: has derived outputs populated ---
    const skillMdHash = 'a'.repeat(64);
    const ref1Hash = 'b'.repeat(64);

    revision1 = {
      revision: 1,
      sourceHash: skillMdHash + ref1Hash,
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
          path: 'references/ref.md',
          kind: 'reference',
          sha256: ref1Hash,
          sizeBytes: 128,
          mediaType: 'text/markdown',
          source: 'references/',
          includeInDerivation: true,
          activationOnly: false,
        },
      ],
      submittedAt: createdAt,
      submittedByUserId: userId,
      scriptDescriptors: [],
      derived: null,
    };

    artifact = {
      id: store.nextId(storeData, 'artifact'),
      teamId,
      scope: 'project',
      labels: ['docker', 'node'],
      title: 'Docker Node Trap',
      slug: 'docker-node-trap',
      requiredLevel: 3,
      lifecycleState: 'agent-pass',
      ownerUserId: userId,
      latestRevision: revision1,
      history: [revision1],
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

    // Derive + apply so revision 1 has populated derived data
    const derived = deriveSkillArtifactOutputs(artifact, revision1);
    artifact = await applyDerivedArtifactOutputs(
      storeData,
      artifact,
      revision1,
      derived,
      undefined,
    );

    // Sanity: revision 1 now has derived data on latestRevision
    expect(artifact.latestRevision.derived).toBeDefined();
    expect(artifact.latestRevision.derived?.profile).toBeNull();
    expect(artifact.latestRevision.derived?.capsules).toEqual([]);
  });

  it('should show latestRevision.derived is null after edit (current broken behavior)', () => {
    // Simulate what appendSkillArtifactRevision() does on edit:
    // it creates a new revision with derived: null and sets it as latestRevision.
    const revision2: SkillArtifactRevisionRecord = {
      revision: 2,
      sourceHash: 'f'.repeat(64) + 'g'.repeat(64),
      files: [
        {
          path: 'SKILL.md',
          kind: 'skill-markdown',
          sha256: 'f'.repeat(64),
          sizeBytes: 300,
          mediaType: 'text/markdown',
          source: 'SKILL.md',
          includeInDerivation: true,
          activationOnly: false,
        },
        {
          path: 'references/ref.md',
          kind: 'reference',
          sha256: 'g'.repeat(64),
          sizeBytes: 128,
          mediaType: 'text/markdown',
          source: 'references/',
          includeInDerivation: true,
          activationOnly: false,
        },
      ],
      submittedAt: createdAt,
      submittedByUserId: userId,
      scriptDescriptors: [],
      derived: null, // <-- appendSkillArtifactRevision() always sets this to null
    };

    artifact.latestRevision = revision2;
    artifact.history.push(revision2);
    artifact.updatedAt = nowIso();

    // GAP: latestRevision.derived is null after edit.
    // Retrieval consumers (capsule-recall, skill-lookup, candidate scoring)
    // that read artifact.latestRevision.derived will get null/empty data.
    expect(artifact.latestRevision.derived).toBeNull();
    expect(artifact.latestRevision.revision).toBe(2);
  });

  it('should still have derived data on the previous revision in history', () => {
    // Simulate same edit as above
    const revision2: SkillArtifactRevisionRecord = {
      revision: 2,
      sourceHash: 'f'.repeat(64) + 'g'.repeat(64),
      files: [
        {
          path: 'SKILL.md',
          kind: 'skill-markdown',
          sha256: 'f'.repeat(64),
          sizeBytes: 300,
          mediaType: 'text/markdown',
          source: 'SKILL.md',
          includeInDerivation: true,
          activationOnly: false,
        },
        {
          path: 'references/ref.md',
          kind: 'reference',
          sha256: 'g'.repeat(64),
          sizeBytes: 128,
          mediaType: 'text/markdown',
          source: 'references/',
          includeInDerivation: true,
          activationOnly: false,
        },
      ],
      submittedAt: createdAt,
      submittedByUserId: userId,
      scriptDescriptors: [],
      derived: null,
    };

    artifact.latestRevision = revision2;
    artifact.history.push(revision2);
    artifact.updatedAt = nowIso();

    // The PREVIOUS revision (revision 1) still has its derived data in history.
    // This proves the problem is latest-revision-specific: the data was derived
    // and persisted on rev1, but the new latestRevision (rev2) carries derived: null.
    const historicalRev1 = artifact.history.find((r) => r.revision === 1);
    expect(historicalRev1).toBeDefined();
    expect(historicalRev1!.derived).toBeDefined();
    expect(historicalRev1!.derived?.profile).toBeNull();
    expect(historicalRev1!.derived?.capsules).toEqual([]);
    expect(historicalRev1!.derived?.clientManifest).toBeDefined();

    // Meanwhile latestRevision (rev2) has null derived
    expect(artifact.latestRevision.derived).toBeNull();
  });
});

// =============================================================================
// Phase 2: deriveAndApplyOutputs() — unified derivation+application seam
// =============================================================================

describe('deriveAndApplyOutputs() — unified seam (Phase 2)', () => {
  let store: SkillShareerStore;
  let storeData: any;
  let artifact: SkillArtifactRecord;
  let revision: SkillArtifactRevisionRecord;
  const userId = 'user_1';
  const teamId = 'team_1';
  const createdAt = nowIso();

  const skillMdContent = `---
title: Unified Seam Test
labels:
  - test
---

# Unified Seam Test

## Situation
When building skill artifacts through different code paths (import, migrate, edit).

## Problem
Each path may choose different derivation strategies, leading to inconsistent derived outputs.

## Goal
Ensure all paths converge on a single derive-and-apply function.
`;

  beforeEach(async () => {
    const testDataFile = `/tmp/skill-shareer-unified-seam-test-${Date.now()}-${Math.random()}.json`;
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
      description: 'Test team for unified seam',
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

    const skillMdHash = 'a'.repeat(64);
    const refHash = 'b'.repeat(64);

    revision = {
      revision: 1,
      sourceHash: skillMdHash + refHash,
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
          path: 'references/ref.md',
          kind: 'reference',
          sha256: refHash,
          sizeBytes: 128,
          mediaType: 'text/markdown',
          source: 'references/',
          includeInDerivation: true,
          activationOnly: false,
        },
      ],
      submittedAt: createdAt,
      submittedByUserId: userId,
      scriptDescriptors: [],
      derived: null,
    };

    artifact = {
      id: store.nextId(storeData, 'artifact'),
      teamId,
      scope: 'project',
      labels: ['test'],
      title: 'Unified Seam Test',
      slug: 'unified-seam-test',
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

  it('should populate derived outputs using retrieval-grade derivation when filePayloads provided', async () => {
    const filePayloads: ArtifactFilePayloadRecord[] = [
      {
        artifactId: artifact.id,
        revision: 1,
        path: 'SKILL.md',
        sha256: 'a'.repeat(64),
        sizeBytes: skillMdContent.length,
        mediaType: 'text/markdown',
        content: skillMdContent,
        storedAt: createdAt,
      },
    ];

    const result = await deriveAndApplyOutputs({
      artifact,
      revision,
      filePayloads,
    });

    // derived should be populated
    expect(result.latestRevision.derived).toBeDefined();
    expect(result.latestRevision.derived).not.toBeNull();
    expect(result.latestRevision.derived?.profile).toBeDefined();
    expect(result.latestRevision.derived?.capsules.length).toBeGreaterThan(0);

    // Retrieval-grade: summary should contain actual content, not just title placeholder
    expect(result.latestRevision.derived?.profile?.summary.length).toBeGreaterThan(10);
    expect(result.latestRevision.derived?.profile?.summary).toMatch(/unified|skill|artifacts/i);

    // History should also be updated
    const historyRevision = result.history.find((r) => r.revision === 1);
    expect(historyRevision).toBeDefined();
    expect(historyRevision!.derived).toBeDefined();
    expect(historyRevision!.derived?.profile).toBeDefined();
  });

  it('should fall back to legacy derivation when filePayloads is undefined', async () => {
    const result = await deriveAndApplyOutputs({
      artifact,
      revision,
      // no filePayloads — legacy fallback
    });

    // derived should be populated (via legacy path)
    expect(result.latestRevision.derived).toBeDefined();
    expect(result.latestRevision.derived).not.toBeNull();
    expect(result.latestRevision.derived?.profile).toBeNull();
    expect(result.latestRevision.derived?.capsules).toEqual([]);
    expect(result.latestRevision.derived?.clientManifest).toBeDefined();
  });

  it('should fall back to legacy derivation when filePayloads is empty array', async () => {
    const result = await deriveAndApplyOutputs({
      artifact,
      revision,
      filePayloads: [],
    });

    // derived should be populated (via legacy path)
    expect(result.latestRevision.derived).toBeDefined();
    expect(result.latestRevision.derived?.profile).toBeNull();
  });

  it('should not leave derived as null after applying', async () => {
    // Sanity: revision starts with derived: null
    expect(revision.derived).toBeNull();

    const result = await deriveAndApplyOutputs({
      artifact,
      revision,
    });

    // After deriveAndApplyOutputs, derived should not be null
    expect(result.latestRevision.derived).not.toBeNull();
    expect(result.latestRevision.derived?.sourceHash).toBeDefined();
    expect(result.latestRevision.derived?.derivedAt).toBeDefined();
  });
});
