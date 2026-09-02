import { callInternalService } from './http.js';
import type { InternalServiceClients } from './interface.js';

export function createGovernanceReviewClient(
  baseUrlFor: () => Promise<string>,
): InternalServiceClients['review'] {
  return {
    detectConflicts: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/conflicts/detect`, 'POST', body),
    approve: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/approve`, 'POST', body),
    reject: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/reject`, 'POST', body),
    returnForCorrection: async (body) =>
      callInternalService(
        `${await baseUrlFor()}/internal/review/return-for-correction`,
        'POST',
        body,
      ),
    applyMaintenance: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/maintenance`, 'POST', body),
    applyDecay: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/decay`, 'POST', body),
    reviewArtifact: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/artifact`, 'POST', body),
    submitFeedback: async (body, options) =>
      callInternalService(
        `${await baseUrlFor()}/internal/feedback`,
        'POST',
        body,
        undefined,
        options,
      ),
  };
}

/**
 * Create HTTP clients for all internal services.
 *
 * When a `resolver` is provided, each call dynamically resolves the
 * target service URL via the resolver (discovery -> static fallback).
 * When omitted, static URLs are used directly (backward compatible).
 */
