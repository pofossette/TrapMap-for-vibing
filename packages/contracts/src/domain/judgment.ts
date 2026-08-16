/**
 * Judgment-node config schemas (design D8).
 *
 * One Zod config schema per judgment capability node. Every node declares a
 * pluggable implementation mode (`rule` | `llm` | `hybrid`); node-specific
 * options default to the pre-contract behavior so default configs are
 * behavior-preserving.
 */

import { z } from 'zod';

/**
 * Implementation mode shared by all judgment nodes.
 * - `rule`: deterministic rules (default; mirrors pre-contract logic)
 * - `llm`: LLM-powered judgment
 * - `hybrid`: rule-first with LLM fallback/augmentation
 */
export const judgmentModeSchema = z.enum(['rule', 'llm', 'hybrid']);

export type JudgmentMode = z.infer<typeof judgmentModeSchema>;

/** intent-recognition node config. */
export const intentRecognitionConfigSchema = z.object({
  mode: judgmentModeSchema.default('rule'),
});

export type IntentRecognitionConfig = z.infer<typeof intentRecognitionConfigSchema>;

/** dedup-strategy node config. */
export const dedupStrategyConfigSchema = z.object({
  mode: judgmentModeSchema.default('rule'),
});

export type DedupStrategyConfig = z.infer<typeof dedupStrategyConfigSchema>;

/** conflict-trigger node config. */
export const conflictTriggerConfigSchema = z.object({
  mode: judgmentModeSchema.default('rule'),
});

export type ConflictTriggerConfig = z.infer<typeof conflictTriggerConfigSchema>;

/** artifact-derivation node config. */
export const artifactDerivationConfigSchema = z.object({
  mode: judgmentModeSchema.default('rule'),
});

export type ArtifactDerivationConfig = z.infer<typeof artifactDerivationConfigSchema>;

/** label-alignment node config (carries the pre-contract align options). */
export const labelAlignmentConfigSchema = z.object({
  mode: judgmentModeSchema.default('rule'),
  /** Maximum candidates presented to the strategy (default 5). */
  maxCandidates: z.number().int().min(1).max(8).optional(),
  /** Minimum confidence before auto-merging/creating (default 0). */
  autoMergeThreshold: z.number().min(0).max(1).optional(),
});

export type LabelAlignmentConfig = z.infer<typeof labelAlignmentConfigSchema>;

/** channel-merge node config. */
export const channelMergeConfigSchema = z.object({
  mode: judgmentModeSchema.default('rule'),
});

export type ChannelMergeConfig = z.infer<typeof channelMergeConfigSchema>;

/** All six judgment-node config schemas, keyed by node id. */
export const judgmentConfigSchemas = {
  'intent-recognition': intentRecognitionConfigSchema,
  'dedup-strategy': dedupStrategyConfigSchema,
  'conflict-trigger': conflictTriggerConfigSchema,
  'artifact-derivation': artifactDerivationConfigSchema,
  'label-alignment': labelAlignmentConfigSchema,
  'channel-merge': channelMergeConfigSchema,
} as const;

export type JudgmentNodeId = keyof typeof judgmentConfigSchemas;
