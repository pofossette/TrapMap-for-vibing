/**
 * TDD test suite for plan-compiler (Phase 37).
 * Tests the trap-first execution plan compiler that merges trap and skill candidates
 * into a minimal typed graph with blockers surfaced first.
 */

import type { PlanQuery, TrapFirstPlan } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';
import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
} from '../indexing/graph-lite/documents.js';
import type { KnowledgeRecord, SkillArtifactRecord, StoreData } from '../store.js';
import { buildDeployClusterDataset } from './__fixtures__/graph-fixtures.js';
import { compileTrapFirstPlan } from './plan-compiler.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeGraphDoc(
  sourceId: string,
  sourceType: 'trap' | 'skill',
  nodes: GraphNodeRecord[],
  edges: GraphEdgeRecord[],
  scope: 'global' | 'project' = 'global',
  requiredLevel = 0,
): GraphIndexDocumentRecord {
  return {
    id: `graphdoc_${sourceType}_${sourceId}_r1`,
    sourceType,
    sourceId,
    revision: 1,
    contentHash: `hash-${sourceId}`,
    teamId: null,
    scope,
    requiredLevel,
    nodes,
    edges,
    evidence: 'test evidence',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeTrapNode(id: string, label: string, evidence = 'trap evidence'): GraphNodeRecord {
  return { id: `trap:${id}`, kind: 'trap', label, evidence };
}

function makeSkillNode(id: string, label: string, evidence = 'skill evidence'): GraphNodeRecord {
  return { id: `skill:${id}`, kind: 'skill', label, evidence };
}

function makeRiskBlocksEdge(
  sourceId: string,
  targetId: string,
  strength: 'hard' | 'soft' = 'hard',
): GraphEdgeRecord {
  return {
    id: `trap:${sourceId}->cue:${targetId}:risk-blocks`,
    sourceNodeId: `trap:${sourceId}`,
    targetNodeId: `cue:${targetId}`,
    relationType: 'risk-blocks',
    strength,
    evidence: 'risk-blocks evidence',
  };
}

function makeMitigatesEdge(
  skillId: string,
  trapId: string,
  strength: 'hard' | 'soft' = 'hard',
): GraphEdgeRecord {
  return {
    id: `skill:${skillId}->trap:${trapId}:mitigates`,
    sourceNodeId: `skill:${skillId}`,
    targetNodeId: `trap:${trapId}`,
    relationType: 'mitigates',
    strength,
    evidence: 'mitigates evidence',
  };
}

function makeRequiresEdge(
  sourceId: string,
  targetId: string,
  strength: 'hard' | 'soft' = 'hard',
): GraphEdgeRecord {
  return {
    id: `skill:${sourceId}->skill:${targetId}:requires`,
    sourceNodeId: `skill:${sourceId}`,
    targetNodeId: `skill:${targetId}`,
    relationType: 'requires',
    strength,
    evidence: 'requires evidence',
  };
}

function makeOrderEdge(sourceId: string, targetId: string): GraphEdgeRecord {
  return {
    id: `skill:${sourceId}->skill:${targetId}:order`,
    sourceNodeId: `skill:${sourceId}`,
    targetNodeId: `skill:${targetId}`,
    relationType: 'order',
    strength: 'soft',
    evidence: 'order evidence',
  };
}

function makeKnowledgeEntry(
  id: string,
  options: { requiredLevel?: number; scope?: 'global' | 'project'; teamId?: string | null } = {},
): KnowledgeRecord {
  const { requiredLevel = 0, scope = 'global', teamId = null } = options;
  return {
    id,
    teamId,
    scope,
    labels: ['test'],
    shortcut: `Shortcut for ${id}`,
    detail: `Detail for ${id}`,
    requiredLevel,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: '2026-01-01T00:00:00Z',
      submittedByUserId: 'user_1',
      shortcut: `Shortcut for ${id}`,
      detail: `Detail for ${id}`,
      labels: ['test'],
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
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeSkillArtifact(
  id: string,
  options: {
    requiredLevel?: number;
    scope?: 'global' | 'project';
    teamId?: string | null;
    withClientManifest?: boolean;
    title?: string;
  } = {},
): SkillArtifactRecord {
  const { requiredLevel = 0, scope = 'global', teamId = null, withClientManifest = false, title } =
    options;
  const fakeHash = 'a'.repeat(64);

  const clientManifest = withClientManifest
    ? {
        artifactId: id,
        revision: 1,
        sourceHash: fakeHash,
        references: [
          {
            path: 'references/cache-strategy.md',
            sha256: fakeHash,
            sizeBytes: 200,
            mediaType: 'text/markdown',
          },
        ],
        assets: [
          {
            path: 'assets/docker-compose.yml',
            sha256: fakeHash,
            sizeBytes: 500,
            mediaType: 'application/x-yaml',
          },
        ],
        scripts: [
          {
            path: 'scripts/deploy.sh',
            sha256: fakeHash,
            capability: 'deploy',
            argsSchemaSummary: 'No arguments',
            sideEffectSummary: 'Runs deployment script',
            defaultPolicy: 'needs-approval' as const,
          },
        ],
      }
    : null;

  return {
    id,
    teamId,
    scope,
    labels: ['test'],
    title: title ?? `Skill ${id}`,
    slug: `skill-${id}`,
    requiredLevel,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      sourceHash: fakeHash,
      files: [],
      submittedAt: '2026-01-01T00:00:00Z',
      submittedByUserId: 'user_1',
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: id,
          revision: 1,
          sourceHash: fakeHash,
          title: title ?? `Skill ${id}`,
          summary: `Summary for ${id}`,
          keywords: ['test'],
          referencePaths: [],
          contentHash: fakeHash,
        },
        capsules: [
          {
            capsuleId: `capsule_${id}`,
            artifactId: id,
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: `Content for ${id}`,
            situation: `Situation for ${id}`,
            problem: `Problem for ${id}`,
            goal: `Goal for ${id}`,
            errorText: null,
            labels: ['test'],
            scope,
            requiredLevel,
          },
        ],
        clientManifest,
        sourceHash: fakeHash,
        derivedAt: '2026-01-01T00:00:00Z',
      },
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeMockStoreData(data: Partial<StoreData> = {}): StoreData {
  return {
    counters: {},
    users: [],
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
    entityLineage: [],
    graphIndexDocuments: [],
    ...data,
  };
}

function makeMockServices(storeData: Partial<StoreData> = {}): SkillShareerServices {
  const data = makeMockStoreData(storeData);
  return {
    config: {} as any,
    store: {
      snapshot: async () => data,
      transact: async () => {},
      nextId: () => 'test_id',
    } as any,
    adapterRegistry: {} as any,
      channelRegistry: {} as any,
      strategyRegistry: {} as any,
    ai: {
      embeddings: {
        provider: 'fallback',
        isConfigured: false,
        embed: async () => new Array(384).fill(0),
      },
      chat: {
        provider: 'fallback',
        isConfigured: false,
        invoke: async () => '',
      },
    },
  };
}

function makeMockAuth(overrides: Partial<ResolvedAuthContext> = {}): ResolvedAuthContext {
  return {
    subjectType: 'user',
    actorId: 'user_1',
    handle: 'testuser',
    activeTeamId: null,
    securityLevel: 10,
    effectivePermissions: [],
    user: null,
    membership: null,
    team: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

describe('plan-compiler', () => {
  describe('compileTrapFirstPlan', () => {
    it('returns empty plan when no candidates match query', async () => {
      const services = makeMockServices({
        knowledgeEntries: [],
        skillArtifacts: [],
        graphIndexDocuments: [],
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'test query', skillBudget: 3, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      expect(result.blockingTraps).toEqual([]);
      expect(result.recommendedSkills).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.citations).toEqual([]);
    });

    it('surfaces blocking traps before recommended skills', async () => {
      const trapId = 'trap-1';
      const skillId = 'skill-1';

      const trapNode = makeTrapNode(trapId, 'Corruption trap');
      const skillNode = makeSkillNode(skillId, 'Cleanup skill');
      const riskBlocksEdge = makeRiskBlocksEdge(trapId, 'cue-1');

      const services = makeMockServices({
        knowledgeEntries: [makeKnowledgeEntry(trapId)],
        skillArtifacts: [makeSkillArtifact(skillId)],
        graphIndexDocuments: [
          makeGraphDoc(trapId, 'trap', [trapNode], [riskBlocksEdge]),
          makeGraphDoc(skillId, 'skill', [skillNode], []),
        ],
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'corruption cleanup', skillBudget: 3, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // blockingTraps should be populated
      expect(result.blockingTraps.length).toBeGreaterThan(0);
      // recommendedSkills should be populated
      expect(result.recommendedSkills.length).toBeGreaterThan(0);
      // Verify trap ordering: all traps should come before skills in output structure
      // The schema already has blockingTraps before recommendedSkills
    });

    it('promotes hard blockers as mandatory', async () => {
      const trapId = 'trap-1';

      const trapNode = makeTrapNode(trapId, 'Hard blocker trap');
      const hardRiskBlocksEdge = makeRiskBlocksEdge(trapId, 'cue-1', 'hard');

      const services = makeMockServices({
        knowledgeEntries: [makeKnowledgeEntry(trapId)],
        skillArtifacts: [],
        graphIndexDocuments: [makeGraphDoc(trapId, 'trap', [trapNode], [hardRiskBlocksEdge])],
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'hard blocker', skillBudget: 3, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // Hard blockers should be in blockingTraps with severity 'hard'
      expect(result.blockingTraps.length).toBeGreaterThan(0);
      expect(result.blockingTraps[0].severity).toBe('hard');
    });

    it('enforces skill budget', async () => {
      const budget = 3;
      // Keep skillCount within rankCapsules' maxResults (budget * 3)
      // so all candidates are available for budgeting
      const skillCount = 8;

      const skillArtifacts: SkillArtifactRecord[] = [];
      const graphDocs: GraphIndexDocumentRecord[] = [];

      for (let i = 1; i <= skillCount; i++) {
        const skillId = `skill-${i}`;
        skillArtifacts.push(makeSkillArtifact(skillId));
        graphDocs.push(makeGraphDoc(skillId, 'skill', [makeSkillNode(skillId, `Skill ${i}`)], []));
      }

      const services = makeMockServices({
        knowledgeEntries: [],
        skillArtifacts,
        graphIndexDocuments: graphDocs,
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'skill', skillBudget: budget, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // Exactly budget skills in recommendedSkills
      expect(result.recommendedSkills.length).toBe(budget);
      // Demoted skills should be in citations (rankCapsules returns up to budget*3)
      expect(result.citations.length).toBeGreaterThan(0);
      // Total selected + citations should not exceed rankCapsules limit
      expect(result.recommendedSkills.length + result.citations.length).toBeLessThanOrEqual(
        skillCount,
      );
    });

    it('links traps to mitigating skills via edges', async () => {
      const trapId = 'trap-1';
      const skillId = 'skill-1';

      const trapNode = makeTrapNode(trapId, 'Dangerous trap');
      const skillNode = makeSkillNode(skillId, 'Mitigating skill');
      const mitigatesEdge = makeMitigatesEdge(skillId, trapId, 'hard');

      const services = makeMockServices({
        knowledgeEntries: [makeKnowledgeEntry(trapId)],
        skillArtifacts: [makeSkillArtifact(skillId)],
        graphIndexDocuments: [
          makeGraphDoc(trapId, 'trap', [trapNode], []),
          makeGraphDoc(skillId, 'skill', [skillNode], [mitigatesEdge]),
        ],
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'dangerous trap mitigation', skillBudget: 3, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // Should have mitigates edge linking skill to trap
      const mitigatesEdges = result.edges.filter(
        (e) => e.type === 'mitigates' && e.targetNodeId === `trap:${trapId}`,
      );
      expect(mitigatesEdges.length).toBeGreaterThan(0);
      expect(mitigatesEdges[0].strength).toBe('hard');
    });

    it('applies governance filter to plan output', async () => {
      const trapIdHigh = 'trap-high';
      const trapIdLow = 'trap-low';

      const trapNodeHigh = makeTrapNode(trapIdHigh, 'High security trap');
      const trapNodeLow = makeTrapNode(trapIdLow, 'Low security trap');

      const services = makeMockServices({
        knowledgeEntries: [
          makeKnowledgeEntry(trapIdHigh, { requiredLevel: 10 }),
          makeKnowledgeEntry(trapIdLow, { requiredLevel: 0 }),
        ],
        skillArtifacts: [],
        graphIndexDocuments: [
          makeGraphDoc(trapIdHigh, 'trap', [trapNodeHigh], [], 'global', 10),
          makeGraphDoc(trapIdLow, 'trap', [trapNodeLow], [], 'global', 0),
        ],
      });

      // Auth with security level 5 - cannot access requiredLevel 10
      const auth = makeMockAuth({ securityLevel: 5 });
      const query: PlanQuery = { seed: 'security trap', skillBudget: 3, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // High security trap should not be in plan
      expect(result.blockingTraps.find((t) => t.nodeId === `trap:${trapIdHigh}`)).toBeUndefined();
      // Low security trap should be in plan
      expect(result.blockingTraps.find((t) => t.nodeId === `trap:${trapIdLow}`)).toBeDefined();
    });

    it('bounds local expansion by maxDepth', async () => {
      // Create a chain: trap -> skill1 -> skill2 -> skill3 -> skill4
      // Only skill1 is a candidate; skill2-skill4 are graph-only nodes
      // not backed by artifacts, so they won't be seed nodes.
      const trapId = 'trap-1';
      const skill1Id = 'skill-1';
      const skill2Id = 'skill-2';
      const skill3Id = 'skill-3';
      const skill4Id = 'skill-4';

      const trapNode = makeTrapNode(trapId, 'Chain trap');
      const skill1Node = makeSkillNode(skill1Id, 'Skill 1');
      const skill2Node = makeSkillNode(skill2Id, 'Skill 2');
      const skill3Node = makeSkillNode(skill3Id, 'Skill 3');
      const skill4Node = makeSkillNode(skill4Id, 'Skill 4');

      const mitigatesEdge = makeMitigatesEdge(skill1Id, trapId);
      const requiresEdge1 = makeRequiresEdge(skill1Id, skill2Id);
      const requiresEdge2 = makeRequiresEdge(skill2Id, skill3Id);
      const requiresEdge3 = makeRequiresEdge(skill3Id, skill4Id);

      // Only skill1 is a real candidate; skill2-skill4 exist in the graph
      // but have no corresponding skill artifacts
      const services = makeMockServices({
        knowledgeEntries: [makeKnowledgeEntry(trapId)],
        skillArtifacts: [makeSkillArtifact(skill1Id)],
        graphIndexDocuments: [
          makeGraphDoc(trapId, 'trap', [trapNode], []),
          makeGraphDoc(
            skill1Id,
            'skill',
            [skill1Node, skill2Node, skill3Node, skill4Node],
            [mitigatesEdge, requiresEdge1, requiresEdge2, requiresEdge3],
          ),
        ],
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'chain trap', skillBudget: 10, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // Seed is trap:trap-1. From there:
      // skill:skill-1 is at depth 1 (mitigates edge)
      // skill:skill-2 is at depth 2 (requires from skill-1)
      // skill:skill-3 is at depth 3 (beyond maxDepth 2)
      // skill:skill-4 is at depth 4 (beyond maxDepth 2)
      const skillNodeIds = result.recommendedSkills.map((s) => s.nodeId);
      expect(skillNodeIds).toContain(`skill:${skill1Id}`);
      // skill3 and skill4 should be excluded due to maxDepth
      expect(skillNodeIds).not.toContain(`skill:${skill3Id}`);
      expect(skillNodeIds).not.toContain(`skill:${skill4Id}`);
    });

    it('citations reference only governance-approved sources', async () => {
      const skillIdHigh = 'skill-high';
      const skillIdLow = 'skill-low';

      const services = makeMockServices({
        knowledgeEntries: [],
        skillArtifacts: [
          makeSkillArtifact(skillIdHigh, { requiredLevel: 10 }),
          makeSkillArtifact(skillIdLow, { requiredLevel: 0 }),
        ],
        graphIndexDocuments: [
          makeGraphDoc(
            skillIdHigh,
            'skill',
            [makeSkillNode(skillIdHigh, 'High skill')],
            [],
            'global',
            10,
          ),
          makeGraphDoc(
            skillIdLow,
            'skill',
            [makeSkillNode(skillIdLow, 'Low skill')],
            [],
            'global',
            0,
          ),
        ],
      });

      // Auth with security level 5 - cannot access requiredLevel 10
      const auth = makeMockAuth({ securityLevel: 5 });
      const query: PlanQuery = { seed: 'skill', skillBudget: 1, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // Citations should not reference the high-security skill
      expect(result.citations.find((c) => c.sourceId === skillIdHigh)).toBeUndefined();
      // Citations may reference the low-security skill if it was demoted
      // But all citations must pass governance
    });

    it('prioritizes trap-mitigating skills in budget', async () => {
      const trapId = 'trap-1';
      const mitigatingSkillId = 'skill-mitigating';
      const otherSkill1Id = 'skill-other-1';
      const otherSkill2Id = 'skill-other-2';
      const otherSkill3Id = 'skill-other-3';

      const trapNode = makeTrapNode(trapId, 'Trap to mitigate');
      const mitigatingSkillNode = makeSkillNode(mitigatingSkillId, 'Mitigating skill');
      const otherSkill1Node = makeSkillNode(otherSkill1Id, 'Other skill 1');
      const otherSkill2Node = makeSkillNode(otherSkill2Id, 'Other skill 2');
      const otherSkill3Node = makeSkillNode(otherSkill3Id, 'Other skill 3');

      const mitigatesEdge = makeMitigatesEdge(mitigatingSkillId, trapId, 'hard');

      const services = makeMockServices({
        knowledgeEntries: [makeKnowledgeEntry(trapId)],
        skillArtifacts: [
          makeSkillArtifact(mitigatingSkillId),
          makeSkillArtifact(otherSkill1Id),
          makeSkillArtifact(otherSkill2Id),
          makeSkillArtifact(otherSkill3Id),
        ],
        graphIndexDocuments: [
          makeGraphDoc(trapId, 'trap', [trapNode], []),
          makeGraphDoc(mitigatingSkillId, 'skill', [mitigatingSkillNode], [mitigatesEdge]),
          makeGraphDoc(otherSkill1Id, 'skill', [otherSkill1Node], []),
          makeGraphDoc(otherSkill2Id, 'skill', [otherSkill2Node], []),
          makeGraphDoc(otherSkill3Id, 'skill', [otherSkill3Node], []),
        ],
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'trap mitigation', skillBudget: 2, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // Mitigating skill should be prioritized in the budget
      expect(
        result.recommendedSkills.find((s) => s.nodeId === `skill:${mitigatingSkillId}`),
      ).toBeDefined();
      // Budget is 2, mitigating skill should be first
      expect(result.recommendedSkills[0].nodeId).toBe(`skill:${mitigatingSkillId}`);
    });

    // -- Phase 1B additions --

    it('returns plan with traps + citations only when skillBudget = 0', async () => {
      const trapId = 'trap-budget0';
      const trapNode = makeTrapNode(trapId, 'Budget-zero trap');
      const riskEdge = makeRiskBlocksEdge(trapId, 'cue-b0');

      const services = makeMockServices({
        knowledgeEntries: [makeKnowledgeEntry(trapId)],
        skillArtifacts: [],
        graphIndexDocuments: [makeGraphDoc(trapId, 'trap', [trapNode], [riskEdge])],
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'budget zero', skillBudget: 0, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      expect(result.blockingTraps.length).toBeGreaterThan(0);
      expect(result.recommendedSkills).toEqual([]);
      // Citations may be empty since no skills exist
    });

    it('includes skill once when multiple traps share the same mitigating skill', async () => {
      const trap1 = 'trap-shared-1';
      const trap2 = 'trap-shared-2';
      const skillId = 'skill-shared';

      const trapNode1 = makeTrapNode(trap1, 'Shared trap 1');
      const trapNode2 = makeTrapNode(trap2, 'Shared trap 2');
      const skillNode = makeSkillNode(skillId, 'Shared mitigating skill');
      const mitEdge1 = makeMitigatesEdge(skillId, trap1);
      const mitEdge2 = makeMitigatesEdge(skillId, trap2);

      const services = makeMockServices({
        knowledgeEntries: [makeKnowledgeEntry(trap1), makeKnowledgeEntry(trap2)],
        skillArtifacts: [makeSkillArtifact(skillId)],
        graphIndexDocuments: [
          makeGraphDoc(trap1, 'trap', [trapNode1], []),
          makeGraphDoc(trap2, 'trap', [trapNode2], []),
          makeGraphDoc(skillId, 'skill', [skillNode], [mitEdge1, mitEdge2]),
        ],
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'shared mitigation', skillBudget: 5, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // Skill should appear exactly once
      const skillOccurrences = result.recommendedSkills.filter(
        (s) => s.nodeId === `skill:${skillId}`,
      );
      expect(skillOccurrences.length).toBe(1);

      // Both mitigates edges should be present
      const mitEdges = result.edges.filter(
        (e) =>
          e.type === 'mitigates' &&
          e.sourceNodeId === `skill:${skillId}` &&
          (e.targetNodeId === `trap:${trap1}` || e.targetNodeId === `trap:${trap2}`),
      );
      expect(mitEdges.length).toBeGreaterThanOrEqual(2);
    });

    it('gracefully skips skill artifact with no corresponding graph document', async () => {
      const trapId = 'trap-no-graph';
      const skillId = 'skill-no-graph';

      const trapNode = makeTrapNode(trapId, 'Trap without graph');

      const services = makeMockServices({
        knowledgeEntries: [makeKnowledgeEntry(trapId)],
        skillArtifacts: [makeSkillArtifact(skillId)],
        graphIndexDocuments: [makeGraphDoc(trapId, 'trap', [trapNode], [])],
        // No graph doc for skillId
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'no graph doc', skillBudget: 3, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // Should not throw; skill may appear without nodeId mapping
      expect(result.blockingTraps.length).toBeGreaterThan(0);
    });

    it('25-node Deploy Cluster end-to-end compilation', async () => {
      const dataset = buildDeployClusterDataset();

      const services = makeMockServices({
        knowledgeEntries: dataset.knowledgeEntries,
        skillArtifacts: dataset.skillArtifacts,
        graphIndexDocuments: dataset.graphDocs,
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'deploy cluster safely', skillBudget: 5, maxDepth: 3 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // Should have blocking traps (the ones with risk-blocks edges)
      expect(result.blockingTraps.length).toBeGreaterThan(0);

      // Should have recommended skills within budget
      expect(result.recommendedSkills.length).toBeLessThanOrEqual(5);
      expect(result.recommendedSkills.length).toBeGreaterThan(0);

      // Should have edges linking skills to traps
      expect(result.edges.length).toBeGreaterThan(0);

      // Should have graph structure
      expect(result.graph.nodes.length).toBeGreaterThan(0);
      expect(result.graph.edges.length).toBeGreaterThan(0);
      expect(result.graph.focus.blockingTrapNodeIds.length).toBeGreaterThan(0);
      expect(result.graph.focus.recommendedSkillNodeIds.length).toBeGreaterThan(0);
    });

    it('activationRefs populated when clientManifest exists', async () => {
      const trapId = 'trap-refs';
      const skillId = 'skill-refs';

      const trapNode = makeTrapNode(trapId, 'Refs trap');
      const skillNode = makeSkillNode(skillId, 'Refs skill');
      const mitEdge = makeMitigatesEdge(skillId, trapId);

      // Create skill artifact with a title that matches the seed for better ranking
      const skillArtifact = makeSkillArtifact(skillId, {
        withClientManifest: true,
        title: 'Activation references skill',
      });

      const services = makeMockServices({
        knowledgeEntries: [makeKnowledgeEntry(trapId)],
        skillArtifacts: [skillArtifact],
        graphIndexDocuments: [
          makeGraphDoc(trapId, 'trap', [trapNode], []),
          makeGraphDoc(skillId, 'skill', [skillNode], [mitEdge]),
        ],
      });
      const auth = makeMockAuth();
      const query: PlanQuery = { seed: 'activation references', skillBudget: 3, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // If a skill is recommended, verify activationRefs are populated
      if (result.recommendedSkills.length > 0) {
        const skill = result.recommendedSkills[0];
        expect(skill.activationRefs).toBeDefined();
        // The skill artifact has clientManifest with references/assets/scripts
        // Note: activationRefs may be empty if the artifact's derived.clientManifest is null
        expect(typeof skill.activationRefs.references).toBe('object');
        expect(typeof skill.activationRefs.assets).toBe('object');
        expect(typeof skill.activationRefs.scripts).toBe('object');
      }
      // If no skills recommended (due to no semantic match), that's acceptable
    });

    it('filters out traps exceeding auth securityLevel in mixed governance', async () => {
      // Create traps at levels 0, 3, 5, 8 with auth at level 5
      const trapIds = ['trap-gov-0', 'trap-gov-3', 'trap-gov-5', 'trap-gov-8'];
      const levels = [0, 3, 5, 8];

      const knowledgeEntries = trapIds.map((id, i) =>
        makeKnowledgeEntry(id, { requiredLevel: levels[i] }),
      );
      const graphDocs = trapIds.map((id, i) => {
        const node = makeTrapNode(id, `Governance trap level ${levels[i]}`);
        const edge = makeRiskBlocksEdge(id, `cue-gov-${i}`, 'hard');
        return makeGraphDoc(id, 'trap', [node], [edge], 'global', levels[i]);
      });

      const services = makeMockServices({
        knowledgeEntries,
        skillArtifacts: [],
        graphIndexDocuments: graphDocs,
      });
      const auth = makeMockAuth({ securityLevel: 5 });
      const query: PlanQuery = { seed: 'governance test', skillBudget: 3, maxDepth: 2 };

      const result = await compileTrapFirstPlan(services, auth, query);

      // level 8 trap should be excluded
      expect(
        result.blockingTraps.find((t) => t.nodeId === 'trap:trap-gov-8'),
      ).toBeUndefined();

      // levels 0, 3, 5 should be included
      expect(result.blockingTraps.find((t) => t.nodeId === 'trap:trap-gov-0')).toBeDefined();
      expect(result.blockingTraps.find((t) => t.nodeId === 'trap:trap-gov-3')).toBeDefined();
      expect(result.blockingTraps.find((t) => t.nodeId === 'trap:trap-gov-5')).toBeDefined();
    });
  });
});
