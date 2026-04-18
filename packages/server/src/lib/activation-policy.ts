/**
 * Server-side activation policy helpers for script governance.
 *
 * This module provides pure metadata-only functions for shaping default
 * activation policies from stored script descriptors. The server never
 * executes scripts or spawns subprocesses - it only publishes policy
 * metadata for client-side resolution (ACTV-03, T-15-05).
 *
 * Policy ordering (strictest to most permissive):
 * blocked > reference-only > needs-approval > client-executable
 *
 * Clients compute the effective policy as the stricter of:
 * 1. Server default policy
 * 2. Local override intent (ACTV-04)
 */

import type { ScriptActivationPolicy, SkillScriptDescriptor } from '@trapmap/contracts';

/**
 * Map legacy three-state policy to four-state policy vocabulary.
 *
 * Legacy mapping for backward compatibility:
 * - 'manual' -> 'needs-approval' (requires explicit approval)
 * - 'auto' -> 'client-executable' (can execute without approval)
 * - 'blocked' -> 'blocked' (completely unavailable)
 *
 * This allows existing script descriptors with the old policy format
 * to be consumed by the new four-state policy model.
 *
 * @param legacyPolicy - Legacy policy value ('manual' | 'auto' | 'blocked')
 * @returns Four-state activation policy
 */
export function mapLegacyPolicyToFourState(
  legacyPolicy: 'manual' | 'auto' | 'blocked',
): ScriptActivationPolicy {
  switch (legacyPolicy) {
    case 'manual':
      return 'needs-approval';
    case 'auto':
      return 'client-executable';
    case 'blocked':
      return 'blocked';
  }
}

/**
 * Compute the default activation policy for a script descriptor.
 *
 * This is a pure metadata function that translates stored script
 * descriptors into the shared four-state policy vocabulary for
 * retrieval and activation responses.
 *
 * The function handles both legacy three-state descriptors and
 * new four-state descriptors, ensuring backward compatibility.
 *
 * @param descriptor - Script descriptor from artifact revision
 * @returns Default activation policy
 */
export function getDefaultActivationPolicy(
  descriptor: SkillScriptDescriptor,
): ScriptActivationPolicy {
  // Check if descriptor already uses four-state policy
  const fourStatePolicies: ScriptActivationPolicy[] = [
    'reference-only',
    'needs-approval',
    'client-executable',
    'blocked',
  ];

  if (fourStatePolicies.includes(descriptor.defaultPolicy as ScriptActivationPolicy)) {
    return descriptor.defaultPolicy as ScriptActivationPolicy;
  }

  // Map legacy three-state policy to four-state
  return mapLegacyPolicyToFourState(descriptor.defaultPolicy);
}

/**
 * Build script metadata with policy for activation responses.
 *
 * This function shapes server-side script descriptors into the
 * policy-aware metadata format that the client will consume for
 * effective policy resolution.
 *
 * The response is metadata-only - no script bodies are included
 * per ACTV-03 and T-15-05 mitigation.
 *
 * @param descriptor - Script descriptor from artifact revision
 * @param artifactId - Parent artifact identifier
 * @param revision - Revision number
 * @returns Policy-aware script metadata
 */
export function buildScriptPolicyMetadata(
  descriptor: SkillScriptDescriptor,
  artifactId: string,
  revision: number,
) {
  const defaultPolicy = getDefaultActivationPolicy(descriptor);

  return {
    artifactId,
    revision,
    path: descriptor.path,
    sha256: descriptor.sha256,
    capability: descriptor.capability,
    argsSchemaSummary: descriptor.argsSchemaSummary,
    sideEffectSummary: descriptor.sideEffectSummary,
    defaultPolicy,
    // Server does not set clientOverrideIntent - that's purely client-side
    clientOverrideIntent: null,
  };
}

/**
 * Compute activation hints for all scripts in a manifest.
 *
 * This is a pure function that transforms client manifest scripts
 * into policy metadata for activation responses. No script execution
 * or subprocess launch occurs (T-15-05 mitigation).
 *
 * @param scripts - Array of script descriptors from client manifest
 * @param artifactId - Parent artifact identifier
 * @param revision - Revision number
 * @returns Array of policy-aware script metadata
 */
export function buildActivationHints(
  scripts: SkillScriptDescriptor[],
  artifactId: string,
  revision: number,
) {
  return scripts.map((script) => buildScriptPolicyMetadata(script, artifactId, revision));
}
