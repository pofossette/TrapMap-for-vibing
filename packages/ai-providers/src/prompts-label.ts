/**
 * Label alignment prompt slots and exported prompt builders.
 */

import { type PromptBlock, buildSystemPromptBlocks } from './ai-cache/api-integration.js';
import type { PromptSlots } from './ai-providers/types.js';
import { buildPromptWithCacheControl } from './prompt-builder.js';

// ---------------------------------------------------------------------------
// Slot definition
// ---------------------------------------------------------------------------

/**
 * Build prompt slots for label alignment task.
 * The LLM receives a raw label + evidence + compact candidate table and decides
 * whether the label maps to an existing canonical label, should create a new one,
 * or is unsure.
 */
export function buildLabelAlignmentSlots_default(): PromptSlots {
  return {
    role: 'a label alignment assistant for a knowledge graph catalog',
    task: `Given a raw label extracted from source text and a table of candidate canonical labels from the existing catalog, decide whether the raw label:

1. Maps to an EXISTING canonical label (use the candidate's id)
2. Should create a NEW canonical label (propose a canonical name)
3. Is UNSURE — the label is ambiguous, the candidates are not close enough, or you lack confidence

You must return a JSON object with this structure:
{
  "decision": "existing" | "new" | "unsure",
  "canonicalLabelId": "lbl_xxx",       // required if decision is "existing"
  "canonicalName": "proposed-name",     // required if decision is "new"
  "confidence": 0.85,                   // 0.0 to 1.0
  "reasoning": "brief explanation"
}`,
    outputInstructions: [
      'Return ONLY a JSON object — no markdown fences, no prose before or after.',
      'If decision is "existing", canonicalLabelId MUST match one of the provided candidate IDs exactly.',
      'If decision is "new", canonicalName MUST be a lowercase-hyphenated slug (e.g., "timeout-issue").',
      'confidence < 0.5 should trigger decision "unsure".',
    ],
    constraints: [
      'Do NOT merge labels that are only loosely related — require strong semantic equivalence.',
      'When in doubt, prefer "unsure" over a risky merge.',
      'The candidate table is curated and compact (max 8 entries) — do not hallucinate IDs that are not in the table.',
      'If the candidate table is empty, the only valid decisions are "new" or "unsure".',
    ],
    examples: [
      `Input:
  rawLabel: "pod-timeout"
  rawEvidence: "pod restarts after startup timeout in Kubernetes"
  candidates: [{ id: "lbl_timeout_issue", canonicalName: "timeout-issue", definition: "startup or health-check timeout", aliases: ["container-timeout", "startup-timeout"] }]

Output:
  { "decision": "existing", "canonicalLabelId": "lbl_timeout_issue", "confidence": 0.9, "reasoning": "pod-timeout is a direct synonym of timeout-issue in the Kubernetes context" }`,
      `Input:
  rawLabel: "memory-leak"
  rawEvidence: "gradual memory consumption increase over time"
  candidates: []

Output:
  { "decision": "new", "canonicalName": "memory-leak", "confidence": 0.95, "reasoning": "no existing candidate; clear standalone concept" }`,
      `Input:
  rawLabel: "slow-query"
  rawEvidence: "database queries taking too long"
  candidates: [{ id: "lbl_performance_issue", canonicalName: "performance-issue", definition: "general performance degradation" }]

Output:
  { "decision": "unsure", "confidence": 0.4, "reasoning": "slow-query is related to performance-issue but is more specific; could be a sub-type rather than an alias" }`,
    ],
    metadata: {
      taskType: 'label-alignment',
      title: 'Label Alignment',
      outputFormatHint: 'json-object',
    },
  };
}

// ---------------------------------------------------------------------------
// Exported prompt builders
// ---------------------------------------------------------------------------

/**
 * Cache-aware system prompt blocks for label alignment.
 */
// fallow-ignore-next-line unused-export
export function buildLabelAlignmentSystemPromptBlocks(): PromptBlock[] {
  const sections = buildPromptWithCacheControl(
    'label-alignment',
    buildLabelAlignmentSlots_default(),
  );
  return buildSystemPromptBlocks(sections);
}
