import { beforeEach, describe, expect, it } from 'vitest';

import type { AgentReviewResult } from '@trapmap/contracts';

import type { SkillArtifactRecord, SkillShareerStore, StoreData } from '../store.js';
import { nowIso } from '../store.js';
import {
  type SkillEditPayload,
  type SkillRevisionSummary,
  computeEditSourceHash,
  getSkillHistory,
  mergeEditPayload,
  submitSkillEdit,
} from './edit.js';

// Helper to create a minimal artifact for testing
function createTestArtifact(overrides: Partial<SkillArtifactRecord> = {}): SkillArtifactRecord {
  const now = nowIso();
  return {
    id: 'artifact_1',
    teamId: null,
    scope: 'global',
    labels: ['test'],
    title: 'Test Artifact',
    slug: 'test-artifact',
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      sourceHash: 'hash1',
      files: [
        {
          path: 'SKILL.md',
          kind: 'skill-markdown',
          sha256: 'skill-hash',
          sizeBytes: 100,
          mediaType: 'text/markdown',
          source: 'SKILL.md',
          includeInDerivation: true,
          activationOnly: false,
        },
        {
          path: 'references/guide.md',
          kind: 'reference',
          sha256: 'guide-hash',
          sizeBytes: 200,
          mediaType: 'text/markdown',
          source: 'references/',
          includeInDerivation: true,
          activationOnly: false,
        },
      ],
      submittedAt: now,
      submittedByUserId: 'user_1',
      scriptDescriptors: [],
      derived: null,
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'submission_1',
      latestSubmittedAt: now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    agentReview: {
      status: 'agent-pass',
      duplicateRisk: 'low',
      correctnessRisk: 'low',
      completenessRisk: 'low',
      checkedAt: now,
      notes: [],
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Mock pre-review function
function createMockPreReview(
  status: 'agent-pass' | 'agent-rejected' = 'agent-pass',
): (input: unknown) => Promise<AgentReviewResult> {
  return async () => ({
    status,
    duplicateRisk: 'low',
    correctnessRisk: 'low',
    completenessRisk: 'low',
    checkedAt: nowIso(),
    notes: [],
  });
}

describe('edit helper', () => {
  describe('computeEditSourceHash', () => {
    it('computes hash from derivation-eligible files only', () => {
      const files = [
        { path: 'SKILL.md', sha256: 'skill-hash' },
        { path: 'references/guide.md', sha256: 'guide-hash' },
        { path: 'assets/image.png', sha256: 'image-hash' }, // Not derivation-eligible
        { path: 'scripts/run.sh', sha256: 'script-hash' }, // Not derivation-eligible
      ];

      const hash = computeEditSourceHash(files);

      // Hash should be computed from SKILL.md and references/guide.md only
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 hex digest
    });

    it('produces consistent hash regardless of input order', () => {
      const files1 = [
        { path: 'SKILL.md', sha256: 'skill-hash' },
        { path: 'references/guide.md', sha256: 'guide-hash' },
      ];

      const files2 = [
        { path: 'references/guide.md', sha256: 'guide-hash' },
        { path: 'SKILL.md', sha256: 'skill-hash' },
      ];

      const hash1 = computeEditSourceHash(files1);
      const hash2 = computeEditSourceHash(files2);

      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different content', () => {
      const files1 = [{ path: 'SKILL.md', sha256: 'hash1' }];
      const files2 = [{ path: 'SKILL.md', sha256: 'hash2' }];

      const hash1 = computeEditSourceHash(files1);
      const hash2 = computeEditSourceHash(files2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('mergeEditPayload', () => {
    it('replaces all files when files are provided', () => {
      const artifact = createTestArtifact();
      const editPayload: SkillEditPayload = {
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'new-skill-hash',
            sizeBytes: 150,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
            content: 'New content',
          },
        ],
      };

      const merged = mergeEditPayload({ artifact, editPayload });

      expect(merged.files).toHaveLength(1);
      expect(merged.files[0]!.sha256).toBe('new-skill-hash');
    });

    it('preserves existing files when only title is updated', () => {
      const artifact = createTestArtifact();
      const originalFileCount = artifact.latestRevision.files.length;
      const editPayload: SkillEditPayload = {
        title: 'Updated Title',
      };

      const merged = mergeEditPayload({ artifact, editPayload });

      expect(merged.files).toHaveLength(originalFileCount);
      expect(merged.title).toBe('Updated Title');
    });

    it('preserves existing files when only labels are updated', () => {
      const artifact = createTestArtifact();
      const originalFileCount = artifact.latestRevision.files.length;
      const editPayload: SkillEditPayload = {
        labels: ['updated', 'labels'],
      };

      const merged = mergeEditPayload({ artifact, editPayload });

      expect(merged.files).toHaveLength(originalFileCount);
      expect(merged.labels).toEqual(['updated', 'labels']);
    });

    it('preserves existing script descriptors when not provided', () => {
      const artifact = createTestArtifact({
        latestRevision: {
          ...createTestArtifact().latestRevision,
          scriptDescriptors: [
            {
              path: 'scripts/build.sh',
              sha256: 'script-hash',
              capability: 'Build',
              argsSchemaSummary: 'none',
              sideEffectSummary: 'builds project',
              defaultPolicy: 'manual',
            },
          ],
        },
      });

      const editPayload: SkillEditPayload = {
        title: 'Updated Title',
      };

      const merged = mergeEditPayload({ artifact, editPayload });

      expect(merged.scriptDescriptors).toHaveLength(1);
      expect(merged.scriptDescriptors[0]!.path).toBe('scripts/build.sh');
    });

    it('replaces script descriptors when provided', () => {
      const artifact = createTestArtifact({
        latestRevision: {
          ...createTestArtifact().latestRevision,
          scriptDescriptors: [
            {
              path: 'scripts/old.sh',
              sha256: 'old-hash',
              capability: 'Old',
              argsSchemaSummary: 'none',
              sideEffectSummary: 'old script',
              defaultPolicy: 'manual',
            },
          ],
        },
      });

      const editPayload: SkillEditPayload = {
        scriptDescriptors: [
          {
            path: 'scripts/new.sh',
            sha256: 'new-hash',
            capability: 'New',
            argsSchemaSummary: 'none',
            sideEffectSummary: 'new script',
            defaultPolicy: 'auto',
          },
        ],
      };

      const merged = mergeEditPayload({ artifact, editPayload });

      expect(merged.scriptDescriptors).toHaveLength(1);
      expect(merged.scriptDescriptors[0]!.path).toBe('scripts/new.sh');
    });

    it('computes source hash from merged files', () => {
      const artifact = createTestArtifact();
      const editPayload: SkillEditPayload = {
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'new-hash',
            sizeBytes: 100,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
            content: 'content',
          },
        ],
      };

      const merged = mergeEditPayload({ artifact, editPayload });

      expect(merged.sourceHash).toBeDefined();
      expect(merged.sourceHash).toHaveLength(64);
    });
  });

  describe('submitSkillEdit', () => {
    let mockStore: SkillShareerStore;
    let mockData: StoreData;

    beforeEach(() => {
      // Create minimal mock store and data
      mockStore = {
        nextId: () => `id_${Date.now()}`,
      } as unknown as SkillShareerStore;

      mockData = {
        counters: { artifact: 1 },
        users: [
          {
            id: 'user_1',
            handle: 'testuser',
            notes: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
        ],
        teams: [],
        memberships: [],
        accessKeys: [],
        sessions: [],
        knowledgeEntries: [],
        auditEvents: [],
        skillArtifacts: [],
        artifactFilePayloads: [],
        candidateSubmissions: [],
        duplicateCases: [],
      } as StoreData;
    });

    it('merges edit payload and runs pre-review', async () => {
      const artifact = createTestArtifact();
      mockData.skillArtifacts = [artifact];

      const editPayload: SkillEditPayload = {
        title: 'Updated Title',
      };

      const result = await submitSkillEdit({
        store: mockStore,
        data: mockData,
        artifact,
        editorUserId: 'user_1',
        editPayload,
        submittedAt: nowIso(),
        runPreReview: createMockPreReview(),
      });

      expect(result.artifact.title).toBe('Updated Title');
      expect(result.previousRevision).toBe(1);
    });

    it('appends new revision with merged content', async () => {
      // Create artifact with existing history entry
      const now = nowIso();
      const artifact = createTestArtifact();
      artifact.history = [artifact.latestRevision]; // Initialize history with current revision
      mockData.skillArtifacts = [artifact];

      const editPayload: SkillEditPayload = {
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'new-skill-hash',
            sizeBytes: 200,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
            content: 'New content',
          },
        ],
      };

      const result = await submitSkillEdit({
        store: mockStore,
        data: mockData,
        artifact,
        editorUserId: 'user_1',
        editPayload,
        submittedAt: nowIso(),
        runPreReview: createMockPreReview(),
      });

      expect(result.artifact.latestRevision.revision).toBe(2);
      expect(result.artifact.latestRevision.files).toHaveLength(1);
      expect(result.artifact.latestRevision.files[0]!.sha256).toBe('new-skill-hash');
    });

    it('computes source hash from derivation-eligible files', async () => {
      const artifact = createTestArtifact();
      mockData.skillArtifacts = [artifact];

      const editPayload: SkillEditPayload = {
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'skill-content-hash',
            sizeBytes: 100,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
            content: 'content',
          },
          {
            path: 'references/doc.md',
            kind: 'reference',
            sha256: 'doc-hash',
            sizeBytes: 200,
            mediaType: 'text/markdown',
            source: 'references/',
            includeInDerivation: true,
            activationOnly: false,
            content: 'doc content',
          },
        ],
      };

      const result = await submitSkillEdit({
        store: mockStore,
        data: mockData,
        artifact,
        editorUserId: 'user_1',
        editPayload,
        submittedAt: nowIso(),
        runPreReview: createMockPreReview(),
      });

      // Source hash should be computed from both derivation-eligible files
      const expectedSourceHash = computeEditSourceHash(editPayload.files!);
      expect(result.artifact.latestRevision.sourceHash).toBe(expectedSourceHash);
    });

    it('preserves existing script descriptors when only files are updated', async () => {
      const artifact = createTestArtifact({
        latestRevision: {
          ...createTestArtifact().latestRevision,
          scriptDescriptors: [
            {
              path: 'scripts/build.sh',
              sha256: 'build-hash',
              capability: 'Build',
              argsSchemaSummary: 'none',
              sideEffectSummary: 'builds',
              defaultPolicy: 'manual',
            },
          ],
        },
      });
      mockData.skillArtifacts = [artifact];

      const editPayload: SkillEditPayload = {
        title: 'Updated Title',
      };

      const result = await submitSkillEdit({
        store: mockStore,
        data: mockData,
        artifact,
        editorUserId: 'user_1',
        editPayload,
        submittedAt: nowIso(),
        runPreReview: createMockPreReview(),
      });

      expect(result.artifact.latestRevision.scriptDescriptors).toHaveLength(1);
      expect(result.artifact.latestRevision.scriptDescriptors[0]!.path).toBe('scripts/build.sh');
    });

    it('returns previous revision number and lifecycle transition', async () => {
      // Create artifact with existing history entry
      const now = nowIso();
      const artifact = createTestArtifact();
      artifact.history = [artifact.latestRevision]; // Initialize history with current revision
      mockData.skillArtifacts = [artifact];

      const editPayload: SkillEditPayload = {
        title: 'Updated Title',
      };

      const result = await submitSkillEdit({
        store: mockStore,
        data: mockData,
        artifact,
        editorUserId: 'user_1',
        editPayload,
        submittedAt: nowIso(),
        runPreReview: createMockPreReview(),
      });

      expect(result.previousRevision).toBe(1);
      // When an approved artifact is edited, it transitions back to pending review (agent-pass)
      expect(result.lifecycleTransition).not.toBeNull();
      expect(result.lifecycleTransition?.from).toBe('approved');
      expect(result.lifecycleTransition?.to).toBe('agent-pass');
    });

    it('transitions approved artifact back to pending when pre-review rejects', async () => {
      const artifact = createTestArtifact();
      artifact.lifecycleState = 'approved';
      mockData.skillArtifacts = [artifact];

      const editPayload: SkillEditPayload = {
        title: 'Updated Title',
      };

      const result = await submitSkillEdit({
        store: mockStore,
        data: mockData,
        artifact,
        editorUserId: 'user_1',
        editPayload,
        submittedAt: nowIso(),
        runPreReview: createMockPreReview('agent-rejected'),
      });

      expect(result.lifecycleTransition).not.toBeNull();
      expect(result.lifecycleTransition?.from).toBe('approved');
      expect(result.lifecycleTransition?.to).toBe('agent-rejected');
    });
  });

  describe('getSkillHistory', () => {
    let mockData: StoreData;

    beforeEach(() => {
      mockData = {
        counters: {},
        users: [
          {
            id: 'user_1',
            handle: 'submitter',
            notes: null,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          },
          { id: 'user_2', handle: 'editor', notes: null, createdAt: nowIso(), updatedAt: nowIso() },
        ],
        teams: [],
        memberships: [],
        accessKeys: [],
        sessions: [],
        knowledgeEntries: [],
        auditEvents: [],
        skillArtifacts: [],
        artifactFilePayloads: [],
        candidateSubmissions: [],
        duplicateCases: [],
      } as StoreData;
    });

    it('returns revision summaries from artifact history', () => {
      const now = nowIso();
      const artifact = createTestArtifact({
        id: 'artifact_history_1',
        history: [
          {
            revision: 1,
            sourceHash: 'hash1',
            files: [],
            submittedAt: now,
            submittedByUserId: 'user_1',
            scriptDescriptors: [],
            derived: null,
          },
          {
            revision: 2,
            sourceHash: 'hash2',
            files: [],
            submittedAt: now,
            submittedByUserId: 'user_2',
            scriptDescriptors: [],
            derived: null,
          },
        ],
        lifecycleHistory: [
          {
            id: 'event_1',
            type: 'agent-reviewed',
            createdAt: now,
            actorUserId: null,
            submissionId: 'sub_1',
            revision: 1,
            state: 'agent-pass',
            note: null,
          },
          {
            id: 'event_2',
            type: 'agent-reviewed',
            createdAt: now,
            actorUserId: null,
            submissionId: 'sub_2',
            revision: 2,
            state: 'approved',
            note: null,
          },
        ],
      });

      mockData.skillArtifacts = [artifact];

      const history = getSkillHistory({ data: mockData, artifactId: 'artifact_history_1' });

      expect(history.artifactId).toBe('artifact_history_1');
      expect(history.revisions).toHaveLength(2);
    });

    it('returns revision metadata without full file manifests', () => {
      const now = nowIso();
      const artifact = createTestArtifact({
        id: 'artifact_no_manifest',
        history: [
          {
            revision: 1,
            sourceHash: 'hash1',
            files: [
              {
                path: 'SKILL.md',
                kind: 'skill-markdown',
                sha256: 'skill-hash',
                sizeBytes: 100,
                mediaType: 'text/markdown',
                source: 'SKILL.md',
                includeInDerivation: true,
                activationOnly: false,
              },
            ],
            submittedAt: now,
            submittedByUserId: 'user_1',
            scriptDescriptors: [],
            derived: null,
          },
        ],
        lifecycleHistory: [
          {
            id: 'event_1',
            type: 'agent-reviewed',
            createdAt: now,
            actorUserId: null,
            submissionId: 'sub_1',
            revision: 1,
            state: 'agent-pass',
            note: null,
          },
        ],
      });

      mockData.skillArtifacts = [artifact];

      const history = getSkillHistory({ data: mockData, artifactId: 'artifact_no_manifest' });

      // History should not contain file manifests
      const revision = history.revisions[0] as SkillRevisionSummary;
      expect(revision).toBeDefined();
      expect(revision.revision).toBe(1);
      expect(revision.submittedAt).toBe(now);
      expect(revision.lifecycleState).toBe('agent-pass');
      // Revision should not have a 'files' property
      expect((revision as unknown as Record<string, unknown>).files).toBeUndefined();
    });

    it('throws error for non-existent artifact', () => {
      expect(() => {
        getSkillHistory({ data: mockData, artifactId: 'nonexistent' });
      }).toThrow('Artifact not found');
    });

    it('returns current revision and lifecycle state', () => {
      const now = nowIso();
      const artifact = createTestArtifact({
        id: 'artifact_current',
        lifecycleState: 'approved',
        latestRevision: {
          revision: 3,
          sourceHash: 'hash3',
          files: [],
          submittedAt: now,
          submittedByUserId: 'user_1',
          scriptDescriptors: [],
          derived: null,
        },
        history: [
          {
            revision: 1,
            sourceHash: 'hash1',
            files: [],
            submittedAt: now,
            submittedByUserId: 'user_1',
            scriptDescriptors: [],
            derived: null,
          },
          {
            revision: 2,
            sourceHash: 'hash2',
            files: [],
            submittedAt: now,
            submittedByUserId: 'user_1',
            scriptDescriptors: [],
            derived: null,
          },
          {
            revision: 3,
            sourceHash: 'hash3',
            files: [],
            submittedAt: now,
            submittedByUserId: 'user_1',
            scriptDescriptors: [],
            derived: null,
          },
        ],
        lifecycleHistory: [],
      });

      mockData.skillArtifacts = [artifact];

      const history = getSkillHistory({ data: mockData, artifactId: 'artifact_current' });

      expect(history.currentRevision).toBe(3);
      expect(history.lifecycleState).toBe('approved');
    });

    it('resolves submitter handle from user records', () => {
      const now = nowIso();
      const artifact = createTestArtifact({
        id: 'artifact_with_users',
        history: [
          {
            revision: 1,
            sourceHash: 'hash1',
            files: [],
            submittedAt: now,
            submittedByUserId: 'user_1',
            scriptDescriptors: [],
            derived: null,
          },
        ],
        lifecycleHistory: [
          {
            id: 'event_1',
            type: 'agent-reviewed',
            createdAt: now,
            actorUserId: null,
            submissionId: 'sub_1',
            revision: 1,
            state: 'agent-pass',
            note: null,
          },
        ],
      });

      mockData.skillArtifacts = [artifact];

      const history = getSkillHistory({ data: mockData, artifactId: 'artifact_with_users' });

      expect(history.revisions[0].submittedBy.handle).toBe('submitter');
      expect(history.revisions[0].submittedBy.id).toBe('user_1');
    });
  });
});
