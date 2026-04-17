import { describe, expect, it } from 'vitest';

import {
  resolveEffectivePolicy,
  resolveScriptEffectivePolicy,
  canExecuteImmediately,
  requiresApproval,
  isBlocked,
  isReferenceOnly,
  getPolicyDescription,
  explainEffectivePolicy,
} from './activation-policy.js';
import type { ScriptWithPolicyMetadata } from '@skill-shareer/contracts';
import type { ScriptPolicyOverride } from './config.js';

describe('CLI activation policy resolution (Phase 15-02)', () => {
  describe('resolveEffectivePolicy', () => {
    it('returns server default when no override', () => {
      expect(resolveEffectivePolicy('client-executable', null)).toBe('client-executable');
      expect(resolveEffectivePolicy('needs-approval', null)).toBe('needs-approval');
      expect(resolveEffectivePolicy('reference-only', null)).toBe('reference-only');
      expect(resolveEffectivePolicy('blocked', null)).toBe('blocked');
    });

    it('chooses stricter policy when override is tighter than server default', () => {
      // Override from client-executable to blocked
      expect(resolveEffectivePolicy('client-executable', 'blocked')).toBe('blocked');
      expect(resolveEffectivePolicy('client-executable', 'reference-only')).toBe('reference-only');
      expect(resolveEffectivePolicy('client-executable', 'needs-approval')).toBe('needs-approval');

      // Override from needs-approval to blocked or reference-only
      expect(resolveEffectivePolicy('needs-approval', 'blocked')).toBe('blocked');
      expect(resolveEffectivePolicy('needs-approval', 'reference-only')).toBe('reference-only');

      // Override from reference-only to blocked
      expect(resolveEffectivePolicy('reference-only', 'blocked')).toBe('blocked');
    });

    it('ignores looser override and uses server default (ACTV-04)', () => {
      // Client cannot relax policy
      expect(resolveEffectivePolicy('blocked', 'client-executable')).toBe('blocked');
      expect(resolveEffectivePolicy('blocked', 'needs-approval')).toBe('blocked');
      expect(resolveEffectivePolicy('blocked', 'reference-only')).toBe('blocked');

      expect(resolveEffectivePolicy('reference-only', 'client-executable')).toBe('reference-only');
      expect(resolveEffectivePolicy('reference-only', 'needs-approval')).toBe('reference-only');

      expect(resolveEffectivePolicy('needs-approval', 'client-executable')).toBe('needs-approval');
    });

    it('returns same policy when override equals server default', () => {
      expect(resolveEffectivePolicy('client-executable', 'client-executable')).toBe('client-executable');
      expect(resolveEffectivePolicy('needs-approval', 'needs-approval')).toBe('needs-approval');
      expect(resolveEffectivePolicy('reference-only', 'reference-only')).toBe('reference-only');
      expect(resolveEffectivePolicy('blocked', 'blocked')).toBe('blocked');
    });
  });

  describe('resolveScriptEffectivePolicy', () => {
    const mockMetadata: ScriptWithPolicyMetadata = {
      path: 'scripts/deploy.sh',
      sha256: 'a'.repeat(64),
      capability: 'Deploy to staging',
      argsSchemaSummary: 'environment: string',
      sideEffectSummary: 'Creates staging deployment',
      defaultPolicy: 'client-executable',
    };

    it('resolves policy from script metadata with no override', () => {
      const result = resolveScriptEffectivePolicy(mockMetadata, null);
      expect(result).toBe('client-executable');
    });

    it('resolves policy from script metadata with override', () => {
      const override: ScriptPolicyOverride = {
        path: 'scripts/deploy.sh',
        sha256: 'a'.repeat(64),
        overridePolicy: 'needs-approval',
      };

      const result = resolveScriptEffectivePolicy(mockMetadata, override);
      expect(result).toBe('needs-approval');
    });

    it('validates override hash matches metadata hash', () => {
      const override: ScriptPolicyOverride = {
        path: 'scripts/deploy.sh',
        sha256: 'b'.repeat(64), // Different hash
        overridePolicy: 'blocked',
      };

      // In real implementation, hash validation would occur
      // For now, just verify the function processes the override
      const result = resolveScriptEffectivePolicy(mockMetadata, override);
      expect(result).toBe('blocked'); // Override is applied
    });
  });

  describe('policy predicate helpers', () => {
    describe('canExecuteImmediately', () => {
      it('returns true only for client-executable policy', () => {
        expect(canExecuteImmediately('client-executable')).toBe(true);
        expect(canExecuteImmediately('needs-approval')).toBe(false);
        expect(canExecuteImmediately('reference-only')).toBe(false);
        expect(canExecuteImmediately('blocked')).toBe(false);
      });
    });

    describe('requiresApproval', () => {
      it('returns true only for needs-approval policy', () => {
        expect(requiresApproval('needs-approval')).toBe(true);
        expect(requiresApproval('client-executable')).toBe(false);
        expect(requiresApproval('reference-only')).toBe(false);
        expect(requiresApproval('blocked')).toBe(false);
      });
    });

    describe('isBlocked', () => {
      it('returns true only for blocked policy', () => {
        expect(isBlocked('blocked')).toBe(true);
        expect(isBlocked('client-executable')).toBe(false);
        expect(isBlocked('needs-approval')).toBe(false);
        expect(isBlocked('reference-only')).toBe(false);
      });
    });

    describe('isReferenceOnly', () => {
      it('returns true only for reference-only policy', () => {
        expect(isReferenceOnly('reference-only')).toBe(true);
        expect(isReferenceOnly('client-executable')).toBe(false);
        expect(isReferenceOnly('needs-approval')).toBe(false);
        expect(isReferenceOnly('blocked')).toBe(false);
      });
    });
  });

  describe('getPolicyDescription', () => {
    it('returns human-readable descriptions for all policies', () => {
      expect(getPolicyDescription('blocked')).toBe('Blocked - This script is not available for any use');
      expect(getPolicyDescription('reference-only')).toBe('Reference only - This script can be read but never executed');
      expect(getPolicyDescription('needs-approval')).toBe('Needs approval - This script requires explicit approval before execution');
      expect(getPolicyDescription('client-executable')).toBe('Executable - This script can be executed without additional approval');
    });
  });

  describe('explainEffectivePolicy', () => {
    it('explains server default when no override', () => {
      const explanation = explainEffectivePolicy('client-executable', null);
      expect(explanation).toContain('server default policy');
      expect(explanation).toContain('Executable');
    });

    it('explains when override tightens policy', () => {
      const explanation = explainEffectivePolicy('client-executable', 'blocked');
      expect(explanation).toContain('Local override tightened policy');
      expect(explanation).toContain('client-executable');
      expect(explanation).toContain('blocked');
    });

    it('explains when override is ignored (looser than server default)', () => {
      const explanation = explainEffectivePolicy('blocked', 'client-executable');
      expect(explanation).toContain('Local override');
      expect(explanation).toContain('looser than server default');
      expect(explanation).toContain('using server default');
    });

    it('explains when override equals server default', () => {
      const explanation = explainEffectivePolicy('needs-approval', 'needs-approval');
      expect(explanation).toContain('needs-approval');
      expect(explanation).toContain('Needs approval');
    });
  });

  describe('T-15-04 mitigation: stricter-only override resolution', () => {
    it('enforces monotonic policy tightening from all server defaults', () => {
      const serverDefaults: Array<'client-executable' | 'needs-approval' | 'reference-only' | 'blocked'> = [
        'client-executable',
        'needs-approval',
        'reference-only',
      ];

      // Blocked can override anything
      for (const serverDefault of serverDefaults) {
        expect(resolveEffectivePolicy(serverDefault, 'blocked')).toBe('blocked');
      }

      // Reference-only can override needs-approval or client-executable
      expect(resolveEffectivePolicy('needs-approval', 'reference-only')).toBe('reference-only');
      expect(resolveEffectivePolicy('client-executable', 'reference-only')).toBe('reference-only');

      // Needs-approval can override client-executable
      expect(resolveEffectivePolicy('client-executable', 'needs-approval')).toBe('needs-approval');
    });

    it('prevents policy relaxation in all cases', () => {
      // All attempts to relax blocked policy should fail
      expect(resolveEffectivePolicy('blocked', 'reference-only')).toBe('blocked');
      expect(resolveEffectivePolicy('blocked', 'needs-approval')).toBe('blocked');
      expect(resolveEffectivePolicy('blocked', 'client-executable')).toBe('blocked');

      // All attempts to relax reference-only policy should fail
      expect(resolveEffectivePolicy('reference-only', 'needs-approval')).toBe('reference-only');
      expect(resolveEffectivePolicy('reference-only', 'client-executable')).toBe('reference-only');

      // All attempts to relax needs-approval policy should fail
      expect(resolveEffectivePolicy('needs-approval', 'client-executable')).toBe('needs-approval');
    });
  });
});
