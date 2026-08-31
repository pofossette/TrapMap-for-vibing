import { describe, it, expect } from 'vitest';
import { formatLoadContext } from '../../src/lib/markdown-formatter.js';
import type { GraphPlanSearchResponse } from '@trapmap/contracts';

function makeResponse(): GraphPlanSearchResponse {
  return {
    routingTrace: {
      selectedMode: 'graph-plan',
      confidenceScore: 0.85,
      confidenceBucket: 'high',
      channelsUsed: ['vector', 'graph-expansion'],
      fallbackTarget: null,
      routeFamily: 'graph-plan',
      routingReason: 'high-confidence',
      fallbackApplied: false,
    } as any,
    plan: {
      blockingTraps: [
        {
          nodeId: 'trap:1',
          sourceId: 'entry-1',
          label: 'Trap 001 - DB lock xxxx',
          severity: 'hard',
          scope: 'global',
          requiredLevel: 0,
          evidence: 'evidence 001 xxxx',
          score: 0.9,
        },
        {
          nodeId: 'trap:2',
          sourceId: 'entry-2',
          label: 'Trap 002 - Cache miss xxxx',
          severity: 'soft',
          scope: 'project',
          requiredLevel: 1,
          evidence: 'evidence 002 xxxx',
          score: 0.8,
        },
        {
          nodeId: 'trap:3',
          sourceId: 'entry-3',
          label: 'Trap 003 - Retry storm xxxx',
          severity: 'hard',
          scope: 'global',
          requiredLevel: 2,
          evidence: 'evidence 003 xxxx',
          score: 0.75,
        },
      ],
      recommendedSkills: [
        {
          nodeId: 'skill:4',
          artifactId: 'art-4',
          label: 'Skill 004 - Use pool xxxx',
          situation: 'situation 004',
          problem: 'problem 004',
          goal: 'goal 004',
          scope: 'global',
          requiredLevel: 0,
          score: 0.88,
          activationRefs: { references: [], assets: [], scripts: [] },
        },
        {
          nodeId: 'skill:5',
          artifactId: 'art-5',
          label: 'Skill 005 - Rate limit xxxx',
          situation: 'situation 005',
          problem: 'problem 005',
          goal: 'goal 005',
          scope: 'project',
          requiredLevel: 0,
          score: 0.82,
          activationRefs: {
            references: [{ path: 'guides/rate.md' } as any],
            assets: [],
            scripts: [],
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'skill:4',
          targetNodeId: 'trap:1',
          type: 'mitigates',
          strength: 'hard',
        },
        {
          id: 'edge-2',
          sourceNodeId: 'skill:5',
          targetNodeId: 'trap:2',
          type: 'requires',
          strength: 'soft',
        },
        {
          id: 'edge-3',
          sourceNodeId: 'trap:1',
          targetNodeId: 'trap:3',
          type: 'risk-blocks',
          strength: 'hard',
        },
        {
          id: 'edge-4',
          sourceNodeId: 'skill:4',
          targetNodeId: 'skill:5',
          type: 'order',
          strength: 'soft',
        },
      ],
      citations: [
        {
          sourceId: 'entry-99',
          sourceKind: 'trap',
          label: 'Citation xxx',
          scope: 'global',
          score: 0.4,
        },
      ],
      executionPlan: [
        {
          rank: 0,
          nodeId: 'trap:1',
          label: 'Trap 001 - DB lock xxxx',
          kind: 'trap-mitigation',
          blockedBy: [],
        },
        {
          rank: 0,
          nodeId: 'trap:2',
          label: 'Trap 002 - Cache miss xxxx',
          kind: 'trap-mitigation',
          blockedBy: [],
        },
        {
          rank: 1,
          nodeId: 'skill:4',
          label: 'Skill 004 - Use pool xxxx',
          kind: 'skill',
          blockedBy: ['trap:1'],
        },
        {
          rank: 2,
          nodeId: 'skill:5',
          label: 'Skill 005 - Rate limit xxxx',
          kind: 'skill',
          blockedBy: ['skill:4', 'trap:2'],
        },
        {
          rank: 3,
          nodeId: 'trap:3',
          label: 'Trap 003 - Retry storm xxxx',
          kind: 'trap-mitigation',
          blockedBy: ['trap:1'],
        },
      ],
      graph: {
        nodes: [
          {
            kind: 'trap',
            nodeId: 'trap:1',
            sourceId: 'entry-1',
            label: 'Trap 001 - DB lock xxxx',
            severity: 'hard',
            scope: 'global',
            requiredLevel: 0,
            evidence: 'evidence 001 xxxx',
            score: 0.9,
          },
          {
            kind: 'trap',
            nodeId: 'trap:2',
            sourceId: 'entry-2',
            label: 'Trap 002 - Cache miss xxxx',
            severity: 'soft',
            scope: 'project',
            requiredLevel: 1,
            evidence: 'evidence 002 xxxx',
            score: 0.8,
          },
          {
            kind: 'trap',
            nodeId: 'trap:3',
            sourceId: 'entry-3',
            label: 'Trap 003 - Retry storm xxxx',
            severity: 'hard',
            scope: 'global',
            requiredLevel: 2,
            evidence: 'evidence 003 xxxx',
            score: 0.75,
          },
          {
            kind: 'skill',
            nodeId: 'skill:4',
            artifactId: 'art-4',
            label: 'Skill 004 - Use pool xxxx',
            situation: 'situation 004',
            problem: 'problem 004',
            goal: 'goal 004',
            scope: 'global',
            requiredLevel: 0,
            score: 0.88,
            activationRefs: { references: [], assets: [], scripts: [] },
          },
          {
            kind: 'skill',
            nodeId: 'skill:5',
            artifactId: 'art-5',
            label: 'Skill 005 - Rate limit xxxx',
            situation: 'situation 005',
            problem: 'problem 005',
            goal: 'goal 005',
            scope: 'project',
            requiredLevel: 0,
            score: 0.82,
            activationRefs: {
              references: [{ path: 'guides/rate.md' } as any],
              assets: [],
              scripts: [],
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            sourceNodeId: 'skill:4',
            targetNodeId: 'trap:1',
            type: 'mitigates',
            strength: 'hard',
          },
          {
            id: 'edge-2',
            sourceNodeId: 'skill:5',
            targetNodeId: 'trap:2',
            type: 'requires',
            strength: 'soft',
          },
          {
            id: 'edge-3',
            sourceNodeId: 'trap:1',
            targetNodeId: 'trap:3',
            type: 'risk-blocks',
            strength: 'hard',
          },
          {
            id: 'edge-4',
            sourceNodeId: 'skill:4',
            targetNodeId: 'skill:5',
            type: 'order',
            strength: 'soft',
          },
        ],
        citations: [
          {
            sourceId: 'entry-99',
            sourceKind: 'trap',
            label: 'Citation xxx',
            scope: 'global',
            score: 0.4,
          },
        ],
        focus: {
          blockingTrapNodeIds: ['trap:1', 'trap:2', 'trap:3'],
          recommendedSkillNodeIds: ['skill:4', 'skill:5'],
        },
      },
    },
    fallback: null,
  };
}

describe('formatLoadContext numbered graph', () => {
  it('renders 5 nodes with 001 numbering and edges with arrow', () => {
    const md = formatLoadContext(makeResponse());
    expect(md).toContain('### Nodes (5)');
    expect(md).toContain('[001]');
    expect(md).toContain('[002]');
    expect(md).toContain('[005]');
    expect(md).toContain('### Edges (4)');
    expect(md).toContain('[E001]');
    expect(md).toContain('--mitigates[hard]-->');
    expect(md).toContain('→');
    expect(md).toContain('### Execution Plan');
    expect(md).toContain('blockedBy:');
    expect(md).toContain('### Citations');
    // Snapshot for manual review
    console.log('\n---MARKDOWN PREVIEW---\n' + md + '\n---END---\n');
  });

  it('handles fallback when no plan', () => {
    const resp: GraphPlanSearchResponse = {
      routingTrace: {
        selectedMode: 'graph-plan',
        confidenceScore: 0.1,
        confidenceBucket: 'low',
        channelsUsed: [],
        fallbackTarget: 'v2-capsule',
        routeFamily: 'graph-plan',
        routingReason: 'low-confidence',
        fallbackApplied: true,
      } as any,
      plan: null,
      fallback: {
        routeFamily: 'capsule',
        response: {
          capsules: [
            {
              capsuleId: 'cap-1',
              artifactId: 'art-1',
              situation: 's',
              problem: 'p',
              goal: 'g',
              labels: [],
              scope: 'global',
              score: 0.5,
              reason: 'r',
            },
          ],
          summary: null,
          refinementSummary: null,
        } as any,
      },
    };
    const md = formatLoadContext(resp);
    expect(md).toContain('Capsules');
  });
});
