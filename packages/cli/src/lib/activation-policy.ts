/**
 * Client-side activation policy resolution for script governance.
 *
 * This module implements stricter-only effective policy resolution where
 * the client computes the effective policy as the stricter of:
 * 1. Server default policy
 * 2. Local override intent (ACTV-04)
 *
 * Policy ordering (strictest to most permissive):
 * blocked > reference-only > needs-approval > client-executable
 *
 * T-15-04 mitigation: Encode a strict policy ordering and resolve the
 * stricter of server default and local override only.
 */

import type {
  ScriptActivationPolicy,
  ScriptWithPolicyMetadata,
} from '@skill-shareer/contracts';
import type { ScriptPolicyOverride } from './config.js';

/**
 * Policy strictness ordering from strictest (0) to most permissive (3).
 *
 * Lower numbers represent stricter policies:
 * - blocked (0): Cannot be used at all
 * - reference-only (1): Can be read but never executed
 * - needs-approval (2): Requires explicit user approval before execution
 * - client-executable (3): Can execute without additional approval
 */
const POLICY_STRICTNESS: Record<ScriptActivationPolicy, number> = {
  blocked: 0,
  'reference-only': 1,
  'needs-approval': 2,
  'client-executable': 3,
};

/**
 * Get the strictness level for a policy.
 *
 * @param policy - Activation policy
 * @returns Strictness level (0 = strictest, 3 = most permissive)
 */
function getPolicyStrictness(policy: ScriptActivationPolicy): number {
  return POLICY_STRICTNESS[policy];
}

/**
 * Compute the effective activation policy from server default and local override.
 *
 * The effective policy is ALWAYS the stricter (lower strictness value) of:
 * 1. Server default policy
 * 2. Local override intent (if set)
 *
 * This enforces ACTV-04: clients can only tighten policy, never relax it.
 *
 * Examples:
 * - Server: 'client-executable', Override: 'blocked' -> Effective: 'blocked'
 * - Server: 'client-executable', Override: 'reference-only' -> Effective: 'reference-only'
 * - Server: 'needs-approval', Override: 'client-executable' -> Effective: 'needs-approval'
 * - Server: 'needs-approval', Override: null -> Effective: 'needs-approval'
 *
 * @param serverDefault - Default policy from server
 * @param localOverride - Optional local override intent (null = use server default)
 * @returns Effective activation policy (always stricter or equal to server default)
 */
export function resolveEffectivePolicy(
  serverDefault: ScriptActivationPolicy,
  localOverride: ScriptActivationPolicy | null,
): ScriptActivationPolicy {
  // If no override, use server default
  if (localOverride === null) {
    return serverDefault;
  }

  // Get strictness levels
  const serverStrictness = getPolicyStrictness(serverDefault);
  const overrideStrictness = getPolicyStrictness(localOverride);

  // Return the stricter (lower strictness value) policy
  if (overrideStrictness < serverStrictness) {
    return localOverride;
  }

  return serverDefault;
}

/**
 * Compute effective policy for a script from metadata and override.
 *
 * @param metadata - Script policy metadata from server
 * @param override - Optional local override from CLI config
 * @returns Effective activation policy
 */
export function resolveScriptEffectivePolicy(
  metadata: ScriptWithPolicyMetadata,
  override: ScriptPolicyOverride | null | undefined,
): ScriptActivationPolicy {
  const localOverride = override?.overridePolicy ?? null;
  return resolveEffectivePolicy(metadata.defaultPolicy, localOverride);
}

/**
 * Check if a script can be executed based on effective policy.
 *
 * Only 'client-executable' policy allows immediate execution.
 * 'needs-approval' requires explicit user approval before execution.
 * 'reference-only' and 'blocked' never allow execution.
 *
 * @param effectivePolicy - Effective activation policy
 * @returns True if script can be executed without additional approval
 */
export function canExecuteImmediately(effectivePolicy: ScriptActivationPolicy): boolean {
  return effectivePolicy === 'client-executable';
}

/**
 * Check if a script requires user approval before execution.
 *
 * @param effectivePolicy - Effective activation policy
 * @returns True if script requires approval
 */
export function requiresApproval(effectivePolicy: ScriptActivationPolicy): boolean {
  return effectivePolicy === 'needs-approval';
}

/**
 * Check if a script is completely blocked from any use.
 *
 * @param effectivePolicy - Effective activation policy
 * @returns True if script is blocked
 */
export function isBlocked(effectivePolicy: ScriptActivationPolicy): boolean {
  return effectivePolicy === 'blocked';
}

/**
 * Check if a script is reference-only (can be read but never executed).
 *
 * @param effectivePolicy - Effective activation policy
 * @returns True if script is reference-only
 */
export function isReferenceOnly(effectivePolicy: ScriptActivationPolicy): boolean {
  return effectivePolicy === 'reference-only';
}

/**
 * Get a human-readable description of the effective policy.
 *
 * @param effectivePolicy - Effective activation policy
 * @returns Human-readable policy description
 */
export function getPolicyDescription(effectivePolicy: ScriptActivationPolicy): string {
  switch (effectivePolicy) {
    case 'blocked':
      return 'Blocked - This script is not available for any use';
    case 'reference-only':
      return 'Reference only - This script can be read but never executed';
    case 'needs-approval':
      return 'Needs approval - This script requires explicit approval before execution';
    case 'client-executable':
      return 'Executable - This script can be executed without additional approval';
  }
}

/**
 * Explain why a specific policy is the effective policy.
 *
 * Useful for UI messaging and audit trails (T-15-06 mitigation).
 *
 * @param serverDefault - Default policy from server
 * @param localOverride - Optional local override intent
 * @returns Human-readable explanation
 */
export function explainEffectivePolicy(
  serverDefault: ScriptActivationPolicy,
  localOverride: ScriptActivationPolicy | null,
): string {
  if (localOverride === null) {
    return `Using server default policy: ${getPolicyDescription(serverDefault)}`;
  }

  const effective = resolveEffectivePolicy(serverDefault, localOverride);

  if (effective === localOverride) {
    return `Local override tightened policy from "${serverDefault}" to "${localOverride}": ${getPolicyDescription(localOverride)}`;
  }

  return `Local override "${localOverride}" is looser than server default "${serverDefault}" - using server default: ${getPolicyDescription(serverDefault)}`;
}
