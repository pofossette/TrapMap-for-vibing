import { describe, expect, it } from 'vitest';
import { retrievalMatchSchema, retrievalQuerySchema } from '../../src/domain/retrieval.js';

describe('Retrieval schema boundary fields', () => {
  describe('retrievalQuerySchema.boundaryContext', () => {
    it('accepts query with boundaryContext', () => {
      const result = retrievalQuerySchema.parse({
        seed: 'test query',
        boundaryContext: {
          contexts: ['production', 'frontend'],
          platform: 'linux',
          versions: [{ package: 'react', version: '18.2.0' }],
        },
      });

      expect(result.boundaryContext).toBeDefined();
      expect(result.boundaryContext?.contexts).toEqual(['production', 'frontend']);
      expect(result.boundaryContext?.platform).toBe('linux');
      expect(result.boundaryContext?.versions).toHaveLength(1);
    });

    it('accepts query without boundaryContext', () => {
      const result = retrievalQuerySchema.parse({ seed: 'test query' });
      expect(result.boundaryContext).toBeUndefined();
    });

    it('accepts partial boundaryContext with only contexts', () => {
      const result = retrievalQuerySchema.parse({
        seed: 'test query',
        boundaryContext: { contexts: ['backend'] },
      });
      expect(result.boundaryContext?.contexts).toEqual(['backend']);
      expect(result.boundaryContext?.platform).toBeUndefined();
      expect(result.boundaryContext?.versions).toBeUndefined();
    });

    it('accepts partial boundaryContext with only platform', () => {
      const result = retrievalQuerySchema.parse({
        seed: 'test query',
        boundaryContext: { platform: 'windows' },
      });
      expect(result.boundaryContext?.platform).toBe('windows');
      expect(result.boundaryContext?.contexts).toBeUndefined();
    });

    it('accepts partial boundaryContext with only versions', () => {
      const result = retrievalQuerySchema.parse({
        seed: 'test query',
        boundaryContext: { versions: [{ package: 'node', version: '20.0.0' }] },
      });
      expect(result.boundaryContext?.versions).toHaveLength(1);
    });

    it('accepts empty boundaryContext object', () => {
      const result = retrievalQuerySchema.parse({
        seed: 'test query',
        boundaryContext: {},
      });
      expect(result.boundaryContext).toBeDefined();
    });

    it('rejects invalid context item over 64 chars', () => {
      expect(() =>
        retrievalQuerySchema.parse({
          seed: 'test query',
          boundaryContext: { contexts: ['a'.repeat(65)] },
        }),
      ).toThrow();
    });

    it('rejects invalid platform over 64 chars', () => {
      expect(() =>
        retrievalQuerySchema.parse({
          seed: 'test query',
          boundaryContext: { platform: 'a'.repeat(65) },
        }),
      ).toThrow();
    });

    it('rejects invalid version missing package', () => {
      expect(() =>
        retrievalQuerySchema.parse({
          seed: 'test query',
          boundaryContext: { versions: [{ version: '1.0.0' }] },
        }),
      ).toThrow();
    });

    it('rejects invalid version missing version', () => {
      expect(() =>
        retrievalQuerySchema.parse({
          seed: 'test query',
          boundaryContext: { versions: [{ package: 'react' }] },
        }),
      ).toThrow();
    });
  });

  describe('retrievalMatchSchema.boundaryExplanation', () => {
    it('accepts match with boundaryExplanation', () => {
      const result = retrievalMatchSchema.parse({
        entryId: 'entry-1',
        scope: 'global',
        requiredLevel: 5,
        shortcut: 'test-trap',
        detail: 'Test detail',
        labels: ['test'],
        score: 0.85,
        reason: 'semantic similarity',
        boundaryExplanation: {
          checked: true,
          requiredSatisfied: true,
          warnings: ['Excluded platform: windows'],
          boosts: ['Applicable context: production'],
        },
      });

      expect(result.boundaryExplanation).toBeDefined();
      expect(result.boundaryExplanation?.checked).toBe(true);
      expect(result.boundaryExplanation?.warnings).toContain('Excluded platform: windows');
    });

    it('accepts match without boundaryExplanation', () => {
      const result = retrievalMatchSchema.parse({
        entryId: 'entry-1',
        scope: 'global',
        requiredLevel: 5,
        shortcut: 'test-trap',
        detail: 'Test detail',
        labels: ['test'],
        score: 0.85,
        reason: 'semantic similarity',
      });

      expect(result.boundaryExplanation).toBeUndefined();
    });

    it('accepts boundaryExplanation with empty warnings and boosts', () => {
      const result = retrievalMatchSchema.parse({
        entryId: 'entry-1',
        scope: 'global',
        requiredLevel: 5,
        shortcut: 'test-trap',
        detail: 'Test detail',
        labels: ['test'],
        score: 0.85,
        reason: 'semantic similarity',
        boundaryExplanation: {
          checked: true,
          requiredSatisfied: true,
          warnings: [],
          boosts: [],
        },
      });

      expect(result.boundaryExplanation?.warnings).toEqual([]);
      expect(result.boundaryExplanation?.boosts).toEqual([]);
    });

    it('accepts boundaryExplanation with checked false', () => {
      const result = retrievalMatchSchema.parse({
        entryId: 'entry-1',
        scope: 'global',
        requiredLevel: 5,
        shortcut: 'test-trap',
        detail: 'Test detail',
        labels: ['test'],
        score: 0.85,
        reason: 'semantic similarity',
        boundaryExplanation: {
          checked: false,
          requiredSatisfied: true,
          warnings: [],
          boosts: [],
        },
      });

      expect(result.boundaryExplanation?.checked).toBe(false);
    });

    it('accepts boundaryExplanation with requiredSatisfied false', () => {
      const result = retrievalMatchSchema.parse({
        entryId: 'entry-1',
        scope: 'global',
        requiredLevel: 5,
        shortcut: 'test-trap',
        detail: 'Test detail',
        labels: ['test'],
        score: 0.85,
        reason: 'semantic similarity',
        boundaryExplanation: {
          checked: true,
          requiredSatisfied: false,
          warnings: ['Version constraint not satisfied'],
          boosts: [],
        },
      });

      expect(result.boundaryExplanation?.requiredSatisfied).toBe(false);
    });

    it('rejects boundaryExplanation missing checked field', () => {
      expect(() =>
        retrievalMatchSchema.parse({
          entryId: 'entry-1',
          scope: 'global',
          requiredLevel: 5,
          shortcut: 'test-trap',
          detail: 'Test detail',
          labels: ['test'],
          score: 0.85,
          reason: 'semantic similarity',
          boundaryExplanation: {
            requiredSatisfied: true,
            warnings: [],
            boosts: [],
          },
        }),
      ).toThrow();
    });

    it('rejects boundaryExplanation missing requiredSatisfied field', () => {
      expect(() =>
        retrievalMatchSchema.parse({
          entryId: 'entry-1',
          scope: 'global',
          requiredLevel: 5,
          shortcut: 'test-trap',
          detail: 'Test detail',
          labels: ['test'],
          score: 0.85,
          reason: 'semantic similarity',
          boundaryExplanation: {
            checked: true,
            warnings: [],
            boosts: [],
          },
        }),
      ).toThrow();
    });

    it('rejects boundaryExplanation with wrong type for warnings', () => {
      expect(() =>
        retrievalMatchSchema.parse({
          entryId: 'entry-1',
          scope: 'global',
          requiredLevel: 5,
          shortcut: 'test-trap',
          detail: 'Test detail',
          labels: ['test'],
          score: 0.85,
          reason: 'semantic similarity',
          boundaryExplanation: {
            checked: true,
            requiredSatisfied: true,
            warnings: 'not-an-array',
            boosts: [],
          },
        }),
      ).toThrow();
    });

    it('rejects boundaryExplanation with wrong type for boosts', () => {
      expect(() =>
        retrievalMatchSchema.parse({
          entryId: 'entry-1',
          scope: 'global',
          requiredLevel: 5,
          shortcut: 'test-trap',
          detail: 'Test detail',
          labels: ['test'],
          score: 0.85,
          reason: 'semantic similarity',
          boundaryExplanation: {
            checked: true,
            requiredSatisfied: true,
            warnings: [],
            boosts: 'not-an-array',
          },
        }),
      ).toThrow();
    });
  });
});
