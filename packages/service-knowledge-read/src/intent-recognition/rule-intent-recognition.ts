/**
 * Intent-recognition judgment node — rule implementation (design D8).
 *
 * Mirrors the pre-contract routing semantics of `routingDecision` /
 * `dispatchByMode` (validating the requested mode against the engine's
 * known modes and falling back to the default strategy). LLM/hybrid
 * variants plug in behind the same port.
 */

import { InvocationError, buildUnknownModeMessage } from '@trapmap/backend-core';
import type { IntentRecognitionPort } from '@trapmap/backend-core';

/** Default strategy when the caller does not request an explicit mode. */
const DEFAULT_MODE = 'semantic';

/** Map a selected strategy mode to its route family. */
function routeFamilyOf(mode: string): string {
  switch (mode) {
    case 'graph-assisted':
      return 'graph';
    case 'hybrid':
      return 'hybrid';
    case 'semantic':
      return 'semantic';
    default:
      return mode;
  }
}

/**
 * Rule implementation of the intent-recognition port.
 *
 * - Explicit requested mode that the engine supports is honored verbatim.
 * - Absent requested mode falls back to the default (semantic) strategy.
 * - A requested mode the engine cannot run is a validation error.
 */
export function createRuleIntentRecognition(): IntentRecognitionPort {
  return {
    async recognize(input) {
      const { requestedMode, knownModes } = input;

      if (requestedMode !== undefined) {
        if (!knownModes.includes(requestedMode)) {
          throw InvocationError.validation(buildUnknownModeMessage(requestedMode, knownModes));
        }
        return {
          mode: requestedMode,
          confidence: 1,
          reason: 'explicit-requested-mode',
          trace: { routeFamily: routeFamilyOf(requestedMode) },
        };
      }

      const defaultMode = knownModes.includes(DEFAULT_MODE)
        ? DEFAULT_MODE
        : (knownModes[0] ?? DEFAULT_MODE);
      return {
        mode: defaultMode,
        confidence: 1,
        reason: 'fallback-default',
        trace: { routeFamily: routeFamilyOf(defaultMode) },
      };
    },
  };
}
