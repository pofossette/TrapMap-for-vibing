import type { GraphPlanSearchResponse, PlanSkillNode, PlanTrapNode } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';
import { escapeMarkdown, formatLoadContext, truncateText } from './markdown-formatter.js';

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

  it('truncateText with maxLength 2 returns string of length <= 2', () => {
    expect(truncateText('hello', 2).length).toBeLessThanOrEqual(2);
  });

  it('truncateText with maxLength 1 returns string of length <= 1', () => {
    expect(truncateText('hello', 1).length).toBeLessThanOrEqual(1);
  });

  it('truncateText with maxLength 3 returns string of length <= 3', () => {
    expect(truncateText('hello', 3).length).toBeLessThanOrEqual(3);
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
        graph: {
          nodes: [],
          edges: [],
          focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] },
        },
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
      activationRefs: {
        references: [{ path: 'ref/guide.md', sha256: 'abc', sizeBytes: 100 }],
        assets: [],
        scripts: [],
      },
    };
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: {
        blockingTraps: [],
        recommendedSkills: [skill],
        edges: [],
        citations: [],
        graph: {
          nodes: [],
          edges: [],
          focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] },
        },
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
        graph: {
          nodes: [],
          edges: [],
          focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] },
        },
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

  it('shows "unknown" for channels when channelsUsed is empty array', () => {
    const response: GraphPlanSearchResponse = {
      routingTrace: {
        ...mockTrace,
        channelsUsed: [],
      },
      plan: null,
      fallback: null,
    };
    const result = formatLoadContext(response);
    expect(result).toContain('Channels: unknown');
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
        graph: {
          nodes: [],
          edges: [],
          focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] },
        },
      },
      fallback: null,
    };
    const result = formatLoadContext(response, { maxTraps: 5 });
    expect(result).toContain('...and 10 more traps');
  });

  it('formats plan with skills containing assets and scripts', () => {
    const skill: PlanSkillNode = {
      nodeId: 'skill-1',
      artifactId: 'artifact-1',
      label: 'Deploy with script',
      situation: 'CI pipeline setup',
      problem: 'Manual deployment steps',
      goal: 'Automated deployment',
      scope: 'project',
      requiredLevel: 1,
      score: 0.8,
      activationRefs: {
        references: [{ path: 'ref/deploy.md', sha256: 'abc123', sizeBytes: 200 }],
        assets: [{ path: 'assets/config.json', sha256: 'def456', sizeBytes: 500 }],
        scripts: [{ path: 'scripts/deploy.sh', defaultPolicy: 'allow-with-approval' }],
      },
    };
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: {
        blockingTraps: [],
        recommendedSkills: [skill],
        edges: [],
        citations: [],
        graph: {
          nodes: [],
          edges: [],
          focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] },
        },
      },
      fallback: null,
    };
    const result = formatLoadContext(response);
    expect(result).toContain('References: `ref/deploy.md`');
    expect(result).toContain('Assets: `assets/config.json`');
    expect(result).toContain('Scripts: `scripts/deploy.sh` (allow-with-approval)');
  });

  it('formats capsule fallback when plan is null', () => {
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: null,
      fallback: {
        routeFamily: 'capsule',
        response: {
          capsules: [
            {
              capsuleId: 'cap-1',
              artifactId: 'art-1',
              revision: 1,
              sourcePaths: ['src/main.ts'],
              content: 'Deploy config capsule',
              situation: 'CI pipeline setup',
              problem: 'Manual deployment',
              goal: 'Automated deployment',
              labels: ['backend'],
              scope: 'project',
              requiredLevel: 1,
              score: 0.8,
              reason: 'semantic match',
            },
          ],
          profileHints: [],
          activationHints: [],
          refinementSummary: null,
          summary: null,
        },
      },
    };
    const result = formatLoadContext(response);
    expect(result).toContain('### Capsules (from fallback)');
    expect(result).toContain('cap-1');
    expect(result).toContain('CI pipeline setup');
    expect(result).toContain('Manual deployment');
    expect(result).toContain('Automated deployment');
  });

  it('formats capsule fallback when plan has empty traps and skills', () => {
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: {
        blockingTraps: [],
        recommendedSkills: [],
        edges: [],
        citations: [],
        graph: {
          nodes: [],
          edges: [],
          focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] },
        },
      },
      fallback: {
        routeFamily: 'capsule',
        response: {
          capsules: [
            {
              capsuleId: 'cap-2',
              artifactId: 'art-2',
              revision: 1,
              sourcePaths: ['README.md'],
              content: 'General guidance',
              situation: 'New project setup',
              problem: 'No conventions',
              goal: 'Establish patterns',
              labels: ['general'],
              scope: 'global',
              requiredLevel: 0,
              score: 0.6,
              reason: 'keyword match',
            },
          ],
          profileHints: [],
          activationHints: [],
          refinementSummary: null,
          summary: null,
        },
      },
    };
    const result = formatLoadContext(response);
    expect(result).toContain('### Capsules (from fallback)');
    expect(result).toContain('cap-2');
  });

  it('respects maxSkills option for capsule fallback', () => {
    const capsules = Array.from({ length: 10 }, (_, i) => ({
      capsuleId: `cap-${i}`,
      artifactId: `art-${i}`,
      revision: 1,
      sourcePaths: [`src/file${i}.ts`],
      content: `Content ${i}`,
      situation: `Situation ${i}`,
      problem: `Problem ${i}`,
      goal: `Goal ${i}`,
      labels: ['test'],
      scope: 'project' as const,
      requiredLevel: 1,
      score: 0.5 + i * 0.04,
      reason: 'match',
    }));
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: null,
      fallback: {
        routeFamily: 'capsule',
        response: {
          capsules,
          profileHints: [],
          activationHints: [],
          refinementSummary: null,
          summary: null,
        },
      },
    };
    const result = formatLoadContext(response, { maxSkills: 3 });
    expect(result).toContain('...and 7 more capsules');
  });

  it('formats plan with assets only and no scripts', () => {
    const skill: PlanSkillNode = {
      nodeId: 'skill-2',
      artifactId: 'artifact-2',
      label: 'Use template files',
      situation: 'New service setup',
      problem: 'Missing boilerplate',
      goal: 'Consistent service structure',
      scope: 'project',
      requiredLevel: 1,
      score: 0.75,
      activationRefs: {
        references: [],
        assets: [
          { path: 'templates/service.ts', sha256: 'aaa', sizeBytes: 300 },
          { path: 'templates/config.yaml', sha256: 'bbb', sizeBytes: 150 },
        ],
        scripts: [],
      },
    };
    const response: GraphPlanSearchResponse = {
      routingTrace: mockTrace,
      plan: {
        blockingTraps: [],
        recommendedSkills: [skill],
        edges: [],
        citations: [],
        graph: {
          nodes: [],
          edges: [],
          focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] },
        },
      },
      fallback: null,
    };
    const result = formatLoadContext(response);
    expect(result).toContain('Assets: `templates/service.ts`, `templates/config.yaml`');
    expect(result).not.toContain('Scripts:');
    expect(result).not.toContain('References:');
  });

  it('formats entry fallback with real retrieval matches', () => {
    const response: GraphPlanSearchResponse = {
      routingTrace: {
        ...mockTrace,
        routeFamily: 'entry',
      },
      plan: null,
      fallback: {
        routeFamily: 'entry',
        response: {
          globalConstraints: [
            {
              entryId: 'entry-1',
              scope: 'global',
              requiredLevel: 1,
              shortcut: 'Pin Docker base image',
              detail: 'Avoid floating tags in production builds.',
              labels: ['docker', 'supply-chain'],
              score: 0.91,
              reason: 'semantic similarity',
            },
          ],
          projectKnowledge: [
            {
              entryId: 'entry-2',
              scope: 'project',
              requiredLevel: 1,
              shortcut: 'Use staging registry',
              detail: 'Publish release candidates to the staging registry first.',
              labels: ['release'],
              score: 0.76,
              reason: 'keyword match',
            },
          ],
          refinementSummary: null,
          summary: null,
        },
      },
    };

    const result = formatLoadContext(response);

    expect(result).toContain('### Entries (from fallback)');
    expect(result).toContain('Pin Docker base image');
    expect(result).toContain('Use staging registry');
    expect(result).not.toContain('fallback rendering not implemented');
  });
});
