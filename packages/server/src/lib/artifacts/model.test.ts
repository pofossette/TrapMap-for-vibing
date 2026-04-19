/**
 * Tests for skill artifact model and persistence.
 *
 * This module covers:
 * - ARTF-02: Server-side storage model for skill artifacts
 * - ARTF-03: Governance and audit lineage at artifact boundary
 * - CAPS-02: Assets remain activation-only manifest entries
 * - CAPS-03: Scripts remain descriptor-only metadata
 * - COMP-02: Additive persistence without changing knowledge entries
 *
 * T-12-05: Additive skillArtifacts collection beside knowledgeEntries
 * T-12-06: Assets stored as activationOnly, scripts as descriptors only
 * T-12-07: Governance (scope, teamId, requiredLevel) at artifact root
 * T-12-08: Audit lineage (review history, lifecycle history) preserved
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { JsonStore } from '../store.js';
import { JsonStore as JsonStoreClass, nowIso } from '../store.js';
import {
  appendSkillArtifactRevision,
  createSkillArtifactRecord,
  toSkillArtifact,
} from './model.js';

describe('skill artifact model (ARTF-02, ARTF-03, CAPS-02, CAPS-03)', () => {
  let store: JsonStore;
  // biome-ignore lint/suspicious/noExplicitAny: Mock data for testing
  let storeData: any;
  const userId = 'user_1';
  const teamId = 'team_1';
  const createdAt = nowIso();

  beforeEach(async () => {
    // Create an in-memory store for testing
    const testDataFile = `/tmp/skill-shareer-artifact-test-${Date.now()}-${Math.random()}.json`;
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
      description: null,
      createdAt,
      updatedAt: createdAt,
    });

    // Create membership
    storeData.memberships.push({
      id: 'membership_1',
      userId,
      teamId,
      roleTemplate: 'admin',
      securityLevel: 5,
      permissions: ['knowledge:submit', 'knowledge:search'],
      notes: null,
      createdAt,
      updatedAt: createdAt,
    });
  });

  describe('Test 1: createSkillArtifactRecord() appends to skillArtifacts without mutating knowledgeEntries', () => {
    it('should add artifact to skillArtifacts array (ARTF-02, T-12-05)', async () => {
      // Arrange: Create a pre-existing knowledge entry
      storeData.counters.knowledge = 1;
      const initialKnowledgeLength = 1;
      storeData.knowledgeEntries.push({
        id: 'knowledge_1',
        teamId: null,
        scope: 'global',
        labels: ['test', 'legacy'],
        shortcut: 'Legacy Entry',
        detail: 'Legacy knowledge entry',
        requiredLevel: 0,
        lifecycleState: 'approved',
        ownerUserId: userId,
        latestRevision: {
          revision: 1,
          submittedAt: createdAt,
          submittedByUserId: userId,
          shortcut: 'Legacy Entry',
          detail: 'Legacy knowledge entry',
          labels: ['test', 'legacy'],
          reviewNotes: [],
        },
        history: [],
        metadata: {
          scopeLabel: 'global-constraint',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: null,
          latestSubmittedAt: null,
          latestReviewedAt: null,
          latestDecision: null,
        },
        latestSubmissionId: null,
        submissionHistory: [],
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        embeddingCache: null,
        indexState: null,
        createdAt,
        updatedAt: createdAt,
      });

      const initialKnowledgeCount = storeData.knowledgeEntries.length;

      // Act: Create a skill artifact
      const artifact = createSkillArtifactRecord({
        store,
        data: storeData,
        ownerUserId: userId,
        teamId: null,
        payload: {
          scope: 'global',
          labels: ['docker', 'containers'],
          title: 'Docker Container Cleanup',
          slug: 'docker-cleanup',
          requiredLevel: 3,
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown',
              sha256: 'a'.repeat(64),
              sizeBytes: 512,
              mediaType: 'text/markdown',
              source: 'SKILL.md',
              includeInDerivation: true,
              activationOnly: false,
            },
            {
              path: 'references/docker-troubleshooting.md',
              kind: 'reference',
              sha256: 'b'.repeat(64),
              sizeBytes: 2048,
              mediaType: 'text/markdown',
              source: 'references/',
              includeInDerivation: true,
              activationOnly: false,
            },
            {
              path: 'assets/docker-compose.yml',
              kind: 'asset',
              sha256: 'c'.repeat(64),
              sizeBytes: 1024,
              mediaType: 'text/yaml',
              source: 'assets/',
              includeInDerivation: false,
              activationOnly: true,
            },
            {
              path: 'scripts/cleanup.sh',
              kind: 'script',
              sha256: 'd'.repeat(64),
              sizeBytes: 256,
              mediaType: 'text/x-shellscript',
              source: 'scripts/',
              includeInDerivation: false,
              activationOnly: false,
            },
          ],
          scriptDescriptors: [
            {
              path: 'scripts/cleanup.sh',
              sha256: 'd'.repeat(64),
              capability: 'Docker container cleanup',
              argsSchemaSummary: 'container_name: string',
              sideEffectSummary: 'Stops and removes containers',
              defaultPolicy: 'manual',
            },
          ],
          sourceKind: 'skill-directory',
        },
        requiredLevel: 3,
        createdAt,
        preReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: createdAt,
          notes: ['Agent review passed'],
        },
      });

      // Assert: skillArtifacts should have the new artifact
      expect(storeData.skillArtifacts).toBeDefined();
      expect(storeData.skillArtifacts.length).toBe(1);
      expect(storeData.skillArtifacts[0].id).toBe(artifact.id);
      expect(storeData.skillArtifacts[0].scope).toBe('global');
      expect(storeData.skillArtifacts[0].requiredLevel).toBe(3);

      // Assert: knowledgeEntries should be unchanged
      expect(storeData.knowledgeEntries.length).toBe(initialKnowledgeCount);
      expect(storeData.knowledgeEntries[0].id).toBe('knowledge_1');
    });

    it('should store governance at artifact root (ARTF-03, T-12-07)', () => {
      const artifact = createSkillArtifactRecord({
        store,
        data: storeData,
        ownerUserId: userId,
        teamId: null,
        payload: {
          scope: 'global',
          labels: ['test'],
          title: 'Test Artifact',
          slug: 'test-artifact',
          requiredLevel: 5,
          files: [],
          scriptDescriptors: [],
          sourceKind: 'skill-directory',
        },
        requiredLevel: 5,
        createdAt,
        preReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: createdAt,
          notes: [],
        },
      });

      // Governance should be at root level
      expect(artifact.scope).toBeDefined();
      expect(artifact.requiredLevel).toBeDefined();
      expect(artifact.teamId).toBeDefined();
      expect(artifact.lifecycleState).toBeDefined();
      expect(artifact.reviewHistory).toBeDefined();
      expect(artifact.lifecycleHistory).toBeDefined();
    });
  });

  describe('Test 2: toSkillArtifact() serializes through shared contract with governance preservation', () => {
    it('should serialize artifact with scope, teamId, requiredLevel, review and lifecycle history (ARTF-03, T-12-08)', () => {
      // Arrange: Create an artifact with full governance
      const artifactRecord = createSkillArtifactRecord({
        store,
        data: storeData,
        ownerUserId: userId,
        teamId,
        payload: {
          scope: 'project',
          labels: ['team-skill'],
          title: 'Team Artifact',
          slug: 'team-artifact',
          requiredLevel: 4,
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown',
              sha256: 'e'.repeat(64),
              sizeBytes: 512,
              mediaType: 'text/markdown',
              source: 'SKILL.md',
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          scriptDescriptors: [],
          sourceKind: 'skill-directory',
        },
        requiredLevel: 4,
        createdAt,
        preReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: createdAt,
          notes: ['Review passed'],
        },
      });

      // Act: Serialize through shared contract
      const serialized = toSkillArtifact(storeData, artifactRecord);

      // Assert: All governance fields should be preserved
      expect(serialized.id).toBe(artifactRecord.id);
      expect(serialized.scope).toBe('project');
      expect(serialized.teamId).toBe(teamId);
      expect(serialized.requiredLevel).toBe(4);
      expect(serialized.labels).toEqual(['team-skill']);
      expect(serialized.title).toBe('Team Artifact');

      // Review and lifecycle history should be preserved
      expect(serialized.reviewHistory).toBeDefined();
      expect(serialized.lifecycleHistory).toBeDefined();
      expect(serialized.reviewNotes).toBeDefined();

      // Latest revision should be included
      expect(serialized.latestRevision).toBeDefined();
      expect(serialized.history).toBeDefined();
      expect(serialized.history.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Test 3: assets remain activation-only, scripts remain descriptor-only (CAPS-02, CAPS-03, T-12-06)', () => {
    it('should store assets with activationOnly: true and includeInDerivation: false (CAPS-02, T-12-06)', () => {
      const assetFile = {
        path: 'assets/config.json',
        kind: 'asset' as const,
        sha256: 'f'.repeat(64),
        sizeBytes: 128,
        mediaType: 'application/json',
        source: 'assets/' as const,
        includeInDerivation: false,
        activationOnly: true,
      };

      const artifact = createSkillArtifactRecord({
        store,
        data: storeData,
        ownerUserId: userId,
        teamId: null,
        payload: {
          scope: 'global',
          labels: ['config'],
          title: 'Config Asset',
          slug: 'config-asset',
          requiredLevel: 0,
          files: [assetFile],
          scriptDescriptors: [],
          sourceKind: 'skill-directory',
        },
        requiredLevel: 0,
        createdAt,
        preReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: createdAt,
          notes: [],
        },
      });

      // Find the asset file in the revision
      const revision = artifact.history[0];
      const storedAsset = revision.files.find((f) => f.path === 'assets/config.json');

      expect(storedAsset).toBeDefined();
      expect(storedAsset?.kind).toBe('asset');
      expect(storedAsset?.source).toBe('assets/');
      expect(storedAsset?.activationOnly).toBe(true);
      expect(storedAsset?.includeInDerivation).toBe(false);
    });

    it('should store scripts as descriptor metadata only (CAPS-03, T-12-06)', () => {
      const scriptDescriptor = {
        path: 'scripts/deploy.sh',
        sha256: 'g'.repeat(64),
        capability: 'Deployment script',
        argsSchemaSummary: 'env: string, version: string',
        sideEffectSummary: 'Deploys to production',
        defaultPolicy: 'manual' as const,
      };

      const artifact = createSkillArtifactRecord({
        store,
        data: storeData,
        ownerUserId: userId,
        teamId: null,
        payload: {
          scope: 'global',
          labels: ['deployment'],
          title: 'Deploy Script',
          slug: 'deploy-script',
          requiredLevel: 8,
          files: [
            {
              path: 'scripts/deploy.sh',
              kind: 'script',
              sha256: 'g'.repeat(64),
              sizeBytes: 512,
              mediaType: 'text/x-shellscript',
              source: 'scripts/',
              includeInDerivation: false,
              activationOnly: false,
            },
          ],
          scriptDescriptors: [scriptDescriptor],
          sourceKind: 'skill-directory',
        },
        requiredLevel: 8,
        createdAt,
        preReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: createdAt,
          notes: [],
        },
      });

      // Check script descriptor is stored in revision
      const revision = artifact.history[0];
      expect(revision.scriptDescriptors).toBeDefined();
      expect(revision.scriptDescriptors.length).toBe(1);

      const storedDescriptor = revision.scriptDescriptors[0];
      expect(storedDescriptor.path).toBe('scripts/deploy.sh');
      expect(storedDescriptor.capability).toBe('Deployment script');
      expect(storedDescriptor.argsSchemaSummary).toBe('env: string, version: string');
      expect(storedDescriptor.sideEffectSummary).toBe('Deploys to production');
      expect(storedDescriptor.defaultPolicy).toBe('manual');

      // Script file should still exist in files manifest but without body
      const scriptFile = revision.files.find((f) => f.path === 'scripts/deploy.sh');
      expect(scriptFile).toBeDefined();
      expect(scriptFile?.kind).toBe('script');
      expect(scriptFile?.source).toBe('scripts/');
    });
  });

  describe('appendSkillArtifactRevision()', () => {
    it('should append a new revision to existing artifact (ARTF-02)', () => {
      // Create initial artifact
      const artifact = createSkillArtifactRecord({
        store,
        data: storeData,
        ownerUserId: userId,
        teamId: null,
        payload: {
          scope: 'global',
          labels: ['v1'],
          title: 'Versioned Artifact',
          slug: 'versioned-artifact',
          requiredLevel: 2,
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown',
              sha256: 'h'.repeat(64),
              sizeBytes: 256,
              mediaType: 'text/markdown',
              source: 'SKILL.md',
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          scriptDescriptors: [],
          sourceKind: 'skill-directory',
        },
        requiredLevel: 2,
        createdAt,
        preReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: createdAt,
          notes: [],
        },
      });

      const initialRevisionCount = artifact.history.length;
      const initialLatestRevision = artifact.latestRevision.revision;

      // Append a new revision
      const updatedAt = nowIso();
      const updatedArtifact = appendSkillArtifactRevision({
        store,
        data: storeData,
        artifact,
        ownerUserId: userId,
        payload: {
          files: [
            {
              path: 'SKILL.md',
              kind: 'skill-markdown',
              sha256: 'i'.repeat(64), // Different hash = new content
              sizeBytes: 384,
              mediaType: 'text/markdown',
              source: 'SKILL.md',
              includeInDerivation: true,
              activationOnly: false,
            },
          ],
          scriptDescriptors: [],
          sourceHash: 'i'.repeat(64),
        },
        submittedAt: updatedAt,
        preReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: updatedAt,
          notes: ['Updated content'],
        },
      });

      // Assert: Revision count should increase
      expect(updatedArtifact.history.length).toBe(initialRevisionCount + 1);
      expect(updatedArtifact.latestRevision.revision).toBe(initialLatestRevision + 1);
      expect(updatedArtifact.metadata.revisionCount).toBe(2);

      // Assert: Latest revision should be the new one
      expect(updatedArtifact.latestRevision.submittedAt).toBe(updatedAt);
    });
  });

  describe('COMP-02: Additive artifact coexistence with legacy knowledge flows', () => {
    it('should leave knowledgeEntries unchanged when creating artifacts (COMP-02, T-12-05)', async () => {
      // Arrange: Create existing knowledge entries
      storeData.counters.knowledge = 2;
      const existingEntry1 = {
        id: 'knowledge_1',
        teamId: null,
        scope: 'global' as const,
        labels: ['legacy', 'test'],
        shortcut: 'Legacy Entry 1',
        detail: 'Legacy knowledge entry 1',
        requiredLevel: 0,
        lifecycleState: 'approved' as const,
        ownerUserId: userId,
        latestRevision: {
          revision: 1,
          submittedAt: createdAt,
          submittedByUserId: userId,
          shortcut: 'Legacy Entry 1',
          detail: 'Legacy knowledge entry 1',
          labels: ['legacy', 'test'],
          reviewNotes: [],
        },
        history: [],
        metadata: {
          scopeLabel: 'global-constraint',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: null,
          latestSubmittedAt: null,
          latestReviewedAt: null,
          latestDecision: null,
        },
        latestSubmissionId: null,
        submissionHistory: [],
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        embeddingCache: null,
        indexState: null,
        createdAt,
        updatedAt: createdAt,
      };
      const existingEntry2 = {
        ...existingEntry1,
        id: 'knowledge_2',
        shortcut: 'Legacy Entry 2',
        detail: 'Legacy knowledge entry 2',
      };
      storeData.knowledgeEntries.push(existingEntry1, existingEntry2);

      const initialKnowledgeCount = storeData.knowledgeEntries.length;
      const initialEntry1Id = storeData.knowledgeEntries[0].id;
      const initialEntry2Id = storeData.knowledgeEntries[1].id;

      // Act: Create an artifact
      createSkillArtifactRecord({
        store,
        data: storeData,
        ownerUserId: userId,
        teamId: null,
        payload: {
          scope: 'global',
          labels: ['docker'],
          title: 'Docker Skill',
          slug: 'docker-skill',
          requiredLevel: 3,
          files: [],
          scriptDescriptors: [],
          sourceKind: 'skill-directory',
        },
        requiredLevel: 3,
        createdAt,
        preReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: createdAt,
          notes: [],
        },
      });

      // Assert: knowledgeEntries should be unchanged
      expect(storeData.knowledgeEntries.length).toBe(initialKnowledgeCount);
      expect(storeData.knowledgeEntries[0].id).toBe(initialEntry1Id);
      expect(storeData.knowledgeEntries[1].id).toBe(initialEntry2Id);

      // Assert: skillArtifacts should coexist
      expect(storeData.skillArtifacts).toBeDefined();
      expect(storeData.skillArtifacts.length).toBe(1);
    });

    it('should preserve knowledge entry governance when artifacts exist (COMP-02, T-12-07, T-12-08)', async () => {
      // Arrange: Create a knowledge entry and an artifact
      storeData.counters.knowledge = 1;
      const knowledgeEntry = {
        id: 'knowledge_1',
        teamId: null,
        scope: 'global' as const,
        labels: ['security'],
        shortcut: 'Security Best Practice',
        detail: 'Important security practice',
        requiredLevel: 5,
        lifecycleState: 'approved' as const,
        ownerUserId: userId,
        latestRevision: {
          revision: 1,
          submittedAt: createdAt,
          submittedByUserId: userId,
          shortcut: 'Security Best Practice',
          detail: 'Important security practice',
          labels: ['security'],
          reviewNotes: [],
        },
        history: [],
        metadata: {
          scopeLabel: 'global-constraint',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: null,
          latestSubmittedAt: null,
          latestReviewedAt: null,
          latestDecision: null,
        },
        latestSubmissionId: null,
        submissionHistory: [],
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        embeddingCache: null,
        indexState: null,
        createdAt,
        updatedAt: createdAt,
      };
      storeData.knowledgeEntries.push(knowledgeEntry);

      // Create an artifact with different governance
      const artifact = createSkillArtifactRecord({
        store,
        data: storeData,
        ownerUserId: userId,
        teamId: teamId,
        payload: {
          scope: 'project',
          labels: ['team-skill'],
          title: 'Team Artifact',
          slug: 'team-artifact',
          requiredLevel: 3,
          files: [],
          scriptDescriptors: [],
          sourceKind: 'skill-directory',
        },
        requiredLevel: 3,
        createdAt,
        preReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: createdAt,
          notes: [],
        },
      });

      // Assert: Knowledge entry governance should be preserved
      expect(storeData.knowledgeEntries[0].id).toBe('knowledge_1');
      expect(storeData.knowledgeEntries[0].scope).toBe('global');
      expect(storeData.knowledgeEntries[0].requiredLevel).toBe(5);
      expect(storeData.knowledgeEntries[0].lifecycleState).toBe('approved');

      // Assert: Artifact should have its own governance
      expect(artifact.scope).toBe('project');
      expect(artifact.requiredLevel).toBe(3);
      expect(artifact.teamId).toBe(teamId);

      // Assert: Both should coexist without interference
      expect(storeData.knowledgeEntries.length).toBe(1);
      expect(storeData.skillArtifacts.length).toBe(1);
    });
  });
});
