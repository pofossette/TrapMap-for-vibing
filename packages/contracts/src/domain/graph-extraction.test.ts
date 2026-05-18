import { describe, expect, it } from 'vitest';

import {
  extractionMetricsSchema,
  extractionPlanSchema,
  extractionPlanSegmentSchema,
  llmGraphEdgeSchema,
  llmGraphExtractionSchema,
  llmGraphNodeSchema,
  llmNodeKindSchema,
  llmRelationStrengthSchema,
  llmRelationTypeSchema,
} from './graph-extraction.js';

describe('graph-extraction schema', () => {
  describe('llmNodeKindSchema', () => {
    it.each(['trap', 'skill', 'cue', 'tool', 'environment', 'prerequisite', 'mitigation'] as const)(
      'accepts valid kind: %s',
      (kind) => {
        expect(llmNodeKindSchema.parse(kind)).toBe(kind);
      },
    );

    it('rejects boundary-context (handled by boundary-extract, not LLM)', () => {
      expect(() => llmNodeKindSchema.parse('boundary-context')).toThrow();
    });

    it('rejects invalid strings', () => {
      expect(() => llmNodeKindSchema.parse('unknown')).toThrow();
      expect(() => llmNodeKindSchema.parse('')).toThrow();
    });
  });

  describe('llmRelationTypeSchema', () => {
    it.each(['mitigates', 'requires', 'order', 'risk-blocks', 'co-occurs-with'] as const)(
      'accepts valid relation: %s',
      (rel) => {
        expect(llmRelationTypeSchema.parse(rel)).toBe(rel);
      },
    );

    it('rejects boundary-specific relations', () => {
      expect(() => llmRelationTypeSchema.parse('applies-in')).toThrow();
      expect(() => llmRelationTypeSchema.parse('requires-version')).toThrow();
      expect(() => llmRelationTypeSchema.parse('excludes-context')).toThrow();
      expect(() => llmRelationTypeSchema.parse('excludes-version')).toThrow();
    });
  });

  describe('llmRelationStrengthSchema', () => {
    it.each(['hard', 'soft'] as const)('accepts: %s', (s) => {
      expect(llmRelationStrengthSchema.parse(s)).toBe(s);
    });

    it('rejects invalid values', () => {
      expect(() => llmRelationStrengthSchema.parse('medium')).toThrow();
    });
  });

  describe('llmGraphNodeSchema', () => {
    it('accepts minimal node (kind + label only)', () => {
      const result = llmGraphNodeSchema.parse({ kind: 'tool', label: 'docker' });
      expect(result.kind).toBe('tool');
      expect(result.label).toBe('docker');
      expect(result.description).toBeUndefined();
    });

    it('accepts node with description', () => {
      const result = llmGraphNodeSchema.parse({
        kind: 'cue',
        label: 'container-timeout',
        description: 'Timeout waiting for container to start',
      });
      expect(result.description).toBe('Timeout waiting for container to start');
    });

    it('rejects empty label', () => {
      expect(() => llmGraphNodeSchema.parse({ kind: 'tool', label: '' })).toThrow();
    });

    it('rejects label exceeding 128 chars', () => {
      expect(() => llmGraphNodeSchema.parse({ kind: 'tool', label: 'x'.repeat(129) })).toThrow();
    });
  });

  describe('llmGraphEdgeSchema', () => {
    it('accepts minimal edge', () => {
      const result = llmGraphEdgeSchema.parse({
        sourceLabel: 'docker',
        targetLabel: 'container-timeout',
        relationType: 'co-occurs-with',
        strength: 'soft',
      });
      expect(result.sourceLabel).toBe('docker');
      expect(result.relationType).toBe('co-occurs-with');
    });

    it('accepts edge with description', () => {
      const result = llmGraphEdgeSchema.parse({
        sourceLabel: 'fix-script',
        targetLabel: 'docker',
        relationType: 'requires',
        strength: 'hard',
        description: 'The fix requires docker to be installed',
      });
      expect(result.description).toBe('The fix requires docker to be installed');
    });

    it('rejects empty sourceLabel', () => {
      expect(() =>
        llmGraphEdgeSchema.parse({
          sourceLabel: '',
          targetLabel: 'docker',
          relationType: 'requires',
          strength: 'hard',
        }),
      ).toThrow();
    });
  });

  describe('llmGraphExtractionSchema', () => {
    it('accepts valid extraction with nodes and edges', () => {
      const input = {
        nodes: [
          { kind: 'tool' as const, label: 'docker' },
          { kind: 'cue' as const, label: 'container-timeout' },
        ],
        edges: [
          {
            sourceLabel: 'docker',
            targetLabel: 'container-timeout',
            relationType: 'co-occurs-with' as const,
            strength: 'soft' as const,
          },
        ],
      };
      const result = llmGraphExtractionSchema.parse(input);
      expect(result.nodes).toHaveLength(2);
      expect(result.edges).toHaveLength(1);
    });

    it('accepts empty extraction', () => {
      const result = llmGraphExtractionSchema.parse({ nodes: [], edges: [] });
      expect(result.nodes).toHaveLength(0);
      expect(result.edges).toHaveLength(0);
    });

    it('rejects more than 15 nodes', () => {
      const nodes = Array.from({ length: 16 }, (_, i) => ({
        kind: 'tool' as const,
        label: `tool-${i}`,
      }));
      expect(() => llmGraphExtractionSchema.parse({ nodes, edges: [] })).toThrow();
    });

    it('rejects more than 20 edges', () => {
      const edges = Array.from({ length: 21 }, (_, i) => ({
        sourceLabel: `node-${i}`,
        targetLabel: `node-${i + 1}`,
        relationType: 'co-occurs-with' as const,
        strength: 'soft' as const,
      }));
      expect(() => llmGraphExtractionSchema.parse({ nodes: [], edges })).toThrow();
    });
  });

  describe('extractionPlanSchema', () => {
    it('accepts single segment plan', () => {
      const result = extractionPlanSchema.parse({
        segments: [{ text: 'short text here' }],
      });
      expect(result.segments).toHaveLength(1);
    });

    it('accepts multi-segment plan with hints', () => {
      const result = extractionPlanSchema.parse({
        segments: [
          { text: 'first part', contextHint: 'introduction', priority: 1 },
          { text: 'second part', contextHint: 'technical details', priority: 2 },
        ],
      });
      expect(result.segments[0].priority).toBe(1);
      expect(result.segments[1].contextHint).toBe('technical details');
    });

    it('rejects empty segments array', () => {
      expect(() => extractionPlanSchema.parse({ segments: [] })).toThrow();
    });

    it('rejects more than 10 segments', () => {
      const segments = Array.from({ length: 11 }, (_, i) => ({
        text: `segment ${i}`,
      }));
      expect(() => extractionPlanSchema.parse({ segments })).toThrow();
    });
  });

  describe('extractionPlanSegmentSchema', () => {
    it('defaults priority to 1', () => {
      const result = extractionPlanSegmentSchema.parse({ text: 'some text' });
      expect(result.priority).toBe(1);
    });

    it('rejects empty text', () => {
      expect(() => extractionPlanSegmentSchema.parse({ text: '' })).toThrow();
    });

    it('rejects priority below 1', () => {
      expect(() => extractionPlanSegmentSchema.parse({ text: 'x', priority: 0 })).toThrow();
    });
  });

  describe('extractionMetricsSchema', () => {
    it('accepts all-zero metrics', () => {
      const result = extractionMetricsSchema.parse({});
      expect(result.llmSuccessCount).toBe(0);
      expect(result.cacheHitCount).toBe(0);
      expect(result.fallbackCount).toBe(0);
      expect(result.phase1Ms).toBe(0);
      expect(result.phase2Ms).toBe(0);
      expect(result.gleaningCount).toBe(0);
    });

    it('accepts populated metrics', () => {
      const result = extractionMetricsSchema.parse({
        llmSuccessCount: 3,
        cacheHitCount: 1,
        fallbackCount: 0,
        phase1Ms: 150.5,
        phase2Ms: 400.2,
        gleaningCount: 1,
      });
      expect(result.llmSuccessCount).toBe(3);
      expect(result.phase1Ms).toBe(150.5);
    });

    it('rejects negative counts', () => {
      expect(() => extractionMetricsSchema.parse({ llmSuccessCount: -1 })).toThrow();
    });
  });
});
