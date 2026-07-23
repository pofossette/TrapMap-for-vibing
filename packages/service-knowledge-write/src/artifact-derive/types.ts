/**
 * Shared types for the derivation module.
 */

import type { ChatProvider } from '@trapmap/ai-providers';
import type { ContextualEnrichmentCache } from './contextual-enrichment.js';
import type {
  ClientManifestRecord,
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
} from '@trapmap/service-knowledge-read/store.js';

/**
 * Result of deriving outputs from a skill artifact revision.
 */
export interface DerivedArtifactOutputs {
  /** Distilled profile from SKILL.md and references/ */
  profile: DerivedSkillProfileRecord | null;
  /** Knowledge capsules distilled from SKILL.md and references/ */
  capsules: DerivedSkillCapsuleRecord[];
  /** Client activation manifest for references, assets, and scripts */
  clientManifest: ClientManifestRecord | null;
  /** Hash of all source files used for derivation (SKILL.md + references/) */
  sourceHash: string;
  /** ISO timestamp when derivation was computed */
  derivedAt: string;
}

/**
 * Context for derivation from file payloads.
 */
export interface PayloadDerivationContext {
  artifactId: string;
  labels: string[];
  title: string;
  scope: 'global' | 'project';
  requiredLevel: number;
  /** Optional AI provider for contextual enrichment (Phase B) */
  chat?: ChatProvider | undefined;
  /** Optional cache for contextual enrichment results */
  enrichmentCache?: ContextualEnrichmentCache | undefined;
  /** Explicit kill-switch for enrichment (D-4). Defaults to true when chat is provided. */
  enrichmentEnabled?: boolean | undefined;
}
