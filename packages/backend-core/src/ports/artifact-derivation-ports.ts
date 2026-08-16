/**
 * Artifact-derivation judgment node contract (design D8).
 *
 * Derives retrieval-grade profile/capsule/manifest outputs from skill
 * artifact file payloads. The rule implementation wraps the pre-contract
 * derivation pipeline (`deriveFromPayloads`); the contract context is the
 * AI-free core — enrichment providers are injected by richer implementations.
 */

import type {
  ArtifactFilePayloadRecord,
  ClientManifestRecord,
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
} from '@trapmap/contracts';

/** AI-free derivation context (the enrichment layer stays implementation-side). */
export interface ArtifactDerivationContext {
  artifactId: string;
  /** Provided labels, merged with frontmatter labels during derivation. */
  labels: string[];
  /** Fallback title when the SKILL.md frontmatter has none. */
  title: string;
  scope: 'global' | 'project';
  requiredLevel: number;
}

/** Input to artifact derivation. */
export interface ArtifactDerivationInput {
  /** File payloads of the skill artifact revision. */
  payloads: ArtifactFilePayloadRecord[];
  context: ArtifactDerivationContext;
}

/** Output of artifact derivation (same shape as the internal pipeline). */
export interface DerivedArtifactOutputs {
  /** Distilled profile from SKILL.md and references/ (null when no eligible text). */
  profile: DerivedSkillProfileRecord | null;
  /** Knowledge capsules distilled from SKILL.md and references/. */
  capsules: DerivedSkillCapsuleRecord[];
  /** Client activation manifest for references/assets/scripts. */
  clientManifest: ClientManifestRecord | null;
  /** Hash of all source files used for derivation. */
  sourceHash: string;
  /** ISO timestamp when derivation was computed. */
  derivedAt: string;
}

/**
 * Judgment-node contract for artifact derivation strategy.
 */
export interface ArtifactDerivationPort {
  derive(input: ArtifactDerivationInput): Promise<DerivedArtifactOutputs>;
}
