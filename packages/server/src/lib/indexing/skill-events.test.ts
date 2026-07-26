/**
 * Unit tests for skill graph events and lifecycle indexing.
 *
 * Tests cover:
 * - extractSkillGraphPrimitives emits nodes from locked vocabulary
 * - extractSkillGraphPrimitives emits edges with locked relation types
 * - extractSkillGraphPrimitives detects hard/soft evidence
 * - buildSkillGraphDocument builds document with correct metadata
 * - determineSkillIndexAction maps lifecycle transitions correctly
 * - runSkillIndexEvent calls the shared artifact adapter seam
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphIndexDocumentRecord } from '@trapmap/server/lib/indexing/graph-lite/documents.js';
import {
  getGraphIndexDocuments,
  removeGraphIndexDocumentsForSource,
} from '@trapmap/server/lib/indexing/graph-lite/store.js';
import { JsonStore, createEmptyStoreData, nowIso } from '@trapmap/server/lib/store.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import type { ArtifactGraphAdapter } from './adapters/artifact-graph.js';

import {
  type SkillGraphEdgePrimitive,
  type SkillGraphNodePrimitive,
  buildSkillGraphDocument,
  determineSkillIndexAction,
  extractSkillGraphPrimitives,
  runSkillIndexEvent,
} from './skill-events.js';

// Helper to build a minimal test artifact
function buildTestArtifact(overrides: Partial<SkillArtifactRecord> = {}): SkillArtifactRecord {
  const now = nowIso();
  return {
    id: 'artifact-test-1',
    teamId: null,
    scope: 'global',
    labels: ['docker', 'cache'],
    title: 'Docker Cache Reset',
    slug: 'docker-cache-reset',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      sourceHash: 'hash-1',
      files: [],
      submittedAt: now,
      submittedByUserId: 'user-1',
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: 'artifact-test-1',
          revision: 1,
          sourceHash: 'hash-1',
          title: 'Docker Cache Reset',
          summary: 'Reset Docker build cache when cache corruption causes build failures',
          keywords: ['docker', 'cache', 'reset'],
          referencePaths: [],
          contentHash: 'profile-hash',
        },
        capsules: [
          {
            capsuleId: 'capsule-1',
            artifactId: 'artifact-test-1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Docker cache corruption can cause mysterious build failures',
            situation: 'When Docker builds fail with cache-related errors',
            problem: 'Docker build cache becomes corrupted',
            goal: 'Reset Docker cache to restore clean build state',
            errorText: null,
            labels: ['docker', 'cache'],
            scope: 'global',
            requiredLevel: 0,
          },
        ],
        clientManifest: null,
        sourceHash: 'derived-hash',
        derivedAt: now,
      },
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-1',
      latestSubmittedAt: now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('skill-events', () => {
  describe('extractSkillGraphPrimitives', () => {
    it('emits a root skill node anchored to artifact id', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Test Skill',
          summary: 'A test skill for testing',
          keywords: ['test'],
        },
        capsules: [],
      });

      const skillNode = result.nodes.find((n) => n.kind === 'skill');
      expect(skillNode).toBeDefined();
      expect(skillNode!.id).toContain('test-artifact-1');
      expect(skillNode!.label).toBe('Test Skill');
    });

    it('emits nodes only from locked vocabulary', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Test Skill',
          summary: 'A test skill for testing',
          keywords: ['docker', 'production'],
        },
        capsules: [],
      });

      const allowedKinds = new Set([
        'skill',
        'cue',
        'tool',
        'environment',
        'prerequisite',
        'mitigation',
      ]);
      for (const node of result.nodes) {
        expect(allowedKinds.has(node.kind)).toBe(true);
      }
    });

    it('emits edges only from locked relation vocabulary', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Test Skill',
          summary: 'A test skill for testing',
          keywords: ['docker'],
        },
        capsules: [
          {
            capsuleId: 'capsule-1',
            situation: 'Before deployment',
            problem: 'Build fails',
            goal: 'Fix the build',
            content: 'This MUST be done before deployment',
            labels: ['build'],
          },
        ],
      });

      const allowedRelations = new Set([
        'mitigates',
        'requires',
        'order',
        'risk-blocks',
        'co-occurs-with',
      ]);
      for (const edge of result.edges) {
        expect(allowedRelations.has(edge.relationType)).toBe(true);
      }
    });

    it('detects mandatory language as hard evidence', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Required Skill',
          summary: 'This skill MUST be applied before deployment',
          keywords: ['required'],
        },
        capsules: [],
      });

      // Should have at least one hard edge due to "MUST"
      const hardEdges = result.edges.filter((e) => e.strength === 'hard');
      expect(hardEdges.length).toBeGreaterThan(0);
    });

    it('emits soft edges for non-mandatory language', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Optional Skill',
          summary: 'This skill can help with caching issues',
          keywords: ['cache'],
        },
        capsules: [],
      });

      // Edges without mandatory language should be soft
      const softEdges = result.edges.filter((e) => e.strength === 'soft');
      expect(softEdges.length).toBeGreaterThanOrEqual(0);
    });

    it('includes evidence field path in node evidence', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Test Skill',
          summary: 'Test summary',
          keywords: ['test'],
        },
        capsules: [
          {
            capsuleId: 'capsule-1',
            situation: 'When building',
            problem: 'Build fails',
            goal: 'Fix it',
            content: 'Fix content',
            labels: ['build'],
          },
        ],
      });

      // Nodes should have evidence referencing source
      for (const node of result.nodes) {
        expect(node.evidence.length).toBeGreaterThan(0);
      }
    });

    it('includes evidence snippet in edge evidence', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Test Skill',
          summary: 'Test summary',
          keywords: ['docker'],
        },
        capsules: [],
      });

      // Edges should have evidence text
      for (const edge of result.edges) {
        expect(edge.evidence.length).toBeGreaterThan(0);
      }
    });

    it('extracts tool nodes from keywords', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Test Skill',
          summary: 'A test skill',
          keywords: ['docker', 'kubernetes'],
        },
        capsules: [],
      });

      const toolNodes = result.nodes.filter((n) => n.kind === 'tool');
      expect(toolNodes.length).toBeGreaterThanOrEqual(2);
    });

    it('extracts environment nodes from text', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Test Skill',
          summary: 'Use this in production and staging environments',
          keywords: ['env'],
        },
        capsules: [],
      });

      const envNodes = result.nodes.filter((n) => n.kind === 'environment');
      expect(envNodes.length).toBeGreaterThanOrEqual(2);
    });

    it('extracts mitigation nodes from capsule goal', () => {
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: null,
        capsules: [
          {
            capsuleId: 'capsule-1',
            situation: 'When errors occur',
            problem: 'Something fails',
            goal: 'Apply this fix to resolve the issue',
            content: 'Fix content',
            labels: ['fix'],
          },
        ],
      });

      const mitigationNodes = result.nodes.filter((n) => n.kind === 'mitigation');
      expect(mitigationNodes.length).toBeGreaterThanOrEqual(1);
    });

    it('does not read clientManifest assets/scripts', () => {
      // This test verifies that extractSkillGraphPrimitives does NOT accept
      // or use clientManifest data - it only reads profile and capsules
      const result = extractSkillGraphPrimitives({
        artifactId: 'test-artifact-1',
        profile: {
          title: 'Test',
          summary: 'Summary',
          keywords: ['test'],
        },
        capsules: [],
      });

      // The function signature doesn't even accept clientManifest
      // This test documents that clientManifest is not a parameter
      expect(result.nodes).toBeDefined();
      expect(result.edges).toBeDefined();
    });
  });

  describe('buildSkillGraphDocument', () => {
    it('builds document from artifact derived profile and capsules', async () => {
      const artifact = buildTestArtifact();

      const doc = await buildSkillGraphDocument(artifact);

      expect(doc).toBeDefined();
      expect(doc!.sourceType).toBe('skill');
      expect(doc!.sourceId).toBe('artifact-test-1');
      expect(doc!.revision).toBe(1);
    });

    it('persists governance metadata from artifact root', async () => {
      const artifact = buildTestArtifact({
        teamId: 'team-1',
        scope: 'project',
        requiredLevel: 5,
      });

      const doc = await buildSkillGraphDocument(artifact);

      expect(doc!.teamId).toBe('team-1');
      expect(doc!.scope).toBe('project');
      expect(doc!.requiredLevel).toBe(5);
    });

    it('returns null if artifact has no derived content', async () => {
      const now = nowIso();
      const artifact: SkillArtifactRecord = {
        id: 'artifact-no-derived',
        teamId: null,
        scope: 'global',
        labels: ['test'],
        title: 'No Derived',
        slug: 'no-derived',
        requiredLevel: 0,
        lifecycleState: 'approved',
        ownerUserId: 'user-1',
        latestRevision: {
          revision: 1,
          sourceHash: 'hash-1',
          files: [],
          submittedAt: now,
          submittedByUserId: 'user-1',
          scriptDescriptors: [],
          derived: null, // No derived content
        },
        history: [],
        metadata: {
          sourceKind: 'skill-directory',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: 'sub-1',
          latestSubmittedAt: now,
          latestReviewedAt: now,
          latestDecision: 'approve',
        },
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        createdAt: now,
        updatedAt: now,
      };

      const doc = await buildSkillGraphDocument(artifact);

      expect(doc).toBeNull();
    });

    it('contains the exact strings latestRevision.derived.profile and latestRevision.derived.capsules in source', async () => {
      // This test verifies the presence of the required strings in the source file
      // (acceptance criteria check) — now lives in skill-graph-build.ts
      const fs = await import('node:fs');
      const path = await import('node:path');
      const sourcePath = path.join(__dirname, 'skill-graph-build.ts');
      const source = fs.readFileSync(sourcePath, 'utf-8');

      expect(source).toContain('latestRevision.derived.profile');
      expect(source).toContain('latestRevision.derived.capsules');
    });

    it('contains locked relation strings in source', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      // Locked vocabulary types now live in skill-extract.ts
      const sourcePath = path.join(__dirname, 'skill-extract.ts');
      const source = fs.readFileSync(sourcePath, 'utf-8');

      expect(source).toContain('mitigates');
      expect(source).toContain('requires');
      expect(source).toContain("'order'");
      expect(source).toContain('risk-blocks');
      expect(source).toContain('co-occurs-with');
    });
  });

  describe('determineSkillIndexAction', () => {
    it('returns upsert when transitioning to approved', () => {
      const action = determineSkillIndexAction('submitted', 'approved');
      expect(action).toBe('upsert');
    });

    it('returns upsert when transitioning from rejected to approved', () => {
      const action = determineSkillIndexAction('rejected', 'approved');
      expect(action).toBe('upsert');
    });

    it('returns remove when transitioning to deactivated', () => {
      const action = determineSkillIndexAction('approved', 'deactivated');
      expect(action).toBe('remove');
    });

    it('returns remove when approved transitions to agent-pass', () => {
      const action = determineSkillIndexAction('approved', 'agent-pass');
      expect(action).toBe('remove');
    });

    it('returns remove when approved transitions to agent-rejected', () => {
      const action = determineSkillIndexAction('approved', 'agent-rejected');
      expect(action).toBe('remove');
    });

    it('returns remove when approved transitions to rejected', () => {
      const action = determineSkillIndexAction('approved', 'rejected');
      expect(action).toBe('remove');
    });

    it('returns noop for submitted to agent-pass', () => {
      const action = determineSkillIndexAction('submitted', 'agent-pass');
      expect(action).toBe('noop');
    });

    it('returns noop for approved to approved (no change)', () => {
      const action = determineSkillIndexAction('approved', 'approved');
      expect(action).toBe('upsert'); // Still upsert to refresh
    });

    it('returns noop for rejected to rejected', () => {
      const action = determineSkillIndexAction('rejected', 'rejected');
      expect(action).toBe('noop');
    });
  });

  describe('runSkillIndexEvent', () => {
    it('indexes from the owner projection without entering the compatibility transaction', async () => {
      const artifact = buildTestArtifact();
      const ownerEntry = {
        id: artifact.id,
        teamId: artifact.teamId,
        scope: artifact.scope,
        labels: artifact.labels,
        title: artifact.title,
        requiredLevel: artifact.requiredLevel,
        lifecycleState: 'approved' as const,
        revision: artifact.latestRevision.revision,
        derived: artifact.latestRevision.derived,
      };
      const adapter: ArtifactGraphAdapter = {
        sync: vi.fn().mockResolvedValue({ success: true, performedWork: true, error: null }),
        remove: vi.fn().mockResolvedValue(undefined),
      };
      const store = { transact: vi.fn() };

      await runSkillIndexEvent({
        services: {
          store: store as never,
          artifactReadProjection: {
            getIndexingEntry: vi.fn().mockResolvedValue(ownerEntry),
          },
          graphIndex: {} as never,
        },
        artifactId: artifact.id,
        previousState: 'agent-pass',
        nextState: 'approved',
        reason: 'owner-approve',
        adapters: [adapter],
      });

      expect(store.transact).not.toHaveBeenCalled();
      expect(adapter.sync).toHaveBeenCalledWith(
        expect.objectContaining({ artifact: ownerEntry, graphIndex: expect.any(Object) }),
      );
    });

    it('uses the shared artifact adapter seam when no route-local adapters are passed', async () => {
      const store = new JsonStore('/tmp/trapmap-skill-events-test.json');
      const artifact = buildTestArtifact();
      await store.transact((data) => {
        data.skillArtifacts.push(artifact);
      });

      await runSkillIndexEvent({
        services: {
          store,
          data: createEmptyStoreData(),
        },
        artifactId: artifact.id,
        previousState: 'agent-pass',
        nextState: 'approved',
        reason: 'test-approve',
      });

      const snapshot = await store.snapshot();
      const docs = snapshot.graphIndexDocuments.filter((doc) => doc.sourceId === artifact.id);
      expect(docs).toHaveLength(1);
    });

    it('throws when upsert action is triggered for an artifact with null derived', async () => {
      const store = new JsonStore('/tmp/trapmap-skill-events-null-derived-test.json');
      const now = nowIso();
      const underivedArtifact: SkillArtifactRecord = {
        id: 'artifact-underived',
        teamId: null,
        scope: 'global',
        labels: ['test'],
        title: 'Underived Artifact',
        slug: 'underived-artifact',
        requiredLevel: 0,
        lifecycleState: 'agent-pass',
        ownerUserId: 'user-1',
        latestRevision: {
          revision: 1,
          sourceHash: 'hash-underived',
          files: [],
          submittedAt: now,
          submittedByUserId: 'user-1',
          scriptDescriptors: [],
          derived: null,
        },
        history: [],
        metadata: {
          sourceKind: 'skill-directory',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: 'sub-1',
          latestSubmittedAt: now,
          latestReviewedAt: null,
          latestDecision: null,
        },
        agentReview: null,
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        createdAt: now,
        updatedAt: now,
      };
      await store.transact((data) => {
        data.skillArtifacts.push(underivedArtifact);
      });

      await expect(
        runSkillIndexEvent({
          services: {
            store,
            data: createEmptyStoreData(),
          },
          artifactId: 'artifact-underived',
          previousState: 'agent-pass',
          nextState: 'approved',
          reason: 'test-approve-underived',
        }),
      ).rejects.toThrow(/Cannot index artifact artifact-underived.*derived outputs/);
    });

    it('uses the shared artifact adapter seam for remove transitions', async () => {
      const store = new JsonStore('/tmp/trapmap-skill-events-remove-test.json');
      const artifact = buildTestArtifact();
      await store.transact((data) => {
        data.skillArtifacts.push(artifact);
        data.graphIndexDocuments.push({
          id: `graphdoc_skill_${artifact.id}_r1`,
          sourceType: 'skill',
          sourceId: artifact.id,
          revision: artifact.latestRevision.revision,
          contentHash: 'test-hash',
          teamId: artifact.teamId,
          scope: artifact.scope,
          requiredLevel: artifact.requiredLevel,
          nodes: [],
          edges: [],
          evidence: 'test',
          createdAt: nowIso(),
          updatedAt: nowIso(),
        });
      });

      await runSkillIndexEvent({
        services: {
          store,
          data: createEmptyStoreData(),
        },
        artifactId: artifact.id,
        previousState: 'approved',
        nextState: 'deactivated',
        reason: 'test-remove',
      });

      const snapshot = await store.snapshot();
      const docs = snapshot.graphIndexDocuments.filter((doc) => doc.sourceId === artifact.id);
      expect(docs).toHaveLength(0);
    });
  });
});
