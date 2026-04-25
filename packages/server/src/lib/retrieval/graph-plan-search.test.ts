import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { nowIso } from '../store.js';
import { assessGraphPlanReadiness, searchKnowledgeGraphPlan } from './graph-plan-search.js';
import { compileTrapFirstPlan } from './plan-compiler.js';
import { searchKnowledge, searchKnowledgeV2 } from '../retrieval.js';

vi.mock('./plan-compiler.js', () => ({
  compileTrapFirstPlan: vi.fn(),
}));

vi.mock('../retrieval.js', () => ({
  searchKnowledge: vi.fn(),
  searchKnowledgeV2: vi.fn(),
}));

const mockedCompileTrapFirstPlan = vi.mocked(compileTrapFirstPlan);
const mockedSearchKnowledge = vi.mocked(searchKnowledge);
const mockedSearchKnowledgeV2 = vi.mocked(searchKnowledgeV2);

function makeServices(): SkillShareerServices {
  return {
    config: {
      ragLog: {
        enabled: false,
        logDir: 'logs/rag',
        maxFileSizeBytes: 1024,
        maxBackupFiles: 1,
      },
      dataFile: '/tmp/trapmap-graph-plan-test.json',
      host: '127.0.0.1',
      port: 4000,
      systemAdminKey: null,
      userOpsLog: {
        enabled: false,
        logDir: 'logs/user-ops',
        maxFileSizeBytes: 1024,
        maxBackupFiles: 1,
      },
    },
    store: {
      snapshot: vi.fn(),
    },
    indexAdapters: [],
  } as unknown as SkillShareerServices;
}

