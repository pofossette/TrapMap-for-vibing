/**
 * LLM-powered label alignment.
 *
 * Given a raw label, evidence text, and a compact candidate table,
 * calls the LLM to decide whether the label maps to an existing
 * canonical label, should create a new one, or is unsure.
 *
 * The response is strictly Zod-validated — invalid outputs are retried
 * or treated as alignment failures (not silent raw-text fallbacks).
 */

import type {
  LabelAlignmentCandidate,
  LabelAlignmentDecision,
  LabelAlignmentInput,
} from '@trapmap/contracts';
import { labelAlignmentDecisionSchema } from '@trapmap/contracts';

import { invokeWithParseRetry } from '@trapmap/server/lib/ai/parse.js';
import { buildLabelAlignmentSlots_default, buildPrompt } from '@trapmap/server/lib/ai/prompts.js';
import type { ChatProvider, EmbeddingsProvider } from '@trapmap/ai-providers';

import { recallCandidates } from './candidate-recall.js';
import type { LabelRepository } from './repository.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum retry attempts for LLM alignment calls. */
const MAX_RETRIES = 2;

/** Base delay for exponential backoff (ms). */
const BACKOFF_BASE_MS = 100;

/** Default source context for alignment events. */
const DEFAULT_SOURCE_CONTEXT = 'extraction';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LabelAlignmentResult {
  /** The alignment decision */
  decision: LabelAlignmentDecision;
  /** The candidates that were presented to the LLM */
  candidates: LabelAlignmentCandidate[];
  /** Whether the LLM call succeeded (false = fallback to unsure) */
  llmSuccess: boolean;
}

export interface AlignLabelOptions {
  /** Source context for the alignment event (default: 'extraction') */
  sourceContext?: string;
  /** Maximum candidates to present (default: 5) */
  maxCandidates?: number;
  /** Minimum confidence required before auto-merging/creating (default: 0) */
  autoMergeThreshold?: number;
  /** Embeddings provider for semantic candidate recall (Phase 3) */
  embeddings?: EmbeddingsProvider;
  /** Custom event ID generator */
  generateEventId?: () => string;
}

// ---------------------------------------------------------------------------
// Core alignment function
// ---------------------------------------------------------------------------

/**
 * Align a raw label against the canonical label catalog.
 *
 * Pipeline:
 * 1. Recall top-k candidates from the catalog
 * 2. Build the alignment prompt with the candidate table
 * 3. Call the LLM with strict Zod validation
 * 4. Record the alignment event
 * 5. Return the decision
 *
 * If the LLM is unavailable or returns invalid output, the decision
 * falls back to 'unsure' (never silently hard-merges).
 */
