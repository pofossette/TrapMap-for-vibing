import type { Boundary } from '@trapmap/contracts';
import { boundarySchema } from '@trapmap/contracts';
import { z } from 'zod';

import { stripCodeFences } from './ai/parse.js';
import {
  buildBoundaryExtractionSystemPrompt,
  buildBoundaryExtractionSystemPromptBlocks,
} from './ai/prompts.js';
import type { ChatProvider } from './ai/types.js';

/**
 * Input for boundary extraction.
 */
export interface BoundaryExtractionInput {
  shortcut: string;
  detail: string;
  labels: string[];
}

/**
 * Extract candidate boundary constraints from knowledge content using LLM.
 *
 * @param chat - Chat provider for LLM invocation
 * @param input - Knowledge content to analyze
 * @returns Extracted boundary constraints, or null if extraction failed
 */
export async function extractCandidateBoundaries(
  chat: ChatProvider,
  input: BoundaryExtractionInput,
): Promise<Boundary | null> {
  // Return null if chat provider not configured
  if (!chat.isConfigured) {
    return null;
  }

  const userMessage = `Title: ${input.shortcut}

Detail:
${input.detail}

Labels: ${input.labels.join(', ')}`;

  try {
    const response = chat.invokeWithBlocks
      ? await chat.invokeWithBlocks(buildBoundaryExtractionSystemPromptBlocks(), userMessage)
      : await chat.invoke(buildBoundaryExtractionSystemPrompt(), userMessage);

    // Parse JSON response
    const parsed = JSON.parse(response);

    // Validate with boundary schema
    const boundary = boundarySchema.parse(parsed);

    return boundary;
  } catch {
    // Return null on any failure (LLM error, parse error, validation error)
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Quality assessment types and schemas
// ---------------------------------------------------------------------------

/**
 * Evidence quality as assessed by the LLM.
 * - strong: direct evidence (issue, CVE, incident, specific reproduction)
 * - moderate: indirect evidence (documentation reference, known pattern)
 * - weak: vague or circumstantial evidence
 * - none: no evidence provided
 */
export type EvidenceQuality = 'strong' | 'moderate' | 'weak' | 'none';

const evidenceQualitySchema = z.enum(['strong', 'moderate', 'weak', 'none']);

const correctnessAssessmentSchema = z.object({
  evidenceQuality: evidenceQualitySchema,
  reasoning: z.string().max(500),
});

const completenessAssessmentSchema = z.object({
  isComplete: z.boolean(),
  missingAspects: z.array(z.string().max(200)).max(10),
});

/**
 * Extended boundary extraction result including quality assessment.
 */
export interface BoundaryWithQuality {
  boundary: Boundary;
  correctness: z.infer<typeof correctnessAssessmentSchema>;
  completeness: z.infer<typeof completenessAssessmentSchema>;
}

/**
 * Zod schema for the combined LLM response.
 *
 * Validates the full JSON output from extractCandidateBoundariesWithQuality,
 * including boundary constraints and quality assessment fields.
 */
const boundaryWithQualityLlmSchema = z.object({
  // Boundary fields (same structure as boundarySchema but validated separately)
  context: z.array(z.string().min(1).max(64)).max(10).default([]),
  versions: z
    .array(
      z.object({
        package: z.string().min(1).max(128),
        range: z.string().min(1).max(64),
        note: z.string().max(280).optional(),
      }),
    )
    .max(10)
    .default([]),
  prerequisites: z
    .array(z.object({ description: z.string().min(1).max(280) }))
    .max(10)
    .default([]),
  signals: z
    .array(z.object({ pattern: z.string().min(1).max(500), kind: z.string().optional() }))
    .max(20)
    .default([]),
  exclusions: z
    .array(z.object({ description: z.string().min(1).max(280) }))
    .max(10)
    .default([]),
  evidence: z
    .array(z.object({ kind: z.string(), identifier: z.string().min(1).max(128) }))
    .max(10)
    .default([]),
  // Quality assessment fields
  correctness: correctnessAssessmentSchema,
  completeness: completenessAssessmentSchema,
});

/**
 * Build system prompt for combined boundary extraction + quality assessment.
 *
 * Extends the boundary extraction prompt with correctness and completeness
 * assessment instructions. Designed to produce a single JSON response
 * containing both boundary constraints and quality metadata.
 */
export function buildBoundaryWithQualitySystemPrompt(): string {
  return [
    'You are a boundary extraction and quality assessment assistant.',
    '',
    'Analyze the knowledge entry and perform TWO tasks in a single response:',
    '',
    'TASK 1 — Boundary Extraction:',
    'Extract structured boundary constraints defining when knowledge is applicable:',
    '  1. context: Situational context labels (e.g., frontend, production, testing)',
    '  2. versions: Version constraints for tools or libraries',
    '  3. prerequisites: Conditions that must be true before applying',
    '  4. signals: Patterns indicating this knowledge is relevant',
    '  5. exclusions: Conditions that make this knowledge not applicable',
    '  6. evidence: Supporting references such as issues, incidents, or CVEs',
    '',
    'TASK 2 — Quality Assessment:',
    '',
    'A. Correctness assessment (evidenceQuality):',
    '   Rate the evidence quality supporting this knowledge entry:',
    '   - "strong": Direct evidence exists — specific issue numbers, CVEs, incident reports,',
    '     reproducible steps, or official documentation references.',
    '   - "moderate": Indirect evidence — known patterns, community consensus, blog posts,',
    '     or partial documentation references.',
    '   - "weak": Vague or circumstantial evidence — general statements without specifics,',
    '     personal anecdote, or unsubstantiated claims.',
    '   - "none": No evidence provided — purely opinion-based or unsupported assertion.',
    '   Provide brief reasoning (1-2 sentences) for your rating.',
    '',
    'B. Completeness assessment:',
    '   Evaluate whether the submission covers the topic adequately:',
    '   - isComplete: true if the entry covers the key aspects of the problem/solution.',
    '   - missingAspects: List specific aspects that are missing or underdeveloped.',
    '     Examples: "root cause explanation", "reproduction steps", "platform-specific notes",',
    '     "version requirements", "alternative solutions".',
    '     Return an empty array if the entry is complete.',
    '',
    'Return a single JSON object with this structure:',
    '{',
    '  "context": ["label1"],',
    '  "versions": [{"package": "name", "range": ">=1.0.0"}],',
    '  "prerequisites": [{"description": "condition"}],',
    '  "signals": [{"pattern": "pattern", "kind": "keyword"}],',
    '  "exclusions": [{"description": "exclusion"}],',
    '  "evidence": [{"kind": "issue", "identifier": "123"}],',
    '  "correctness": {',
    '    "evidenceQuality": "strong|moderate|weak|none",',
    '    "reasoning": "brief explanation"',
    '  },',
    '  "completeness": {',
    '    "isComplete": true|false,',
    '    "missingAspects": ["aspect description"]',
    '  }',
    '}',
    '',
    'Rules:',
    '- All boundary fields are optional and default to empty arrays.',
    '- Only include boundary information that is explicitly stated or clearly implied.',
    '- evidenceQuality and reasoning are REQUIRED.',
    '- isComplete and missingAspects are REQUIRED.',
    '- Respond with ONLY valid JSON (no markdown fences, no explanation).',
  ].join('\n');
}

/**
 * Parse and validate the combined boundary + quality LLM response.
 *
 * Uses stripCodeFences → JSON.parse → Zod validation pattern.
 * Returns null on any failure (parse error, validation error).
 */
export function parseBoundaryWithQualityResponse(raw: string): BoundaryWithQuality | null {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed: unknown = JSON.parse(cleaned);
    const result = boundaryWithQualityLlmSchema.safeParse(parsed);

    if (!result.success) {
      return null;
    }

    const data = result.data;

    // Construct the Boundary object from the validated fields
    const boundary = boundarySchema.parse({
      context: data.context,
      versions: data.versions,
      prerequisites: data.prerequisites,
      signals: data.signals,
      exclusions: data.exclusions,
      evidence: data.evidence,
    });

    return {
      boundary,
      correctness: data.correctness,
      completeness: data.completeness,
    };
  } catch {
    return null;
  }
}

/**
 * Extract candidate boundary constraints AND quality assessment from knowledge content.
 *
 * Single LLM call that returns boundary constraints plus correctness/completeness
 * assessment. Uses isConfigured check → invoke → stripCodeFences → JSON.parse → Zod pattern.
 *
 * Includes retry with exponential backoff (maxRetries=2, 100ms/400ms).
 *
 * @param chat - Chat provider for LLM invocation
 * @param input - Knowledge content to analyze
 * @returns Boundary with quality assessment, or null if extraction failed
 */
export async function extractCandidateBoundariesWithQuality(
  chat: ChatProvider,
  input: BoundaryExtractionInput,
  maxRetries = 2,
): Promise<BoundaryWithQuality | null> {
  if (!chat.isConfigured) {
    return null;
  }

  const userMessage = `Title: ${input.shortcut}

Detail:
${input.detail}

Labels: ${input.labels.join(', ')}`;

  const systemPrompt = buildBoundaryWithQualitySystemPrompt();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await chat.invoke(systemPrompt, userMessage);

      const result = parseBoundaryWithQualityResponse(response);
      if (result) {
        return result;
      }
      // If parsing failed, retry
    } catch {
      // On failure, retry with exponential backoff
    }

    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 100 * 2 ** (attempt * 2)));
    }
  }

  return null;
}
