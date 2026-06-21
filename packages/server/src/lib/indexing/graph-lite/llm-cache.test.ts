import { describe, expect, it } from 'vitest';

import type { ExtractionPlan, LlmGraphExtraction } from '@trapmap/contracts';

import { LlmExtractionCache, PROMPT_VERSION } from './llm-cache.js';
import type { LlmExtractionResult } from './llm-extract.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_PLAN: ExtractionPlan = {
  segments: [
    { text: 'first segment', priority: 1 },
    { text: 'second segment', priority: 2 },
  ],
};

const SAMPLE_EXTRACTION: LlmGraphExtraction = {
  nodes: [
    { kind: 'tool', label: 'docker', description: 'Container runtime' },
    { kind: 'cue', label: 'timeout', description: 'Timeout issue' },
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

function makeResult(
  nodes = SAMPLE_EXTRACTION.nodes,
  edges = SAMPLE_EXTRACTION.edges,
): LlmExtractionResult {
  return {
    nodes: nodes.map((n) => ({
      id: `${n.kind}:${n.label}`,
      kind: n.kind,
      label: n.label,
      evidence: n.description ?? 'llm-extracted',
    })),
    edges: edges.map((e) => ({
      id: `${e.sourceLabel}-${e.relationType}-${e.targetLabel}`,
      sourceNodeId: `${e.sourceLabel}`,
      targetNodeId: `${e.targetLabel}`,
      relationType: e.relationType,
      strength: e.strength,
      evidence: e.description ?? 'llm-extracted',
    })),
    metrics: {
      llmSuccessCount: 1,
      cacheHitCount: 0,
      llmUnavailableCount: 0,
      extractionErrorCount: 0,
      emptyExtractionCount: 0,
      phase1Ms: 0,
      phase2Ms: 0,
      gleaningCount: 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LlmExtractionCache', () => {
  describe('PROMPT_VERSION', () => {
    it('is exported as a number', () => {
      expect(typeof PROMPT_VERSION).toBe('number');
      expect(PROMPT_VERSION).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Phase 1 cache', () => {
    it('returns undefined for cache miss', () => {
      const cache = new LlmExtractionCache();
      expect(cache.getPhase1('nonexistent text')).toBeUndefined();
    });

    it('stores and retrieves a Phase 1 plan', () => {
      const cache = new LlmExtractionCache();
      const text = 'This is a test text for planning';
      cache.setPhase1(text, SAMPLE_PLAN);

      const result = cache.getPhase1(text);
      expect(result).toBeDefined();
      expect(result!.segments).toHaveLength(2);
      expect(result!.segments[0].text).toBe('first segment');
    });

    it('reports hasPhase1 correctly', () => {
      const cache = new LlmExtractionCache();
      const text = 'Another test text';
      expect(cache.hasPhase1(text)).toBe(false);
      cache.setPhase1(text, SAMPLE_PLAN);
      expect(cache.hasPhase1(text)).toBe(true);
    });

    it('returns different results for different texts', () => {
      const cache = new LlmExtractionCache();
      const plan1: ExtractionPlan = { segments: [{ text: 'a', priority: 1 }] };
      const plan2: ExtractionPlan = { segments: [{ text: 'b', priority: 1 }] };

      cache.setPhase1('text one', plan1);
      cache.setPhase1('text two', plan2);

      expect(cache.getPhase1('text one')!.segments[0].text).toBe('a');
      expect(cache.getPhase1('text two')!.segments[0].text).toBe('b');
    });
  });

  describe('Phase 2 cache', () => {
    it('returns undefined for cache miss', () => {
      const cache = new LlmExtractionCache();
      expect(cache.getPhase2('nonexistent text')).toBeUndefined();
    });

    it('stores and retrieves a Phase 2 result', () => {
      const cache = new LlmExtractionCache();
      const text = 'Extraction text for phase 2';
      const result = makeResult();
      cache.setPhase2(text, result);

      const cached = cache.getPhase2(text);
      expect(cached).toBeDefined();
      expect(cached!.nodes).toHaveLength(2);
      expect(cached!.edges).toHaveLength(1);
    });

    it('reports hasPhase2 correctly', () => {
      const cache = new LlmExtractionCache();
      const text = 'Phase 2 test';
      expect(cache.hasPhase2(text)).toBe(false);
      cache.setPhase2(text, makeResult());
      expect(cache.hasPhase2(text)).toBe(true);
    });
  });

  describe('invalidation', () => {
    it('invalidates both phases for a specific text', () => {
      const cache = new LlmExtractionCache();
      const text = 'Text to invalidate';
      cache.setPhase1(text, SAMPLE_PLAN);
      cache.setPhase2(text, makeResult());

      expect(cache.hasPhase1(text)).toBe(true);
      expect(cache.hasPhase2(text)).toBe(true);

      cache.invalidate(text);

      expect(cache.hasPhase1(text)).toBe(false);
      expect(cache.hasPhase2(text)).toBe(false);
    });

    it('does not affect other entries on invalidation', () => {
      const cache = new LlmExtractionCache();
      cache.setPhase1('text A', SAMPLE_PLAN);
      cache.setPhase1('text B', SAMPLE_PLAN);
      cache.invalidate('text A');

      expect(cache.hasPhase1('text A')).toBe(false);
      expect(cache.hasPhase1('text B')).toBe(true);
    });

    it('clears all entries', () => {
      const cache = new LlmExtractionCache();
      cache.setPhase1('a', SAMPLE_PLAN);
      cache.setPhase1('b', SAMPLE_PLAN);
      cache.setPhase2('c', makeResult());
      cache.setPhase2('d', makeResult());

      expect(cache.size).toBe(4);
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('size tracking', () => {
    it('tracks sizes across both phases', () => {
      const cache = new LlmExtractionCache();
      expect(cache.phase1Size).toBe(0);
      expect(cache.phase2Size).toBe(0);
      expect(cache.size).toBe(0);

      cache.setPhase1('a', SAMPLE_PLAN);
      expect(cache.phase1Size).toBe(1);
      expect(cache.size).toBe(1);

      cache.setPhase2('b', makeResult());
      expect(cache.phase2Size).toBe(1);
      expect(cache.size).toBe(2);
    });
  });

  describe('key determinism', () => {
    it('same text always maps to same key', () => {
      const cache = new LlmExtractionCache();
      const text = 'deterministic key test';
      cache.setPhase1(text, SAMPLE_PLAN);

      // Access multiple times should get same result
      expect(cache.getPhase1(text)).toEqual(SAMPLE_PLAN);
      expect(cache.getPhase1(text)).toEqual(SAMPLE_PLAN);
    });
  });
});