export async function alignLabel(
  repository: LabelRepository,
  chat: ChatProvider,
  rawLabel: string,
  rawEvidence: string,
  kind?: string,
  options?: AlignLabelOptions,
): Promise<LabelAlignmentResult> {
  const sourceContext = options?.sourceContext ?? DEFAULT_SOURCE_CONTEXT;
  const maxCandidates = options?.maxCandidates ?? 5;
  const autoMergeThreshold = options?.autoMergeThreshold ?? 0;
  const embeddings = options?.embeddings;
  const generateEventId = options?.generateEventId ?? defaultEventId;

  // Step 1: Recall candidates
  const recallResult = await recallCandidates(
    repository,
    rawLabel,
    kind,
    embeddings,
    maxCandidates,
  );

  // Step 2: Build alignment input
  const alignmentInput: LabelAlignmentInput = {
    rawLabel,
    rawEvidence,
    candidates: recallResult.candidates,
  };

  // Step 3: Call LLM (or fall back to unsure)
  let decision: LabelAlignmentDecision;
  let llmSuccess = false;

  if (chat.isConfigured) {
    const llmResult = await callLlmAlignment(chat, alignmentInput);
    if (llmResult) {
      decision = llmResult;
      llmSuccess = true;
    } else {
      // LLM failed — fall back to unsure
      decision = {
        decision: 'unsure',
        confidence: 0,
        reasoning: 'LLM alignment call failed or returned invalid output',
      };
    }
  } else {
    // No chat provider — fall back to unsure
    decision = {
      decision: 'unsure',
      confidence: 0,
      reasoning: 'Chat provider not configured; cannot perform alignment',
    };
  }

  if (
    (decision.decision === 'existing' || decision.decision === 'new') &&
    decision.confidence < autoMergeThreshold
  ) {
    decision = {
      decision: 'unsure',
      confidence: decision.confidence,
      reasoning: `Confidence ${decision.confidence} below auto-merge threshold ${autoMergeThreshold}. ${decision.reasoning}`,
    };
  }

  // Step 4: Record alignment event
  const eventId = generateEventId();
  await repository.recordAlignmentEvent({
    id: eventId,
    rawLabel,
    rawEvidence,
    decision: decision.decision,
    canonicalLabelId: decision.canonicalLabelId ?? null,
    canonicalName: decision.canonicalName ?? null,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    candidateSnapshot: recallResult.candidates.map((c) => ({
      id: c.id,
      canonicalName: c.canonicalName,
      recallReason: c.recallReason,
    })),
    sourceContext,
  });

  // Step 5: If decision is 'new', create the canonical label and alias
  if (decision.decision === 'new' && decision.canonicalName) {
    const newId = `lbl_${decision.canonicalName.replace(/[^a-z0-9]/g, '_')}`;
    await repository.upsertCanonicalLabel({
      id: newId,
      kind: kind ?? 'cue', // default kind if not specified
      canonicalName: decision.canonicalName,
    });
    await repository.upsertAlias({
      alias: rawLabel,
      canonicalLabelId: newId,
      source: 'llm',
      confidence: decision.confidence,
    });

    // Update the decision with the generated ID
    decision = { ...decision, canonicalLabelId: newId };
  }

  // Step 6: If decision is 'existing', add alias mapping
  if (decision.decision === 'existing' && decision.canonicalLabelId) {
    await repository.upsertAlias({
      alias: rawLabel,
      canonicalLabelId: decision.canonicalLabelId,
      source: 'llm',
      confidence: decision.confidence,
    });
  }

  return {
    decision,
    candidates: recallResult.candidates,
    llmSuccess,
  };
}

// ---------------------------------------------------------------------------
// LLM call with validation
// ---------------------------------------------------------------------------

/**
 * Call the LLM for label alignment with strict Zod validation.
 * Returns null if the LLM call fails or returns invalid output.
 */
async function callLlmAlignment(
  chat: ChatProvider,
  input: LabelAlignmentInput,
): Promise<LabelAlignmentDecision | null> {
  const systemPrompt = buildPrompt('label-alignment', buildLabelAlignmentSlots_default());
  const userMessage = buildAlignmentUserMessage(input);
  return invokeWithParseRetry({
    invoke: () => chat.invoke(systemPrompt, userMessage),
    schema: labelAlignmentDecisionSchema,
    maxRetries: MAX_RETRIES,
    backoffMs: (attempt) => BACKOFF_BASE_MS * 2 ** (attempt * 2),
  });
}

/**
 * Build the user message for the alignment prompt.
 */
function buildAlignmentUserMessage(input: LabelAlignmentInput): string {
  const lines: string[] = [`rawLabel: ${input.rawLabel}`, `rawEvidence: ${input.rawEvidence}`];

  if (input.candidates.length === 0) {
    lines.push('candidates: [] (no existing candidates found)');
  } else {
    lines.push('candidates:');
    for (const candidate of input.candidates) {
      const def = candidate.definition ? ` — ${candidate.definition}` : '';
      const aliases =
        candidate.aliases.length > 0 ? ` (aliases: ${candidate.aliases.join(', ')})` : '';
      lines.push(
        `  - id: ${candidate.id}, canonicalName: "${candidate.canonicalName}"${def}${aliases} [${candidate.recallReason}]`,
      );
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultEventId(): string {
  return `align_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
