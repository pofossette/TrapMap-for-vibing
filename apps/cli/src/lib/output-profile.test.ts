import type {
  GraphPlanSearchResponse,
  RetrievalResponse,
  RetrievalV2Response,
  SkillLookupResponse,
} from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

import {
  type OutputProfile,
  createRenderEnvelope,
  getDefaultOutputProfile,
  resolveRenderKind,
  resolveRenderer,
} from './output-profile.js';

describe('output profile helpers', () => {
  it('provides stable default output profile values', () => {
    expect(getDefaultOutputProfile()).toEqual({
      tool: 'generic',
      modelHint: 'generic',
      renderMode: 'text',
      graphPlanMode: 'summary',
      verbosity: 'balanced',
      includeRawHints: true,
    });
  });

  it('resolves render kind for retrieval, load, and skill responses', () => {
    expect(resolveRenderKind('retrieval-v1')).toBe('retrieval-v1');
    expect(resolveRenderKind('retrieval-v2')).toBe('retrieval-v2');
    expect(resolveRenderKind('graph-plan')).toBe('graph-plan');
    expect(resolveRenderKind('skill-lookup')).toBe('skill-lookup');
  });

  it('falls back to generic renderer when tool-specific kind renderer is unavailable', () => {
    const renderer = resolveRenderer(
      {
        ...getDefaultOutputProfile(),
        tool: 'codex',
      },
      'artifact-export',
    );

    expect(renderer.id).toBe('generic:artifact-export');
  });

  it('creates render envelope with context merged from profile', () => {
    const profile: OutputProfile = {
      ...getDefaultOutputProfile(),
      tool: 'claude-code',
      verbosity: 'detailed',
    };
    const payload: RetrievalResponse = {
      globalConstraints: [],
      projectKnowledge: [],
      refinementSummary: null,
      summary: null,
    };

    const envelope = createRenderEnvelope('retrieval-v1', payload, profile, {
      commandName: 'search',
    });

    expect(envelope).toEqual({
      kind: 'retrieval-v1',
      payload,
      context: expect.objectContaining({
        commandName: 'search',
        tool: 'claude-code',
        verbosity: 'detailed',
      }),
    });
  });

  it('omits undefined optional context fields from render envelopes', () => {
    const profile: OutputProfile = {
      tool: 'generic',
      renderMode: 'text',
      graphPlanMode: 'summary',
      verbosity: 'balanced',
      includeRawHints: true,
    };
    const payload: RetrievalResponse = {
      globalConstraints: [],
      projectKnowledge: [],
      refinementSummary: null,
      summary: null,
    };

    const envelope = createRenderEnvelope('retrieval-v1', payload, profile);

    expect('commandName' in envelope.context).toBe(false);
    expect('modelHint' in envelope.context).toBe(false);
  });

  it('produces renderer ids for each supported tool skeleton', () => {
    const kinds = ['retrieval-v1', 'retrieval-v2', 'graph-plan', 'skill-lookup'] as const;

    for (const tool of ['generic', 'claude-code', 'codex', 'opencode'] as const) {
      for (const kind of kinds) {
        const renderer = resolveRenderer(
          {
            ...getDefaultOutputProfile(),
            tool,
          },
          kind,
        );

        expect(renderer.id).toBe(`${tool}:${kind}`);
      }
    }
  });

  it('accepts all first-phase payload shapes when constructing envelopes', () => {
    const profile = getDefaultOutputProfile();
    const retrievalV2Payload: RetrievalV2Response = {
      capsules: [],
      profileHints: [],
      refinementSummary: null,
      summary: null,
    };
    const graphPlanPayload: GraphPlanSearchResponse = {
      routingTrace: {
        selectedMode: 'mix',
        routeFamily: 'graph-plan',
        routingReason: 'graph-plan-selected',
        channelsUsed: ['semantic'],
        fallbackTarget: null,
        confidenceScore: 0.91,
        confidenceBucket: 'high',
      },
      plan: null,
      fallback: null,
    };
    const skillPayload: SkillLookupResponse = {
      matches: [],
    };

    expect(createRenderEnvelope('retrieval-v2', retrievalV2Payload, profile)).toHaveProperty(
      'payload.capsules',
    );
    expect(createRenderEnvelope('graph-plan', graphPlanPayload, profile)).toHaveProperty(
      'payload.routingTrace',
    );
    expect(createRenderEnvelope('skill-lookup', skillPayload, profile)).toHaveProperty(
      'payload.matches',
    );
  });

  it('renders graph-plan summary view for codex with execution order and fallback notice omitted for direct plans', () => {
    const payload: GraphPlanSearchResponse = {
      routingTrace: {
        selectedMode: 'mix',
        routeFamily: 'graph-plan',
        routingReason: 'graph-plan-selected',
        channelsUsed: ['semantic', 'plan'],
        fallbackTarget: null,
        confidenceScore: 0.93,
        confidenceBucket: 'high',
      },
      plan: {
        blockingTraps: [
          {
            nodeId: 'trap-1',
            sourceId: 'entry-1',
            label: 'Missing migration ordering',
            severity: 'hard',
            scope: 'project',
            requiredLevel: 0,
            evidence: 'Schema must be updated before backfill runs.',
            score: 0.97,
          },
          {
            nodeId: 'trap-2',
            sourceId: 'entry-2',
            label: 'Backfill can overload replicas',
            severity: 'soft',
            scope: 'project',
            requiredLevel: 0,
            evidence: 'Throttle jobs to protect read traffic.',
            score: 0.72,
          },
        ],
        recommendedSkills: [
          {
            nodeId: 'skill-1',
            artifactId: 'artifact.prepare',
            capsuleId: 'cap-1',
            label: 'Prepare migration rollout',
            situation: 'Need safe schema rollout',
            problem: 'Schema drift across services',
            goal: 'Sequence migration and rollout safely',
            scope: 'project',
            requiredLevel: 0,
            score: 0.94,
            activationRefs: {
              references: [{ path: 'docs/migrations.md', title: 'Migration playbook' }],
              assets: [{ path: 'assets/migration-checklist.md', mediaType: 'text/markdown' }],
              scripts: [{ path: 'scripts/check-migrations.sh', defaultPolicy: 'on-demand' }],
            },
          },
          {
            nodeId: 'skill-2',
            artifactId: 'artifact.backfill',
            capsuleId: 'cap-2',
            label: 'Run throttled backfill',
            situation: 'Need backfill after schema release',
            problem: 'Unbounded jobs can saturate replicas',
            goal: 'Backfill safely with throttling',
            scope: 'project',
            requiredLevel: 0,
            score: 0.89,
            activationRefs: {
              references: [{ path: 'docs/backfill.md', title: 'Backfill guide' }],
              assets: [],
              scripts: [{ path: 'scripts/run-backfill.sh', defaultPolicy: 'manual-review' }],
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            sourceNodeId: 'skill-1',
            targetNodeId: 'skill-2',
            type: 'order',
            strength: 'hard',
          },
          {
            id: 'edge-2',
            sourceNodeId: 'trap-1',
            targetNodeId: 'skill-1',
            type: 'mitigates',
            strength: 'hard',
          },
        ],
        citation: [],
        executionPlan: [
          {
            rank: 0,
            nodeId: 'skill-1',
            label: 'Prepare migration rollout',
            kind: 'skill',
            blockedBy: [],
          },
          {
            rank: 1,
            nodeId: 'skill-2',
            label: 'Run throttled backfill',
            kind: 'skill',
            blockedBy: ['skill-1'],
          },
        ],
        graph: {
          nodes: [],
          edges: [],
          citations: [],
          focus: {
            blockingTrapNodeIds: ['trap-1', 'trap-2'],
            recommendedSkillNodeIds: ['skill-1', 'skill-2'],
          },
        },
      },
      fallback: null,
    };

    const renderer = resolveRenderer(
      {
        ...getDefaultOutputProfile(),
        tool: 'codex',
      },
      'graph-plan',
    );

    const rendered = renderer.render(
      createRenderEnvelope('graph-plan', payload, getDefaultOutputProfile()),
    );
    const parsed = JSON.parse(rendered);

    expect(parsed.summary).toContain('2 recommended skill');
    expect(parsed.selected_path).toBe('graph-plan');
    expect(parsed.confidence).toBe('high');
    expect(parsed.traps).toHaveLength(2);
    expect(parsed.skills[0]).toMatchObject({
      artifactId: 'artifact.prepare',
      label: 'Prepare migration rollout',
    });
    expect(parsed.next_steps).toEqual(['Prepare migration rollout', 'Run throttled backfill']);
    expect(parsed.activation_hints[0]).toMatchObject({
      artifactId: 'artifact.prepare',
      references: ['docs/migrations.md'],
      scripts: ['scripts/check-migrations.sh'],
    });
    expect(parsed.fallback_notice).toBeUndefined();
  });

  it('detects plan with non-null later elements even if first element is falsy', () => {
    const payload: GraphPlanSearchResponse = {
      routingTrace: {
        selectedMode: 'mix',
        routeFamily: 'graph-plan',
        routingReason: 'graph-plan-selected',
        channelsUsed: ['semantic'],
        fallbackTarget: null,
        confidenceScore: 0.9,
        confidenceBucket: 'high',
      },
      plan: {
        blockingTraps: [],
        recommendedSkills: [
          null as unknown as import('@trapmap/contracts').PlanSkillNode, // lib type gap: fixture uses a
          // null placeholder inside the non-nullable recommendedSkills array to exercise
          // the renderer's defensive null handling
          {
            nodeId: 'skill-2',
            artifactId: 'artifact-2',
            label: 'Valid skill',
            situation: 'test',
            problem: 'test',
            goal: 'test',
            scope: 'project',
            requiredLevel: 1,
            score: 0.8,
            activationRefs: { references: [], assets: [], scripts: [] },
          },
        ],
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

    const renderer = resolveRenderer({ ...getDefaultOutputProfile(), tool: 'codex' }, 'graph-plan');
    const rendered = renderer.render(
      createRenderEnvelope('graph-plan', payload, getDefaultOutputProfile()),
    );
    const parsed = JSON.parse(rendered);
    expect(parsed.summary).toContain('recommended skill');
    expect(parsed.selected_path).toBe('graph-plan');
  });

  it('renders fallback-aware graph-plan summary for opencode', () => {
    const payload: GraphPlanSearchResponse = {
      routingTrace: {
        selectedMode: 'mix',
        routeFamily: 'capsule',
        routingReason: 'graph-plan-low-confidence',
        channelsUsed: ['capsule'],
        fallbackTarget: 'v2-capsule',
        confidenceScore: 0.41,
        confidenceBucket: 'low',
      },
      plan: null,
      fallback: {
        routeFamily: 'capsule',
        response: {
          capsules: [
            {
              capsuleId: 'cap-1',
              artifactId: 'artifact.cache',
              revision: 2,
              sourcePaths: ['SKILL.md'],
              content: 'Use staged rollout and cache invalidation guards.',
              situation: 'Need cache rollout guidance',
              problem: 'Invalidation can stampede caches',
              goal: 'Roll out safely',
              labels: ['cache'],
              scope: 'project',
              requiredLevel: 0,
              score: 0.9,
              reason: 'High semantic match',
            },
          ],
          profileHints: [
            {
              artifactId: 'artifact.cache',
              title: 'Cache rollout skill',
              slug: 'cache-rollout',
              labels: ['cache'],
            },
          ],
          refinementSummary: null,
          summary: {
            text: 'Use the cache rollout skill as fallback guidance.',
            citations: [
              {
                source: {
                  entryId: 'entry-1',
                  scope: 'project',
                  shortcut: 'Cache rollout fallback',
                },
                snippet: 'Use the cache rollout skill.',
                tags: ['cache'],
                recallChannels: ['capsule'],
                scores: {
                  semantic: 0.9,
                  keyword: null,
                  graph: null,
                  preRerank: 0.88,
                  final: 0.9,
                },
              },
            ],
          },
        },
      },
    };

    const renderer = resolveRenderer(
      {
        ...getDefaultOutputProfile(),
        tool: 'opencode',
      },
      'graph-plan',
    );

    const rendered = renderer.render(
      createRenderEnvelope('graph-plan', payload, {
        ...getDefaultOutputProfile(),
        tool: 'opencode',
      }),
    );

    expect(rendered).toContain('# Goal');
    expect(rendered).toContain('Use the cache rollout skill as fallback guidance.');
    expect(rendered).toContain('## Fallback Notice');
    expect(rendered).toContain('capsule fallback');
    expect(rendered).toContain('## Recommended Skills');
    expect(rendered).toContain('artifact.cache');
  });

  it('expands graph-plan details in detailed full mode for claude-code', () => {
    const payload: GraphPlanSearchResponse = {
      routingTrace: {
        selectedMode: 'mix',
        routeFamily: 'graph-plan',
        routingReason: 'graph-plan-selected',
        channelsUsed: ['semantic', 'plan'],
        fallbackTarget: null,
        confidenceScore: 0.88,
        confidenceBucket: 'medium',
      },
      plan: {
        blockingTraps: [],
        recommendedSkills: [
          {
            nodeId: 'skill-1',
            artifactId: 'artifact.release',
            label: 'Coordinate release train',
            situation: 'Need ordered service rollout',
            problem: 'Service mismatch causes outages',
            goal: 'Coordinate release safely',
            scope: 'project',
            requiredLevel: 0,
            score: 0.86,
            activationRefs: {
              references: [{ path: 'docs/release-train.md', title: 'Release train' }],
              assets: [],
              scripts: [],
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            sourceNodeId: 'skill-1',
            targetNodeId: 'skill-1',
            type: 'requires',
            strength: 'soft',
          },
        ],
        citations: [],
        graph: {
          nodes: [
            {
              kind: 'skill',
              nodeId: 'skill-1',
              artifactId: 'artifact.release',
              label: 'Coordinate release train',
              situation: 'Need ordered service rollout',
              problem: 'Service mismatch causes outages',
              goal: 'Coordinate release safely',
              scope: 'project',
              requiredLevel: 0,
              score: 0.86,
              activationRefs: {
                references: [{ path: 'docs/release-train.md', title: 'Release train' }],
                assets: [],
                scripts: [],
              },
            },
          ],
          edges: [
            {
              id: 'graph-edge-1',
              sourceNodeId: 'skill-1',
              targetNodeId: 'skill-1',
              type: 'co-occurs-with',
              strength: 'soft',
            },
          ],
          citations: [],
          focus: {
            blockingTrapNodeIds: [],
            recommendedSkillNodeIds: ['skill-1'],
          },
        },
      },
      fallback: null,
    };

    const renderer = resolveRenderer(
      {
        ...getDefaultOutputProfile(),
        tool: 'claude-code',
      },
      'graph-plan',
    );

    const rendered = renderer.render(
      createRenderEnvelope('graph-plan', payload, {
        ...getDefaultOutputProfile(),
        tool: 'claude-code',
        verbosity: 'detailed',
        graphPlanMode: 'full',
      }),
    );

    expect(rendered).toContain('<confidence>medium</confidence>');
    expect(rendered).toContain('<plan_edges>');
    expect(rendered).toContain('"type":"requires"');
    expect(rendered).toContain('<raw_hints>');
    expect(rendered).toContain('docs/release-train.md');
  });

  it('renders graph-plan skill-list mode without traps or execution-order sections', () => {
    const payload: GraphPlanSearchResponse = {
      routingTrace: {
        selectedMode: 'mix',
        routeFamily: 'graph-plan',
        routingReason: 'graph-plan-selected',
        channelsUsed: ['semantic', 'plan'],
        fallbackTarget: null,
        confidenceScore: 0.9,
        confidenceBucket: 'high',
      },
      plan: {
        blockingTraps: [
          {
            nodeId: 'trap-1',
            sourceId: 'entry-1',
            label: 'Avoid unordered rollout',
            severity: 'hard',
            scope: 'project',
            requiredLevel: 0,
            evidence: 'Rollout order matters.',
            score: 0.9,
          },
        ],
        recommendedSkills: [
          {
            nodeId: 'skill-1',
            artifactId: 'artifact.rollout',
            capsuleId: 'cap-1',
            label: 'Coordinate rollout',
            situation: 'Need ordered rollout',
            problem: 'Out-of-order release breaks compatibility',
            goal: 'Ship safely',
            scope: 'project',
            requiredLevel: 0,
            score: 0.95,
            activationRefs: {
              references: [{ path: 'docs/rollout.md', title: 'Rollout guide' }],
              assets: [],
              scripts: [],
            },
          },
        ],
        edges: [],
        citations: [],
        graph: {
          nodes: [],
          edges: [],
          citations: [],
          focus: {
            blockingTrapNodeIds: ['trap-1'],
            recommendedSkillNodeIds: ['skill-1'],
          },
        },
      },
      fallback: null,
    };

    const renderer = resolveRenderer(
      {
        ...getDefaultOutputProfile(),
        tool: 'codex',
        graphPlanMode: 'skill-list',
      },
      'graph-plan',
    );

    const rendered = renderer.render(
      createRenderEnvelope('graph-plan', payload, {
        ...getDefaultOutputProfile(),
        tool: 'codex',
        graphPlanMode: 'skill-list',
      }),
    );
    const parsed = JSON.parse(rendered);

    expect(parsed.mode).toBe('skill-list');
    expect(parsed.skills).toHaveLength(1);
    expect(parsed.skills[0]).toMatchObject({
      artifactId: 'artifact.rollout',
      label: 'Coordinate rollout',
    });
    expect(parsed.traps).toEqual([]);
    expect(parsed.next_steps).toEqual([]);
    expect(parsed.activation_hints).toBeUndefined();
  });

  it('renders codex retrieval-v2 as tool-specific semantic object instead of graph-plan-shaped fallback', () => {
    const payload: RetrievalV2Response = {
      capsules: [
        {
          capsuleId: 'cap-1',
          artifactId: 'artifact.cache',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Use staged invalidation.',
          situation: 'Need cache rollout guidance',
          problem: 'Cache invalidation can stampede',
          goal: 'Roll out safely',
          labels: ['cache'],
          scope: 'project',
          requiredLevel: 0,
          score: 0.93,
          reason: 'High semantic match',
        },
      ],
      profileHints: [
        {
          artifactId: 'artifact.cache',
          title: 'Cache rollout skill',
          slug: 'cache-rollout',
          labels: ['cache'],
        },
      ],
      refinementSummary: 'Prefer staged invalidation.',
      summary: null,
    };

    const renderer = resolveRenderer(
      {
        ...getDefaultOutputProfile(),
        tool: 'codex',
      },
      'retrieval-v2',
    );

    const rendered = renderer.render(
      createRenderEnvelope('retrieval-v2', payload, {
        ...getDefaultOutputProfile(),
        tool: 'codex',
      }),
    );
    const parsed = JSON.parse(rendered);

    expect(parsed.type).toBe('retrieval-v2');
    expect(parsed.query_summary).toBe('Prefer staged invalidation.');
    expect(parsed.capsules[0]).toMatchObject({
      artifactId: 'artifact.cache',
      goal: 'Roll out safely',
      situation: 'Need cache rollout guidance',
    });
    expect(parsed.profile_hints[0]).toMatchObject({
      artifactId: 'artifact.cache',
      slug: 'cache-rollout',
    });
    expect(parsed.next_steps).toEqual(['Open the top matching skill artifact first.']);
    expect(parsed.skills).toBeUndefined();
  });

  it('renders claude skill lookup with explicit skill matches section', () => {
    const payload: SkillLookupResponse = {
      matches: [
        {
          artifactId: 'artifact.db',
          title: 'Database rollout',
          slug: 'db-rollout',
          labels: ['db', 'rollout'],
          scope: 'project',
          requiredLevel: 0,
          sourceKind: 'skill',
          score: 0.88,
          reason: 'Relevant to staged rollout',
        },
      ],
    };

    const renderer = resolveRenderer(
      {
        ...getDefaultOutputProfile(),
        tool: 'claude-code',
      },
      'skill-lookup',
    );

    const rendered = renderer.render(
      createRenderEnvelope('skill-lookup', payload, {
        ...getDefaultOutputProfile(),
        tool: 'claude-code',
      }),
    );

    expect(rendered).toContain('<skill_matches>');
    expect(rendered).toContain('Database rollout');
    expect(rendered).toContain('Relevant to staged rollout');
    expect(rendered).not.toContain('<recommended_skills>');
  });

  it('renders opencode retrieval-v1 with structured sections', () => {
    const payload: RetrievalResponse = {
      globalConstraints: [
        {
          entryId: 'entry-1',
          scope: 'global',
          requiredLevel: 0,
          shortcut: 'JWT Validation',
          detail: 'Validate tokens on every request.',
          labels: ['security'],
          score: 0.95,
          reason: 'Score: 0.95',
        },
      ],
      projectKnowledge: [
        {
          entryId: 'entry-2',
          scope: 'project',
          requiredLevel: 0,
          shortcut: 'API rate limit',
          detail: 'Rate limit API to 100 req/s.',
          labels: ['api'],
          score: 0.85,
          reason: 'Score: 0.85',
        },
      ],
      refinementSummary: null,
      summary: {
        text: 'Found 2 relevant entries.',
      },
    };

    const renderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'opencode' },
      'retrieval-v1',
    );

    const rendered = renderer.render(
      createRenderEnvelope('retrieval-v1', payload, {
        ...getDefaultOutputProfile(),
        tool: 'opencode',
      }),
    );

    expect(rendered).toContain('# Goal');
    expect(rendered).toContain('## Global Constraints');
    expect(rendered).toContain('JWT Validation');
    expect(rendered).toContain('## Project Knowledge');
    expect(rendered).toContain('API rate limit');
    expect(rendered).toContain('## Summary');
    expect(rendered).toContain('Found 2 relevant entries.');
  });

  it('renders opencode retrieval-v2 with capsule sections', () => {
    const payload: RetrievalV2Response = {
      capsules: [
        {
          capsuleId: 'cap-1',
          artifactId: 'artifact.db',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Use connection pooling.',
          situation: 'Need DB connection guidance',
          problem: 'Too many connections',
          goal: 'Pool connections safely',
          labels: ['db'],
          scope: 'project',
          requiredLevel: 0,
          score: 0.92,
          reason: 'High semantic match',
        },
      ],
      profileHints: [
        {
          artifactId: 'artifact.db',
          title: 'DB Pooling Skill',
          slug: 'db-pooling',
          labels: ['db'],
        },
      ],
      refinementSummary: 'Prefer connection pooling.',
      summary: null,
    };

    const renderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'opencode' },
      'retrieval-v2',
    );

    const rendered = renderer.render(
      createRenderEnvelope('retrieval-v2', payload, {
        ...getDefaultOutputProfile(),
        tool: 'opencode',
      }),
    );

    expect(rendered).toContain('# Goal');
    expect(rendered).toContain('## Capsules');
    expect(rendered).toContain('artifact.db');
    expect(rendered).toContain('Pool connections safely');
    expect(rendered).toContain('## Profile Hints');
    expect(rendered).toContain('DB Pooling Skill');
    expect(rendered).toContain('## Refinement Summary');
    expect(rendered).toContain('Prefer connection pooling.');
  });

  it('renders opencode skill-lookup with match sections', () => {
    const payload: SkillLookupResponse = {
      matches: [
        {
          artifactId: 'artifact.auth',
          title: 'Auth Skill',
          slug: 'auth-skill',
          labels: ['auth', 'security'],
          scope: 'global',
          requiredLevel: 0,
          sourceKind: 'skill',
          score: 0.88,
          reason: 'Relevant to auth flow',
        },
      ],
    };

    const renderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'opencode' },
      'skill-lookup',
    );

    const rendered = renderer.render(
      createRenderEnvelope('skill-lookup', payload, {
        ...getDefaultOutputProfile(),
        tool: 'opencode',
      }),
    );

    expect(rendered).toContain('# Goal');
    expect(rendered).toContain('## Matches');
    expect(rendered).toContain('artifact.auth');
    expect(rendered).toContain('Auth Skill');
    expect(rendered).toContain('Relevant to auth flow');
  });

  it('renders codex command-result for skill-edit shaped payload', () => {
    const payload = {
      action: 'skill-edit',
      success: true,
      summary: 'Updated artifact.db to revision 3.',
      artifacts: [
        {
          id: 'artifact.db',
          title: 'Database Skill',
          newState: 'active',
          revision: 3,
        },
      ],
      previousState: 'active',
      transition: { from: 'draft', to: 'active' },
      nextSteps: ['Verify the updated skill.'],
    };

    const renderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'codex' },
      'command-result',
    );

    const rendered = renderer.render(
      createRenderEnvelope('command-result', payload, {
        ...getDefaultOutputProfile(),
        tool: 'codex',
      }),
    );
    const parsed = JSON.parse(rendered);

    expect(parsed.type).toBe('command-result');
    expect(parsed.action).toBe('skill-edit');
    expect(parsed.success).toBe(true);
    expect(parsed.summary).toBe('Updated artifact.db to revision 3.');
    expect(parsed.artifacts[0]).toMatchObject({
      id: 'artifact.db',
      title: 'Database Skill',
      newState: 'active',
      revision: 3,
    });
    expect(parsed.transition).toEqual({ from: 'draft', to: 'active' });
    expect(parsed.next_steps).toEqual(['Verify the updated skill.']);
  });

  it('renders claude command-result as XML envelope', () => {
    const payload = {
      action: 'skill-review',
      success: true,
      summary: 'Approved artifact.db.',
      artifacts: [
        {
          id: 'artifact.db',
          title: 'Database Skill',
          newState: 'active',
        },
      ],
      previousState: 'pending_review',
      transition: { from: 'pending_review', to: 'active' },
      nextSteps: ['Publish the approved skill.'],
    };

    const renderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'claude-code' },
      'command-result',
    );

    const rendered = renderer.render(
      createRenderEnvelope('command-result', payload, {
        ...getDefaultOutputProfile(),
        tool: 'claude-code',
      }),
    );

    expect(rendered).toContain('<trapmap_command_result>');
    expect(rendered).toContain('<action>skill-review</action>');
    expect(rendered).toContain('<success>true</success>');
    expect(rendered).toContain('Approved artifact.db.');
    expect(rendered).toContain('<artifacts>');
    expect(rendered).toContain('Database Skill');
    expect(rendered).toContain('<step>Publish the approved skill.</step>');
  });

  it('renders opencode command-result as Markdown', () => {
    const payload = {
      action: 'skill-history',
      success: true,
      summary: 'History for artifact.db (3 revisions).',
      artifacts: [
        {
          id: 'artifact.db',
          title: 'Database Skill',
          newState: 'active',
          revision: 3,
        },
      ],
      nextSteps: ['Check revision 3.'],
    };

    const renderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'opencode' },
      'command-result',
    );

    const rendered = renderer.render(
      createRenderEnvelope('command-result', payload, {
        ...getDefaultOutputProfile(),
        tool: 'opencode',
      }),
    );

    expect(rendered).toContain('# Result');
    expect(rendered).toContain('skill-history');
    expect(rendered).toContain('## Summary');
    expect(rendered).toContain('History for artifact.db');
    expect(rendered).toContain('## Artifacts');
    expect(rendered).toContain('artifact.db');
    expect(rendered).toContain('## Next Steps');
    expect(rendered).toContain('Check revision 3.');
  });

  it('renders claude-code retrieval-v1 with XML constraints and project knowledge sections', () => {
    const payload: RetrievalResponse = {
      globalConstraints: [
        {
          entryId: 'entry-1',
          scope: 'global',
          requiredLevel: 0,
          shortcut: 'JWT Validation',
          detail: 'Validate tokens on every request.',
          labels: ['security'],
          score: 0.95,
          reason: 'High semantic match',
        },
      ],
      projectKnowledge: [
        {
          entryId: 'entry-2',
          scope: 'project',
          requiredLevel: 0,
          shortcut: 'API rate limit',
          detail: 'Rate limit API to 100 req/s.',
          labels: ['api'],
          score: 0.85,
          reason: 'Project-specific match',
        },
      ],
      refinementSummary: 'Focus on security and rate limiting.',
      summary: { text: 'Found 2 relevant entries.' },
    };

    const renderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'claude-code' },
      'retrieval-v1',
    );

    const rendered = renderer.render(
      createRenderEnvelope('retrieval-v1', payload, {
        ...getDefaultOutputProfile(),
        tool: 'claude-code',
      }),
    );

    expect(rendered).toContain('<trapmap_skill_pack>');
    expect(rendered).toContain('</trapmap_skill_pack>');
    expect(rendered).toContain('<retrieval_matches>');
    expect(rendered).toContain('<constraint>');
    expect(rendered).toContain('JWT Validation');
    expect(rendered).toContain('<project_item>');
    expect(rendered).toContain('API rate limit');
    expect(rendered).toContain('<summary>');
    expect(rendered).toContain('Found 2 relevant entries.');
    expect(rendered).toContain('<next_steps>');
  });

  it('renders codex retrieval-v1 as stable JSON with snake_case fields', () => {
    const payload: RetrievalResponse = {
      globalConstraints: [
        {
          entryId: 'entry-1',
          scope: 'global',
          requiredLevel: 0,
          shortcut: 'JWT Validation',
          detail: 'Validate tokens on every request.',
          labels: ['security'],
          score: 0.95,
          reason: 'High semantic match',
        },
      ],
      projectKnowledge: [
        {
          entryId: 'entry-2',
          scope: 'project',
          requiredLevel: 0,
          shortcut: 'API rate limit',
          detail: 'Rate limit API to 100 req/s.',
          labels: ['api'],
          score: 0.85,
          reason: 'Project-specific match',
        },
      ],
      refinementSummary: 'Focus on security and rate limiting.',
      summary: { text: 'Found 2 relevant entries.' },
    };

    const renderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'codex' },
      'retrieval-v1',
    );

    const rendered = renderer.render(
      createRenderEnvelope('retrieval-v1', payload, {
        ...getDefaultOutputProfile(),
        tool: 'codex',
      }),
    );
    const parsed = JSON.parse(rendered);

    expect(parsed.type).toBe('retrieval-v1');
    expect(parsed.query_summary).toBe('Found 2 relevant entries.');
    expect(parsed.constraints).toHaveLength(1);
    expect(parsed.constraints[0]).toMatchObject({
      entryId: 'entry-1',
      shortcut: 'JWT Validation',
      score: 0.95,
      reason: 'High semantic match',
      labels: ['security'],
    });
    expect(parsed.project_knowledge).toHaveLength(1);
    expect(parsed.project_knowledge[0]).toMatchObject({
      entryId: 'entry-2',
      shortcut: 'API rate limit',
      score: 0.85,
    });
    expect(parsed.next_steps).toEqual(['Read the highest-scoring entries first.']);
    // Should not contain camelCase keys
    expect(parsed.querySummary).toBeUndefined();
    expect(parsed.projectKnowledge).toBeUndefined();
  });

  it('limits traps and skills in compact graph-plan mode vs balanced', () => {
    const makePayload = (): GraphPlanSearchResponse => ({
      routingTrace: {
        selectedMode: 'mix',
        routeFamily: 'graph-plan',
        routingReason: 'graph-plan-selected',
        channelsUsed: ['semantic', 'plan'],
        fallbackTarget: null,
        confidenceScore: 0.91,
        confidenceBucket: 'high',
      },
      plan: {
        blockingTraps: [
          {
            nodeId: 'trap-1',
            sourceId: 'entry-1',
            label: 'Trap A',
            severity: 'hard',
            scope: 'project',
            requiredLevel: 0,
            evidence: 'Evidence A.',
            score: 0.95,
          },
          {
            nodeId: 'trap-2',
            sourceId: 'entry-2',
            label: 'Trap B',
            severity: 'soft',
            scope: 'project',
            requiredLevel: 0,
            evidence: 'Evidence B.',
            score: 0.8,
          },
          {
            nodeId: 'trap-3',
            sourceId: 'entry-3',
            label: 'Trap C',
            severity: 'soft',
            scope: 'project',
            requiredLevel: 0,
            evidence: 'Evidence C.',
            score: 0.6,
          },
        ],
        recommendedSkills: [
          {
            nodeId: 'skill-1',
            artifactId: 'artifact.one',
            capsuleId: 'cap-1',
            label: 'Skill One',
            situation: 'Situation 1',
            problem: 'Problem 1',
            goal: 'Goal 1',
            scope: 'project',
            requiredLevel: 0,
            score: 0.95,
            activationRefs: {
              references: [
                { path: 'docs/a.md', title: 'Doc A' },
                { path: 'docs/b.md', title: 'Doc B' },
              ],
              assets: [
                { path: 'assets/x.md', mediaType: 'text/markdown' },
                { path: 'assets/y.md', mediaType: 'text/markdown' },
              ],
              scripts: [{ path: 'scripts/run.sh', defaultPolicy: 'on-demand' }],
            },
          },
          {
            nodeId: 'skill-2',
            artifactId: 'artifact.two',
            capsuleId: 'cap-2',
            label: 'Skill Two',
            situation: 'Situation 2',
            problem: 'Problem 2',
            goal: 'Goal 2',
            scope: 'project',
            requiredLevel: 0,
            score: 0.88,
            activationRefs: {
              references: [{ path: 'docs/c.md', title: 'Doc C' }],
              assets: [],
              scripts: [],
            },
          },
          {
            nodeId: 'skill-3',
            artifactId: 'artifact.three',
            capsuleId: 'cap-3',
            label: 'Skill Three',
            situation: 'Situation 3',
            problem: 'Problem 3',
            goal: 'Goal 3',
            scope: 'project',
            requiredLevel: 0,
            score: 0.75,
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
          nodes: [],
          edges: [],
          citations: [],
          focus: { blockingTrapNodeIds: [], recommendedSkillNodeIds: [] },
        },
      },
      fallback: null,
    });

    // Balanced mode: should include up to 3 traps and 3 skills
    const balancedRenderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'codex', verbosity: 'balanced' },
      'graph-plan',
    );
    const balancedRendered = balancedRenderer.render(
      createRenderEnvelope('graph-plan', makePayload(), {
        ...getDefaultOutputProfile(),
        tool: 'codex',
        verbosity: 'balanced',
      }),
    );
    const balancedParsed = JSON.parse(balancedRendered);

    expect(balancedParsed.traps).toHaveLength(3);
    expect(balancedParsed.skills).toHaveLength(3);
    expect(balancedParsed.activation_hints).toHaveLength(3);
    // Balanced mode includes 2 references per skill
    expect(balancedParsed.activation_hints[0].references).toHaveLength(2);

    // Compact mode: should limit to 2 traps and 2 skills
    const compactRenderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'codex', verbosity: 'compact' },
      'graph-plan',
    );
    const compactRendered = compactRenderer.render(
      createRenderEnvelope('graph-plan', makePayload(), {
        ...getDefaultOutputProfile(),
        tool: 'codex',
        verbosity: 'compact',
      }),
    );
    const compactParsed = JSON.parse(compactRendered);

    expect(compactParsed.traps).toHaveLength(2);
    expect(compactParsed.traps[0].label).toBe('Trap A');
    expect(compactParsed.traps[1].label).toBe('Trap B');
    expect(compactParsed.skills).toHaveLength(2);
    expect(compactParsed.skills[0].artifactId).toBe('artifact.one');
    expect(compactParsed.skills[1].artifactId).toBe('artifact.two');
    expect(compactParsed.activation_hints).toHaveLength(2);
    // Compact mode limits references to 1 per skill
    expect(compactParsed.activation_hints[0].references).toHaveLength(1);
    expect(compactParsed.activation_hints[0].assets).toHaveLength(1);
  });

  describe('resolveRenderer', () => {
    it('falls back to generic renderer for unknown tool', () => {
      const profile = { ...getDefaultOutputProfile(), tool: 'unknown-tool' as any };
      const renderer = resolveRenderer(profile, 'generic');
      expect(renderer).toBeDefined();
      expect(renderer.id).toContain('generic');
    });
  });

  describe('summarizeRetrievalV1 via renderer', () => {
    it('skips null elements in globalConstraints', () => {
      const payload = {
        globalConstraints: [
          null,
          {
            entryId: 'e1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'test',
            detail: 'd',
            labels: [],
            score: 0.8,
            reason: 'r',
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      } as any;
      const profile = { ...getDefaultOutputProfile(), tool: 'generic' };
      const renderer = resolveRenderer(profile, 'retrieval-v1');
      const envelope = createRenderEnvelope('retrieval-v1', payload, profile);
      const result = renderer.render(envelope);
      expect(result).toContain('test');
    });
  });

  it('renders generic command-result as plain text', () => {
    const payload = {
      action: 'duplicate-job-resolve',
      success: true,
      summary: 'Resolved candidate-1 as independent.',
      nextSteps: ['Run apply-resolution.'],
    };

    const renderer = resolveRenderer(
      { ...getDefaultOutputProfile(), tool: 'generic' },
      'command-result',
    );

    const rendered = renderer.render(
      createRenderEnvelope('command-result', payload, {
        ...getDefaultOutputProfile(),
        tool: 'generic',
      }),
    );

    expect(rendered).toContain('duplicate-job-resolve');
    expect(rendered).toContain('Resolved candidate-1 as independent.');
    expect(rendered).toContain('Run apply-resolution.');
  });
});