function makeAuth(): ResolvedAuthContext {
  const timestamp = nowIso();
  return {
    subjectType: 'user',
    actorId: 'user_1',
    handle: 'tester',
    activeTeamId: 'team_1',
    securityLevel: 5,
    effectivePermissions: ['knowledge:search'],
    user: {
      id: 'user_1',
      handle: 'tester',
      notes: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    membership: null,
    team: null,
  };
}

function makeEmptyGraph() {
  return {
    nodes: [],
    edges: [],
    citations: [],
    focus: {
      blockingTrapNodeIds: [],
      recommendedSkillNodeIds: [],
    },
  };
}

describe('graph-plan-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the plan directly when readiness is high', async () => {
    mockedCompileTrapFirstPlan.mockResolvedValue({
      blockingTraps: [
        {
          nodeId: 'trap_1',
          sourceId: 'entry_1',
          label: 'Trap',
          severity: 'hard',
          scope: 'project',
          requiredLevel: 3,
          evidence: 'Trap evidence',
          score: 1,
        },
      ],
      recommendedSkills: [
        {
          nodeId: 'skill_1',
          artifactId: 'artifact_1',
          capsuleId: 'capsule_1',
          label: 'Skill',
          situation: 'When deploying',
          problem: 'Deployment drift',
          goal: 'Stabilize rollout',
          scope: 'project',
          requiredLevel: 3,
          score: 0.9,
          activationRefs: {
            references: [],
            assets: [],
            scripts: [],
          },
        },
      ],
      edges: [
        {
          id: 'edge_1',
          sourceNodeId: 'skill_1',
          targetNodeId: 'trap_1',
          type: 'mitigates',
          strength: 'hard',
        },
      ],
      citations: [],
      graph: {
        nodes: [
          {
            kind: 'trap',
            nodeId: 'trap_1',
            sourceId: 'entry_1',
            label: 'Trap',
            severity: 'hard',
            scope: 'project',
            requiredLevel: 3,
            evidence: 'Trap evidence',
            score: 1,
          },
          {
            kind: 'skill',
            nodeId: 'skill_1',
            artifactId: 'artifact_1',
            capsuleId: 'capsule_1',
            label: 'Skill',
            situation: 'When deploying',
            problem: 'Deployment drift',
            goal: 'Stabilize rollout',
            scope: 'project',
            requiredLevel: 3,
            score: 0.9,
            activationRefs: {
              references: [],
              assets: [],
              scripts: [],
            },
          },
        ],
        edges: [
          {
            id: 'edge_1',
            sourceNodeId: 'skill_1',
            targetNodeId: 'trap_1',
            type: 'mitigates',
            strength: 'hard',
          },
        ],
        citations: [],
        focus: {
          blockingTrapNodeIds: ['trap_1'],
          recommendedSkillNodeIds: ['skill_1'],
        },
      },
    });

    const result = await searchKnowledgeGraphPlan(makeServices(), makeAuth(), {
      seed: 'deploy containers safely',
      skillBudget: 3,
      maxDepth: 2,
      fallbackMode: 'auto',
    });

    expect(result.plan).not.toBeNull();
    expect(result.fallback).toBeNull();
    expect(result.routingTrace.routeFamily).toBe('graph-plan');
    expect(result.routingTrace.routingReason).toBe('graph-plan-selected');
    expect(result.routingTrace.fallbackApplied).toBe(false);
    expect(mockedSearchKnowledge).not.toHaveBeenCalled();
    expect(mockedSearchKnowledgeV2).not.toHaveBeenCalled();
  });

  it('falls back to v1 graph-assisted when no actionable skills are present', async () => {
    mockedCompileTrapFirstPlan.mockResolvedValue({
      blockingTraps: [
        {
          nodeId: 'trap_1',
          sourceId: 'entry_1',
          label: 'Trap',
          severity: 'hard',
          scope: 'project',
          requiredLevel: 3,
          evidence: 'Trap evidence',
          score: 1,
        },
      ],
      recommendedSkills: [],
      edges: [],
      citations: [],
      graph: {
        ...makeEmptyGraph(),
        nodes: [
          {
            kind: 'trap',
            nodeId: 'trap_1',
            sourceId: 'entry_1',
            label: 'Trap',
            severity: 'hard',
            scope: 'project',
            requiredLevel: 3,
            evidence: 'Trap evidence',
            score: 1,
          },
        ],
        focus: {
          blockingTrapNodeIds: ['trap_1'],
          recommendedSkillNodeIds: [],
        },
      },
    });
    mockedSearchKnowledge.mockResolvedValue({
      globalConstraints: [],
      projectKnowledge: [
        {
          entryId: 'entry_fallback_1',
          scope: 'project',
          requiredLevel: 3,
          shortcut: 'Fallback entry',
          detail: 'Graph-assisted fallback result',
          labels: ['fallback'],
          score: 0.7,
          reason: 'Fallback hit',
        },
      ],
      refinementSummary: null,
      summary: null,
    });

    const result = await searchKnowledgeGraphPlan(makeServices(), makeAuth(), {
      seed: 'deploy containers safely',
      skillBudget: 3,
      maxDepth: 2,
      fallbackMode: 'auto',
    });

    expect(result.plan).toBeNull();
    expect(result.fallback?.routeFamily).toBe('entry');
    expect(result.routingTrace.routingReason).toBe('graph-plan-insufficient-skill-evidence');
    expect(result.routingTrace.fallbackTarget).toBe('v1-graph-assisted');
    expect(result.routingTrace.fallbackApplied).toBe(true);
    expect(mockedSearchKnowledge).toHaveBeenCalledOnce();
    expect(mockedSearchKnowledgeV2).not.toHaveBeenCalled();
  });

  it('falls back to v2 capsule retrieval when trap evidence is weak', async () => {
    mockedCompileTrapFirstPlan.mockResolvedValue({
      blockingTraps: [],
      recommendedSkills: [
        {
          nodeId: 'skill_1',
          artifactId: 'artifact_1',
          capsuleId: 'capsule_1',
          label: 'Skill',
          situation: 'When deploying',
          problem: 'Deployment drift',
          goal: 'Stabilize rollout',
          scope: 'project',
          requiredLevel: 3,
          score: 0.8,
          activationRefs: {
            references: [],
            assets: [],
            scripts: [],
          },
        },
      ],
      edges: [],
      citations: [],
      graph: {
        ...makeEmptyGraph(),
        nodes: [
          {
            kind: 'skill',
            nodeId: 'skill_1',
            artifactId: 'artifact_1',
            capsuleId: 'capsule_1',
            label: 'Skill',
            situation: 'When deploying',
            problem: 'Deployment drift',
            goal: 'Stabilize rollout',
            scope: 'project',
            requiredLevel: 3,
            score: 0.8,
            activationRefs: {
              references: [],
              assets: [],
              scripts: [],
            },
          },
        ],
        focus: {
          blockingTrapNodeIds: [],
          recommendedSkillNodeIds: ['skill_1'],
        },
      },
    });
    mockedSearchKnowledgeV2.mockResolvedValue({
      capsules: [
        {
          capsuleId: 'capsule_fallback_1',
          artifactId: 'artifact_1',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Fallback capsule',
          situation: 'Need fallback',
          problem: 'Weak trap evidence',
          goal: 'Return capsule',
          labels: ['fallback'],
          scope: 'project',
          requiredLevel: 3,
          score: 0.8,
          reason: 'Fallback capsule',
        },
      ],
      profileHints: [
        {
          artifactId: 'artifact_1',
          title: 'Fallback Skill',
          slug: 'fallback-skill',
          labels: ['fallback'],
        },
      ],
      activationHints: [],
      refinementSummary: null,
      summary: null,
    });

    const result = await searchKnowledgeGraphPlan(makeServices(), makeAuth(), {
      seed: 'deploy containers safely',
      skillBudget: 3,
      maxDepth: 2,
      fallbackMode: 'auto',
    });

    expect(result.plan).toBeNull();
    expect(result.fallback?.routeFamily).toBe('capsule');
    expect(result.routingTrace.routingReason).toBe('graph-plan-insufficient-trap-evidence');
    expect(result.routingTrace.fallbackTarget).toBe('v2-capsule');
    expect(result.routingTrace.fallbackApplied).toBe(true);
    expect(mockedSearchKnowledgeV2).toHaveBeenCalledOnce();
    expect(mockedSearchKnowledge).not.toHaveBeenCalled();
  });

  it('scores blocker-only plans as low confidence with v1 fallback', () => {
    const assessment = assessGraphPlanReadiness(
      {
        blockingTraps: [
          {
            nodeId: 'trap_1',
            sourceId: 'entry_1',
            label: 'Trap',
            severity: 'hard',
            scope: 'project',
            requiredLevel: 3,
            evidence: 'Trap evidence',
            score: 1,
          },
        ],
        recommendedSkills: [],
        edges: [],
        citations: [],
        graph: {
          ...makeEmptyGraph(),
          nodes: [
            {
              kind: 'trap',
              nodeId: 'trap_1',
              sourceId: 'entry_1',
              label: 'Trap',
              severity: 'hard',
              scope: 'project',
              requiredLevel: 3,
              evidence: 'Trap evidence',
              score: 1,
            },
          ],
          focus: {
            blockingTrapNodeIds: ['trap_1'],
            recommendedSkillNodeIds: [],
          },
        },
      },
      'auto',
    );

    expect(assessment.bucket).toBe('low');
    expect(assessment.fallbackTarget).toBe('v1-graph-assisted');
  });
});
