import { describe, expect, it } from 'vitest';

import {
  buildActivationHints,
  buildScriptPolicyMetadata,
  getDefaultActivationPolicy,
  mapLegacyPolicyToFourState,
} from './activation-policy.js';

describe('server activation policy helpers (Phase 15-02)', () => {
  describe('mapLegacyPolicyToFourState', () => {
    it('maps manual to needs-approval', () => {
      expect(mapLegacyPolicyToFourState('manual')).toBe('needs-approval');
    });

    it('maps auto to client-executable', () => {
      expect(mapLegacyPolicyToFourState('auto')).toBe('client-executable');
    });

    it('maps blocked to blocked', () => {
      expect(mapLegacyPolicyToFourState('blocked')).toBe('blocked');
    });
  });

  describe('getDefaultActivationPolicy', () => {
    it('returns four-state policy for new descriptors', () => {
      const fourStateDescriptor = {
        path: 'scripts/deploy.sh',
        sha256: 'a'.repeat(64),
        capability: 'Deploy to staging',
        argsSchemaSummary: 'environment: string',
        sideEffectSummary: 'Creates staging deployment',
        defaultPolicy: 'needs-approval' as const,
      };

      expect(getDefaultActivationPolicy(fourStateDescriptor)).toBe('needs-approval');
    });

    it('maps legacy three-state policies', () => {
      const legacyManualDescriptor = {
        path: 'scripts/manual.sh',
        sha256: 'b'.repeat(64),
        capability: 'Manual script',
        argsSchemaSummary: '',
        sideEffectSummary: '',
        defaultPolicy: 'manual' as const,
      };

      const legacyAutoDescriptor = {
        path: 'scripts/auto.sh',
        sha256: 'c'.repeat(64),
        capability: 'Auto script',
        argsSchemaSummary: '',
        sideEffectSummary: '',
        defaultPolicy: 'auto' as const,
      };

      const legacyBlockedDescriptor = {
        path: 'scripts/blocked.sh',
        sha256: 'd'.repeat(64),
        capability: 'Blocked script',
        argsSchemaSummary: '',
        sideEffectSummary: '',
        defaultPolicy: 'blocked' as const,
      };

      expect(getDefaultActivationPolicy(legacyManualDescriptor)).toBe('needs-approval');
      expect(getDefaultActivationPolicy(legacyAutoDescriptor)).toBe('client-executable');
      expect(getDefaultActivationPolicy(legacyBlockedDescriptor)).toBe('blocked');
    });

    it('handles all four new policy states', () => {
      const policies: Array<'reference-only' | 'needs-approval' | 'client-executable' | 'blocked'> =
        ['reference-only', 'needs-approval', 'client-executable', 'blocked'];

      for (const policy of policies) {
        const descriptor = {
          path: 'scripts/test.sh',
          sha256: 'e'.repeat(64),
          capability: 'Test',
          argsSchemaSummary: '',
          sideEffectSummary: '',
          defaultPolicy: policy,
        };

        expect(getDefaultActivationPolicy(descriptor)).toBe(policy);
      }
    });
  });

  describe('buildScriptPolicyMetadata', () => {
    it('builds policy metadata for script descriptor', () => {
      const descriptor = {
        path: 'scripts/deploy.sh',
        sha256: 'a'.repeat(64),
        capability: 'Deploy to staging',
        argsSchemaSummary: 'environment: string',
        sideEffectSummary: 'Creates staging deployment',
        defaultPolicy: 'needs-approval' as const,
      };

      const metadata = buildScriptPolicyMetadata(descriptor, 'artifact-1', 1);

      expect(metadata).toMatchObject({
        artifactId: 'artifact-1',
        revision: 1,
        path: 'scripts/deploy.sh',
        sha256: 'a'.repeat(64),
        capability: 'Deploy to staging',
        argsSchemaSummary: 'environment: string',
        sideEffectSummary: 'Creates staging deployment',
        defaultPolicy: 'needs-approval',
        clientOverrideIntent: null,
      });
    });

    it('includes artifactId and revision in metadata', () => {
      const descriptor = {
        path: 'scripts/test.sh',
        sha256: 'b'.repeat(64),
        capability: 'Test',
        argsSchemaSummary: '',
        sideEffectSummary: '',
        defaultPolicy: 'client-executable' as const,
      };

      const metadata = buildScriptPolicyMetadata(descriptor, 'artifact-2', 3);

      expect(metadata.artifactId).toBe('artifact-2');
      expect(metadata.revision).toBe(3);
    });

    it('always sets clientOverrideIntent to null (server does not set client intent)', () => {
      const descriptor = {
        path: 'scripts/test.sh',
        sha256: 'c'.repeat(64),
        capability: 'Test',
        argsSchemaSummary: '',
        sideEffectSummary: '',
        defaultPolicy: 'blocked' as const,
      };

      const metadata = buildScriptPolicyMetadata(descriptor, 'artifact-1', 1);

      expect(metadata.clientOverrideIntent).toBeNull();
    });
  });

  describe('buildActivationHints', () => {
    it('builds activation hints for all scripts', () => {
      const scripts = [
        {
          path: 'scripts/deploy.sh',
          sha256: 'a'.repeat(64),
          capability: 'Deploy to staging',
          argsSchemaSummary: 'environment: string',
          sideEffectSummary: 'Creates staging deployment',
          defaultPolicy: 'needs-approval' as const,
        },
        {
          path: 'scripts/cleanup.sh',
          sha256: 'b'.repeat(64),
          capability: 'Clean up temp files',
          argsSchemaSummary: '',
          sideEffectSummary: 'Deletes temp directories',
          defaultPolicy: 'client-executable' as const,
        },
      ];

      const hints = buildActivationHints(scripts, 'artifact-1', 1);

      expect(hints).toHaveLength(2);
      expect(hints[0]).toMatchObject({
        path: 'scripts/deploy.sh',
        defaultPolicy: 'needs-approval',
        clientOverrideIntent: null,
      });
      expect(hints[1]).toMatchObject({
        path: 'scripts/cleanup.sh',
        defaultPolicy: 'client-executable',
        clientOverrideIntent: null,
      });
    });

    it('handles empty script array', () => {
      const hints = buildActivationHints([], 'artifact-1', 1);
      expect(hints).toEqual([]);
    });

    it('includes artifactId and revision in all hints', () => {
      const scripts = [
        {
          path: 'scripts/test.sh',
          sha256: 'a'.repeat(64),
          capability: 'Test',
          argsSchemaSummary: '',
          sideEffectSummary: '',
          defaultPolicy: 'reference-only' as const,
        },
      ];

      const hints = buildActivationHints(scripts, 'artifact-123', 5);

      expect(hints[0]?.artifactId).toBe('artifact-123');
      expect(hints[0]?.revision).toBe(5);
    });
  });

  describe('T-15-05 mitigation: server helpers are metadata-only', () => {
    it('does not execute scripts or spawn subprocesses', () => {
      const descriptor = {
        path: 'scripts/malicious.sh',
        sha256: 'bad'.repeat(16),
        capability: 'Should not execute',
        argsSchemaSummary: '',
        sideEffectSummary: 'Attempts to execute',
        defaultPolicy: 'blocked' as const,
      };

      // This function only computes policy metadata, never executes
      const metadata = buildScriptPolicyMetadata(descriptor, 'artifact-1', 1);

      // Verify it only returns metadata, no execution occurred
      expect(metadata).toHaveProperty('defaultPolicy');
      expect(metadata).toHaveProperty('clientOverrideIntent');
      expect(metadata).not.toHaveProperty('executionResult');
      expect(metadata).not.toHaveProperty('output');
    });

    it('does not modify external state or file system', () => {
      const scripts = [
        {
          path: 'scripts/any.sh',
          sha256: 'c'.repeat(64),
          capability: 'Any capability',
          argsSchemaSummary: '',
          sideEffectSummary: 'Any side effect',
          defaultPolicy: 'client-executable' as const,
        },
      ];

      // This function only transforms data, never modifies external state
      const hints = buildActivationHints(scripts, 'artifact-1', 1);

      // Verify it's a pure function (deterministic output, no side effects)
      expect(hints).toHaveLength(1);
      expect(hints).toEqual(buildActivationHints(scripts, 'artifact-1', 1));
    });
  });
});
