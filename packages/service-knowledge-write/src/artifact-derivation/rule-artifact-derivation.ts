/**
 * Artifact-derivation judgment node rule implementation (design D8).
 *
 * The rule strategy wraps the pre-contract derivation pipeline
 * (`deriveFromPayloads`) with no behavior change: the contract context
 * is the AI-free core (arity of artifactId/labels/title/scope/requiredLevel),
 * and enrichment providers stay implementation-side.
 */

import type {
  ArtifactDerivationInput,
  ArtifactDerivationPort,
  DerivedArtifactOutputs,
} from '@trapmap/backend-core';

import { deriveFromPayloads } from '../artifact-derive-from-payloads.js';

/**
 * Create the artifact-derivation rule port.
 *
 * Derives retrieval-grade profile/capsule/manifest outputs from the
 * artifact revision's file payloads using the current derivation logic.
 */
export function createRuleArtifactDerivation(): ArtifactDerivationPort {
  return {
    async derive(input: ArtifactDerivationInput): Promise<DerivedArtifactOutputs> {
      return deriveFromPayloads(input.payloads, {
        artifactId: input.context.artifactId,
        labels: input.context.labels,
        title: input.context.title,
        scope: input.context.scope,
        requiredLevel: input.context.requiredLevel,
      });
    },
  };
}
