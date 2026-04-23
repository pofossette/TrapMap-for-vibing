import { describe, expect, it } from 'vitest';

import { selectRetrievalStrategy, selectRetrievalStrategyV2 } from './orchestrator.js';

describe('selectRetrievalStrategy (v1)', () => {
  describe('explicit mode mapping', () => {
    it('maps semantic to local strategy with correct channels', () => {
      const decision = selectRetrievalStrategy('semantic', 'test query');

      expect(decision.selectedMode).toBe('local');
      expect(decision.routeFamily).toBe('entry');
      expect(decision.routingReason).toBe('explicit-mode');
      expect(decision.fallbackApplied).toBe(false);
      expect(decision.channelsPlanned).toEqual(['semantic']);
      expect(decision.channelsUsed).toEqual([]);
    });

    it('maps hybrid to hybrid strategy with semantic+keyword channels', () => {
      const decision = selectRetrievalStrategy('hybrid', 'test query');

      expect(decision.selectedMode).toBe('hybrid');
      expect(decision.routeFamily).toBe('entry');
      expect(decision.routingReason).toBe('explicit-mode');
      expect(decision.channelsPlanned).toEqual(['semantic', 'keyword']);
    });

    it('maps graph-assisted to mix strategy with all entry channels', () => {
      const decision = selectRetrievalStrategy('graph-assisted', 'test query');

      expect(decision.selectedMode).toBe('mix');
      expect(decision.routeFamily).toBe('entry');
      expect(decision.routingReason).toBe('explicit-mode');
      expect(decision.channelsPlanned).toEqual(['semantic', 'keyword', 'graph']);
    });
  });

  describe('fallback behavior', () => {
    it('falls back to local for unknown mode', () => {
      const decision = selectRetrievalStrategy('unknown-mode', 'test query');

      expect(decision.selectedMode).toBe('local');
      expect(decision.fallbackApplied).toBe(true);
      expect(decision.channelsPlanned).toEqual(['semantic']);
    });
  });

  describe('deterministic routing metadata', () => {
    it('produces identical output for identical input', () => {
      const d1 = selectRetrievalStrategy('hybrid', 'docker container networking');
      const d2 = selectRetrievalStrategy('hybrid', 'docker container networking');

      expect(d1).toEqual(d2);
    });

    it('always includes routingReason in decision', () => {
      const modes = ['semantic', 'hybrid', 'graph-assisted'] as const;
      for (const mode of modes) {
        const decision = selectRetrievalStrategy(mode, 'test');
        expect(decision.routingReason).toBe('explicit-mode');
        expect(decision.routingReason).toBeTruthy();
      }
    });

    it('always sets routeFamily to entry', () => {
      const modes = ['semantic', 'hybrid', 'graph-assisted'] as const;
      for (const mode of modes) {
        const decision = selectRetrievalStrategy(mode, 'test');
        expect(decision.routeFamily).toBe('entry');
      }
    });

    it('initializes channelsUsed as empty (populated after recall)', () => {
      const decision = selectRetrievalStrategy('hybrid', 'test');
      expect(decision.channelsUsed).toEqual([]);
    });
  });
});

describe('selectRetrievalStrategyV2', () => {
  describe('default capsule strategy', () => {
    it('selects local strategy with capsule route family', () => {
      const decision = selectRetrievalStrategyV2('test query');

      expect(decision.selectedMode).toBe('local');
      expect(decision.routeFamily).toBe('capsule');
      expect(decision.routingReason).toBe('v2-default-capsule');
      expect(decision.fallbackApplied).toBe(false);
      expect(decision.channelsPlanned).toEqual(['capsule', 'profile']);
      expect(decision.channelsUsed).toEqual([]);
    });
  });

  describe('deterministic routing metadata', () => {
    it('produces identical output for identical seed', () => {
      const d1 = selectRetrievalStrategyV2('docker container networking');
      const d2 = selectRetrievalStrategyV2('docker container networking');

      expect(d1).toEqual(d2);
    });

    it('always sets routeFamily to capsule', () => {
      const seeds = ['test', 'another query', 'error: something failed'];
      for (const seed of seeds) {
        const decision = selectRetrievalStrategyV2(seed);
        expect(decision.routeFamily).toBe('capsule');
      }
    });

    it('always includes routingReason in decision', () => {
      const decision = selectRetrievalStrategyV2('any seed');
      expect(decision.routingReason).toBe('v2-default-capsule');
      expect(decision.routingReason).toBeTruthy();
    });
  });
});
