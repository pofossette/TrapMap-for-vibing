import { describe, expect, it, vi } from 'vitest';

import type { LlmGraphExtraction } from '@trapmap/contracts';

import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';

// Mock the prompt builders to avoid template file dependency
vi.mock('../../ai/prompts.js', () => ({
  buildGraphExtractionPlannerSlots_default: () => ({}),
  buildGraphExtractionSlots_default: () => ({}),
  buildPrompt: vi.fn(() => 'mock system prompt'),
}));

import {
  buildEdgeId,
  buildNodeId,
  extractGraphEntitiesWithLLM,
  extractSegmentEntities,
  mergeExtractions,
  normalizeValue,
  planExtraction,
  toGraphRecords,
} from './llm-extract.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockChat(response: string | string[]): ChatProvider {
  const responses = Array.isArray(response) ? response : [response];
  let callIndex = 0;
  return {
    provider: 'test',
    isConfigured: true,
    invoke: vi.fn(async () => {
      const r = responses[callIndex % responses.length];
      callIndex++;
      return r!;
    }),
  };
}

function unconfiguredChat(): ChatProvider {
  return {
    provider: 'test',
    isConfigured: false,
    invoke: vi.fn(async () => {
      throw new Error('not configured');
    }),
  };
}

const SAMPLE_EXTRACTION_JSON = JSON.stringify({
  nodes: [
    { kind: 'tool', label: 'docker', description: 'Container runtime' },
    { kind: 'cue', label: 'container-timeout', description: 'Timeout starting container' },
    { kind: 'mitigation', label: 'increase-timeout', description: 'Increase healthcheck interval' },
  ],
  edges: [
    {
      sourceLabel: 'docker',
      targetLabel: 'container-timeout',
      relationType: 'co-occurs-with',
      strength: 'soft',
    },
    {
      sourceLabel: 'increase-timeout',
      targetLabel: 'container-timeout',
      relationType: 'mitigates',
      strength: 'hard',
    },
    {
      sourceLabel: 'increase-timeout',
      targetLabel: 'docker',
      relationType: 'requires',
      strength: 'hard',
    },
  ],
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('llm-extract', () => {
  describe('normalizeValue', () => {
    it('lowercases and replaces spaces with hyphens', () => {
      expect(normalizeValue('  Docker Container  ')).toBe('docker-container');
    });

    it('handles single word', () => {
      expect(normalizeValue('npm')).toBe('npm');
    });
  });

  describe('buildNodeId', () => {
    it('creates deterministic ID from kind and label', () => {
      expect(buildNodeId('tool', 'Docker')).toBe('tool:docker');
      expect(buildNodeId('cue', 'Container Timeout')).toBe('cue:container-timeout');
    });

    it('is deterministic', () => {
      expect(buildNodeId('tool', 'npm')).toBe(buildNodeId('tool', 'npm'));
    });
  });

  describe('buildEdgeId', () => {
    it('creates deterministic edge ID', () => {
      const id = buildEdgeId('tool:docker', 'cue:timeout', 'co-occurs-with');
      expect(id).toBe('tool:docker-co-occurs-with-cue:timeout');
    });
  });

  describe('mergeExtractions', () => {
    it('merges nodes from multiple extractions, deduplicating by label', () => {
      const ext1: LlmGraphExtraction = {
        nodes: [{ kind: 'tool', label: 'docker' }],
        edges: [],
      };
      const ext2: LlmGraphExtraction = {
        nodes: [{ kind: 'tool', label: 'docker', description: 'longer description' }],
        edges: [],
      };
      const merged = mergeExtractions([ext1, ext2]);
      expect(merged.nodes).toHaveLength(1);
      expect(merged.nodes[0].description).toBe('longer description');
    });

    it('keeps longer description when merging duplicate nodes', () => {
      const ext1: LlmGraphExtraction = {
        nodes: [{ kind: 'cue', label: 'timeout', description: 'short' }],
        edges: [],
      };
      const ext2: LlmGraphExtraction = {
        nodes: [
          { kind: 'cue', label: 'timeout', description: 'a much longer description of timeout' },
        ],
        edges: [],
      };
      const merged = mergeExtractions([ext1, ext2]);
      expect(merged.nodes[0].description).toBe('a much longer description of timeout');
    });

    it('deduplicates edges by source+relation+target', () => {
      const ext1: LlmGraphExtraction = {
        nodes: [],
        edges: [
          {
            sourceLabel: 'a',
            targetLabel: 'b',
            relationType: 'requires',
            strength: 'hard',
          },
        ],
      };
      const ext2: LlmGraphExtraction = {
        nodes: [],
        edges: [
          {
            sourceLabel: 'a',
            targetLabel: 'b',
            relationType: 'requires',
            strength: 'soft',
          },
        ],
      };
      const merged = mergeExtractions([ext1, ext2]);
      expect(merged.edges).toHaveLength(1);
      expect(merged.edges[0].strength).toBe('hard');
    });

    it('keeps different edges between same nodes', () => {
      const ext1: LlmGraphExtraction = {
        nodes: [],
        edges: [
          {
            sourceLabel: 'a',
            targetLabel: 'b',
            relationType: 'requires',
            strength: 'hard',
          },
        ],
      };
      const ext2: LlmGraphExtraction = {
        nodes: [],
        edges: [
          {
            sourceLabel: 'a',
            targetLabel: 'b',
            relationType: 'co-occurs-with',
            strength: 'soft',
          },
        ],
      };
      const merged = mergeExtractions([ext1, ext2]);
      expect(merged.edges).toHaveLength(2);
    });

    it('deduplicates edges with different relation type casing', () => {
      const ext1: LlmGraphExtraction = {
        nodes: [],
        edges: [{ sourceLabel: 'a', targetLabel: 'b', relationType: 'requires', strength: 'hard' }],
      };
      const ext2 = {
        nodes: [],
        edges: [{ sourceLabel: 'a', targetLabel: 'b', relationType: 'Requires', strength: 'soft' }],
      } as unknown as LlmGraphExtraction;
      const merged = mergeExtractions([ext1, ext2]);
      expect(merged.edges).toHaveLength(1);
      expect(merged.edges[0].strength).toBe('hard');
    });
  });

  describe('toGraphRecords', () => {
    it('converts LLM nodes and edges to GraphNodeRecord/GraphEdgeRecord', () => {
      const extraction: LlmGraphExtraction = {
        nodes: [
          { kind: 'tool', label: 'docker' },
          { kind: 'cue', label: 'timeout' },
        ],
        edges: [
          {
            sourceLabel: 'docker',
            targetLabel: 'timeout',
            relationType: 'co-occurs-with',
            strength: 'soft',
          },
        ],
      };
      const { nodes, edges } = toGraphRecords(extraction);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].id).toBe('tool:docker');
      expect(nodes[0].kind).toBe('tool');
      expect(nodes[1].id).toBe('cue:timeout');
      expect(edges).toHaveLength(1);
      expect(edges[0].sourceNodeId).toBe('tool:docker');
      expect(edges[0].targetNodeId).toBe('cue:timeout');
      expect(edges[0].relationType).toBe('co-occurs-with');
      expect(edges[0].strength).toBe('soft');
      expect(edges[0].id).toBe('tool:docker-co-occurs-with-cue:timeout');
    });

    it('skips edges referencing non-existent nodes', () => {
      const extraction: LlmGraphExtraction = {
        nodes: [{ kind: 'tool', label: 'docker' }],
        edges: [
          {
            sourceLabel: 'docker',
            targetLabel: 'nonexistent',
            relationType: 'requires',
            strength: 'hard',
          },
        ],
      };
      const { edges } = toGraphRecords(extraction);
      expect(edges).toHaveLength(0);
    });

    it('uses description as evidence, defaults to llm-extracted', () => {
      const extraction: LlmGraphExtraction = {
        nodes: [
          { kind: 'tool', label: 'npm' },
          { kind: 'tool', label: 'yarn', description: 'alternative package manager' },
        ],
        edges: [],
      };
      const { nodes } = toGraphRecords(extraction);
      expect(nodes[0].evidence).toBe('llm-extracted');
      expect(nodes[1].evidence).toBe('alternative package manager');
    });

    it('normalizes relation type casing before lookup', () => {
      const extraction = {
        nodes: [
          { kind: 'tool', label: 'docker' },
          { kind: 'cue', label: 'timeout' },
        ],
        edges: [
          { sourceLabel: 'docker', targetLabel: 'timeout', relationType: 'Co-occurs-With', strength: 'soft' },
        ],
      } as unknown as LlmGraphExtraction;
      const { edges } = toGraphRecords(extraction);
      expect(edges).toHaveLength(1);
      expect(edges[0].relationType).toBe('co-occurs-with');
    });

    it('resolves relation type aliases', () => {
      const extraction = {
        nodes: [
          { kind: 'tool', label: 'a' },
          { kind: 'cue', label: 'b' },
        ],
        edges: [
          { sourceLabel: 'a', targetLabel: 'b', relationType: 'mitigate', strength: 'hard' },
        ],
      } as unknown as LlmGraphExtraction;
      const { edges } = toGraphRecords(extraction);
      expect(edges).toHaveLength(1);
      expect(edges[0].relationType).toBe('mitigates');
    });

    it('still skips truly unknown relation types', () => {
      const extraction = {
        nodes: [
          { kind: 'tool', label: 'a' },
          { kind: 'cue', label: 'b' },
        ],
        edges: [
          { sourceLabel: 'a', targetLabel: 'b', relationType: 'totally-unknown', strength: 'hard' },
        ],
      } as unknown as LlmGraphExtraction;
      const { edges } = toGraphRecords(extraction);
      expect(edges).toHaveLength(0);
    });
  });

  describe('planExtraction', () => {
    it('returns single segment for short text without LLM call', async () => {
      const chat = mockChat('');
      const plan = await planExtraction(chat, 'short text');
      expect(plan.segments).toHaveLength(1);
      expect(plan.segments[0].text).toBe('short text');
      expect(chat.invoke).not.toHaveBeenCalled();
    });

    it('returns fixed chunk plan when chat not configured for long text', async () => {
      const chat = unconfiguredChat();
      const longText = 'x'.repeat(5000);
      const plan = await planExtraction(chat, longText);
      expect(plan.segments.length).toBeGreaterThan(1);
      expect(chat.invoke).not.toHaveBeenCalled();
    });

    it('calls LLM for long text when configured', async () => {
      const planJson = JSON.stringify({
        segments: [
          { text: 'first half', contextHint: 'intro', priority: 1 },
          { text: 'second half', contextHint: 'details', priority: 2 },
        ],
      });
      const chat = mockChat(planJson);
      const longText = 'x'.repeat(3000);
      const plan = await planExtraction(chat, longText);
      expect(plan.segments).toHaveLength(2);
      expect(chat.invoke).toHaveBeenCalledOnce();
    });

    it('falls back to fixed chunks when LLM returns invalid JSON', async () => {
      const chat = mockChat('not json at all');
      const longText = 'x'.repeat(5000);
      const plan = await planExtraction(chat, longText);
      expect(plan.segments.length).toBeGreaterThan(1);
    });
  });

  describe('extractSegmentEntities', () => {
    it('extracts nodes and edges from valid LLM response', async () => {
      const chat = mockChat(SAMPLE_EXTRACTION_JSON);
      const result = await extractSegmentEntities(chat, 'some text');
      expect(result).not.toBeNull();
      expect(result!.nodes).toHaveLength(3);
      expect(result!.edges).toHaveLength(3);
    });

    it('returns null when chat not configured', async () => {
      const chat = unconfiguredChat();
      const result = await extractSegmentEntities(chat, 'text');
      expect(result).toBeNull();
    });

    it('returns null when LLM returns invalid JSON', async () => {
      const chat = mockChat('{ broken json');
      const result = await extractSegmentEntities(chat, 'text', 0);
      expect(result).toBeNull();
    });

    it('returns null when Zod validation fails (too many nodes)', async () => {
      const tooManyNodes = JSON.stringify({
        nodes: Array.from({ length: 16 }, (_, i) => ({
          kind: 'tool',
          label: `tool-${i}`,
        })),
        edges: [],
      });
      const chat = mockChat(tooManyNodes);
      const result = await extractSegmentEntities(chat, 'text', 0);
      expect(result).toBeNull();
    });

    it('strips markdown code fences from LLM response', async () => {
      const wrappedResponse = `\`\`\`json\n${SAMPLE_EXTRACTION_JSON}\n\`\`\``;
      const chat = mockChat(wrappedResponse);
      const result = await extractSegmentEntities(chat, 'text');
      expect(result).not.toBeNull();
      expect(result!.nodes).toHaveLength(3);
    });

    it('retries on failure with exponential backoff', async () => {
      let callCount = 0;
      const chat: ChatProvider = {
        provider: 'test',
        isConfigured: true,
        invoke: vi.fn(async () => {
          callCount++;
          if (callCount < 2) throw new Error('temporary failure');
          return SAMPLE_EXTRACTION_JSON;
        }),
      };
      const result = await extractSegmentEntities(chat, 'text', 2);
      expect(result).not.toBeNull();
      expect(callCount).toBe(2);
    });
  });

  describe('extractGraphEntitiesWithLLM', () => {
    it('extracts from short text in single phase', async () => {
      const chat = mockChat(SAMPLE_EXTRACTION_JSON);
      const result = await extractGraphEntitiesWithLLM(chat, 'short text about docker');
      expect(result.nodes.length).toBeGreaterThan(0);
      expect(result.edges.length).toBeGreaterThan(0);
      expect(result.metrics.llmSuccessCount).toBe(1);
    });

    it('falls back to rule engine when chat not configured', async () => {
      const chat = unconfiguredChat();
      const mockDocument = {
        entryId: 'test-entry',
        shortcut: 'docker-timeout',
        detail: 'Docker container times out',
        canonicalText: 'Docker container times out during health check',
        labels: ['docker', 'timeout'],
        teamId: null,
        scope: 'global' as const,
        requiredLevel: 0,
        revision: 1,
        lifecycleState: 'approved' as const,
        tokens: ['docker', 'container', 'timeout'],
        contentHash: 'abc',
        boundary: null,
        updatedAt: '2026-01-01T00:00:00Z',
        normalizedAt: '2026-01-01T00:00:00Z',
      };
      const result = await extractGraphEntitiesWithLLM(chat, 'text', {}, mockDocument);
      expect(result.metrics.fallbackCount).toBe(1);
      expect(result.nodes.length).toBeGreaterThan(0);
    });

    it('returns empty when chat not configured and no fallback document', async () => {
      const chat = unconfiguredChat();
      const result = await extractGraphEntitiesWithLLM(chat, 'text');
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('falls back to rule engine when LLM returns empty results', async () => {
      const emptyExtraction = JSON.stringify({ nodes: [], edges: [] });
      const chat = mockChat(emptyExtraction);
      const mockDocument = {
        entryId: 'test-entry',
        shortcut: 'docker-timeout',
        detail: 'Docker container times out',
        canonicalText: 'Docker container times out during health check',
        labels: ['docker', 'timeout'],
        teamId: null,
        scope: 'global' as const,
        requiredLevel: 0,
        revision: 1,
        lifecycleState: 'approved' as const,
        tokens: ['docker', 'container', 'timeout'],
        contentHash: 'abc',
        boundary: null,
        updatedAt: '2026-01-01T00:00:00Z',
        normalizedAt: '2026-01-01T00:00:00Z',
      };
      const result = await extractGraphEntitiesWithLLM(chat, 'short text', {}, mockDocument);
      expect(result.metrics.fallbackCount).toBe(1);
    });
  });

  describe('negation handling', () => {
    it('LLM output correctly omits requires edge for negated text', async () => {
      const negationJson = JSON.stringify({
        nodes: [
          { kind: 'prerequisite', label: 'nodejs-18-plus' },
          { kind: 'tool', label: 'npm' },
        ],
        edges: [
          {
            sourceLabel: 'npm',
            targetLabel: 'nodejs-18-plus',
            relationType: 'requires',
            strength: 'hard',
          },
        ],
      });
      const chat = mockChat(negationJson);
      const result = await extractSegmentEntities(chat, 'does NOT require TypeScript');
      expect(result).not.toBeNull();
      const tsNodes = result!.nodes.filter((n) => n.label.includes('typescript'));
      expect(tsNodes).toHaveLength(0);
    });
  });

  describe('empty and edge cases', () => {
    it('handles empty text gracefully via short-text path', async () => {
      const chat = mockChat(SAMPLE_EXTRACTION_JSON);
      const plan = await planExtraction(chat, '');
      expect(plan.segments).toHaveLength(1);
      expect(plan.segments[0].text).toBe('');
    });

    it('handles pure code snippet extraction', async () => {
      const codeExtraction = JSON.stringify({
        nodes: [{ kind: 'tool', label: 'typescript' }],
        edges: [],
      });
      const chat = mockChat(codeExtraction);
      const result = await extractSegmentEntities(chat, 'const x: number = 42;');
      expect(result).not.toBeNull();
      expect(result!.nodes).toHaveLength(1);
    });
  });

  describe('gleaning merge', () => {
    it('merges gleaning result with initial extraction via extractGraphEntitiesWithLLM', async () => {
      // First call: initial extraction
      const initialExtraction = JSON.stringify({
        nodes: [{ kind: 'tool', label: 'docker' }],
        edges: [],
      });
      // Second call: gleaning finds additional entities
      const gleaningExtraction = JSON.stringify({
        nodes: [{ kind: 'cue', label: 'oom-killed', description: 'Container killed by OOM' }],
        edges: [
          {
            sourceLabel: 'docker',
            targetLabel: 'oom-killed',
            relationType: 'risk-blocks',
            strength: 'soft',
          },
        ],
      });
      const chat = mockChat([initialExtraction, gleaningExtraction]);
      const result = await extractGraphEntitiesWithLLM(chat, 'short text');
      // Should have merged both: docker + oom-killed
      expect(result.nodes.length).toBeGreaterThanOrEqual(2);
      expect(result.edges.length).toBeGreaterThanOrEqual(1);
      expect(result.metrics.gleaningCount).toBe(1);
    });

    it('gleaning keeps longer description for duplicate nodes', () => {
      const initial: LlmGraphExtraction = {
        nodes: [{ kind: 'tool', label: 'docker', description: 'short' }],
        edges: [],
      };
      const gleaned: LlmGraphExtraction = {
        nodes: [
          {
            kind: 'tool',
            label: 'docker',
            description: 'Container runtime for building and running applications',
          },
        ],
        edges: [],
      };
      const merged = mergeExtractions([initial, gleaned]);
      expect(merged.nodes).toHaveLength(1);
      expect(merged.nodes[0].description).toBe(
        'Container runtime for building and running applications',
      );
    });
  });
});
