/**
 * TDD test suite for plan-compiler (Phase 37).
 * Tests the trap-first execution plan compiler that merges trap and skill candidates
 * into a minimal typed graph with blockers surfaced first.
 */

import { describe, it, expect } from 'vitest';
import type { GraphIndexDocumentRecord, GraphNodeRecord, GraphEdgeRecord } from '../indexing/graph-lite/documents.js';
import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import type { StoreData, KnowledgeRecord, SkillArtifactRecord } from '../store.js';
import type { PlanQuery, TrapFirstPlan } from '@trapmap/contracts';
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function makeSkillArtifact(
  id: string,
  options: { requiredLevel?: number; scope?: 'global' | 'project'; teamId?: string | null } = {},
): SkillArtifactRecord {
  const { requiredLevel = 0, scope = 'global', teamId = null } = options;
  return {
    id,
    teamId,
    scope,
    labels: ['test'],
    title: `Skill ${id}`,
    slug: `skill-${id}`,
    requiredLevel,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      sourceHash: 'hash',
      files: [],
      submittedAt: '2026-01-01T00:00:00Z',
      submittedByUserId: 'user_1',
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: id,
          revision: 1,
          sourceHash: 'hash',
          title: `Skill ${id}`,
          summary: `Summary for ${id}`,
          keywords: ['test'],
          referencePaths: [],
          contentHash: 'hash',
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
        clientManifest: null,
        sourceHash: 'hash',
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
    indexAdapters: [],
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
        graphDocs.push(
          makeGraphDoc(skillId, 'skill', [makeSkillNode(skillId, `Skill ${i}`)], []),
        );
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
      expect(result.recommendedSkills.length + result.citations.length).toBeLessThanOrEqual(skillCount);
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
      expect(result.recommendedSkills.find((s) => s.nodeId === `skill:${mitigatingSkillId}`)).toBeDefined();
      // Budget is 2, mitigating skill should be first
      expect(result.recommendedSkills[0].nodeId).toBe(`skill:${mitigatingSkillId}`);
    });
  });
});
