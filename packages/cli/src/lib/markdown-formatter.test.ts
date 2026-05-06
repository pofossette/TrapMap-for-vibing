import { describe, expect, it } from 'vitest';
import type { GraphPlanSearchResponse, PlanTrapNode, PlanSkillNode } from '@trapmap/contracts';
import { escapeMarkdown, truncateText, formatLoadContext } from './markdown-formatter.js';

describe('escapeMarkdown', () => {
  it('escapes backticks', () => {
    expect(escapeMarkdown('use `code` here')).toBe('use \\`code\\` here');
  });

  it('escapes asterisks', () => {
    expect(escapeMarkdown('*bold* text')).toBe('\\*bold\\* text');
  });

  it('escapes square brackets', () => {
    expect(escapeMarkdown('[link](url)')).toBe('\\[link\\](url)');
  });

  it('handles empty string', () => {
    expect(escapeMarkdown('')).toBe('');
  });
});

describe('truncateText', () => {
  it('does not truncate short text', () => {
    expect(truncateText('short', 100)).toBe('short');
  });

  it('truncates long text with ellipsis', () => {
    const long = 'a'.repeat(100);
    const result = truncateText(long, 50);
    expect(result.length).toBe(50);
    expect(result.endsWith('...')).toBe(true);
  });
});

describe('formatLoadContext', () => {
  const mockTrace = {
    selectedMode: 'graph-assisted' as const,
    routeFamily: 'capsule' as const,
    routingReason: 'test' as const,
    channelsUsed: ['semantic', 'keyword'],
    fallbackTarget: null,
    confidenceScore: 0.85,
    confidenceBucket: 'high' as const,
  };

  it('formats empty plan as no results', () => {
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: null,
      fallback: null,
    };
    const result = formatLoadContext(response);
    expect(result).toContain('<!-- trapmap-load-context -->');
    expect(result).toContain('No matching knowledge found.');
    expect(result).toContain('<!-- /trapmap-load-context -->');
  });

  it('formats plan with traps', () => {
    const trap: PlanTrapNode = {
      nodeId: 'trap-1',
      sourceId: 'entry-1',
      label: 'Avoid global state',
      severity: 'hard',
      scope: 'project',
      requiredLevel: 1,
      evidence: 'Global state causes race conditions',
      score: 0.9,
    };
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: {
        blockingTraps: [trap],
        recommendedSkills: [],
        edges: [],
        citations: [],
        graph: { nodes: [], edges: [], focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] } },
      },
      fallback: null,
    };
    const result = formatLoadContext(response);
    expect(result).toContain('### Blocking Traps');
    expect(result).toContain('[HARD] Avoid global state');
    expect(result).toContain('> Global state causes race conditions');
  });

  it('formats plan with skills', () => {
    const skill: PlanSkillNode = {
      nodeId: 'skill-1',
      artifactId: 'artifact-1',
      label: 'Use dependency injection',
      situation: 'Testing components',
      problem: 'Hard to mock dependencies',
      goal: 'Inject dependencies for testability',
      scope: 'project',
      requiredLevel: 1,
      score: 0.85,
      activationRefs: { references: [{ path: 'ref/guide.md', sha256: 'abc', sizeBytes: 100 }], assets: [], scripts: [] },
    };
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: {
        blockingTraps: [],
        recommendedSkills: [skill],
        edges: [],
        citations: [],
        graph: { nodes: [], edges: [], focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] } },
      },
      fallback: null,
    };
    const result = formatLoadContext(response);
    expect(result).toContain('### Recommended Skills');
    expect(result).toContain('Use dependency injection');
    expect(result).toContain('References: `ref/guide.md`');
  });

  it('formats plan with both traps and skills', () => {
    const trap: PlanTrapNode = {
      nodeId: 'trap-1',
      sourceId: 'entry-1',
      label: 'No direct DB access',
      severity: 'hard',
      scope: 'project',
      requiredLevel: 1,
      evidence: 'Use repository pattern',
      score: 0.9,
    };
    const skill: PlanSkillNode = {
      nodeId: 'skill-1',
      artifactId: 'artifact-1',
      label: 'Repository pattern',
      situation: 'Data access layer',
      problem: 'Direct DB coupling',
      goal: 'Abstract data access',
      scope: 'project',
      requiredLevel: 1,
      score: 0.85,
      activationRefs: { references: [], assets: [], scripts: [] },
    };
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: {
        blockingTraps: [trap],
        recommendedSkills: [skill],
        edges: [],
        citations: [],
        graph: { nodes: [], edges: [], focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] } },
      },
      fallback: null,
    };
    const result = formatLoadContext(response);
    expect(result).toContain('### Blocking Traps');
    expect(result).toContain('### Recommended Skills');
  });

  it('includes routing trace', () => {
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: null,
      fallback: null,
    };
    const result = formatLoadContext(response);
    expect(result).toContain('### Routing');
    expect(result).toContain('Mode: graph-assisted');
    expect(result).toContain('Confidence: 0.85 (high)');
    expect(result).toContain('Channels: semantic, keyword');
  });

  it('respects maxTraps option', () => {
    const traps: PlanTrapNode[] = Array.from({ length: 15 }, (_, i) => ({
      nodeId: `trap-${i}`,
      sourceId: `entry-${i}`,
      label: `Trap ${i}`,
      severity: 'hard' as const,
      scope: 'project' as const,
      requiredLevel: 1,
      evidence: `Evidence ${i}`,
      score: 0.9,
    }));
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: {
        blockingTraps: traps,
        recommendedSkills: [],
        edges: [],
        citations: [],
        graph: { nodes: [], edges: [], focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] } },
      },
      fallback: null,
    };
    const result = formatLoadContext(response, { maxTraps: 5 });
    expect(result).toContain('...and 10 more traps');
  });
});
