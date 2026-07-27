import { Document } from '@langchain/core/documents';
import { RunnableLambda } from '@langchain/core/runnables';
import {
  type AgentReviewResult,
  type Boundary,
  type KnowledgeSubmission,
  agentReviewResultSchema,
} from '@trapmap/contracts';

import type { ChatProvider } from '@trapmap/ai-providers';
import {
  type EvidenceQuality,
  extractCandidateBoundaries,
  extractCandidateBoundariesWithQuality,
} from './boundary-extract.js';
import { type KnowledgeRecord, nowIso } from './store.js';

interface PreReviewInput {
  existingEntries: KnowledgeRecord[];
  submission: Pick<KnowledgeSubmission, 'detail' | 'labels' | 'scope' | 'shortcut'>;
  chatProvider?: ChatProvider;
  authorBoundary?: Boundary | null;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }

  return shared / new Set([...a, ...b]).size;
}

function toRisk(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.72) {
    return 'high';
  }

  if (score >= 0.38) {
    return 'medium';
  }

  return 'low';
}

function completenessRisk(input: PreReviewInput['submission']): 'low' | 'medium' | 'high' {
  const detailLength = input.detail.trim().length;

  if (detailLength < 80 || input.labels.length < 1) {
    return 'high';
  }

  if (detailLength < 160 || input.labels.length < 2) {
    return 'medium';
  }

  return 'low';
}

function correctnessRisk(input: PreReviewInput['submission']): 'low' | 'medium' | 'high' {
  const detail = input.detail.toLowerCase();
  const evidenceTerms = ['because', 'fix', 'root cause', 'verify', 'caused by', 'solution'];
  const found = evidenceTerms.filter((term) => detail.includes(term)).length;

  if (found >= 3) {
    return 'low';
  }

  if (found >= 1) {
    return 'medium';
  }

  return 'high';
}

// ---------------------------------------------------------------------------
// Phase 3: LLM quality-based risk assessment
// ---------------------------------------------------------------------------

/**
 * Map LLM evidence quality rating to a numeric risk score.
 *
 * - strong  → 0.1 (low risk — well-supported)
 * - moderate → 0.3 (low-medium — indirectly supported)
 * - weak    → 0.7 (medium-high — poorly supported)
 * - none    → 0.9 (high risk — no evidence)
 */
function evidenceQualityToRisk(quality: EvidenceQuality): number {
  switch (quality) {
    case 'strong':
      return 0.1;
    case 'moderate':
      return 0.3;
    case 'weak':
      return 0.7;
    case 'none':
      return 0.9;
  }
}

/**
 * Convert a numeric risk score (0-1) to a risk level label.
 * Uses the same thresholds as the existing toRisk function.
 */
function numericRiskToLevel(score: number): 'low' | 'medium' | 'high' {
  if (score >= 0.72) return 'high';
  if (score >= 0.38) return 'medium';
  return 'low';
}

/**
 * Derive correctness risk from LLM quality assessment.
 *
 * Uses the evidenceQuality rating from the LLM response instead of
 * keyword-based evidenceTerms counting.
 */
function correctnessRiskFromQuality(quality: EvidenceQuality): 'low' | 'medium' | 'high' {
  return numericRiskToLevel(evidenceQualityToRisk(quality));
}

/**
 * Derive completeness risk from LLM quality assessment.
 *
 * Uses isComplete and missingAspects length instead of detail length thresholds.
 * - isComplete=false and missingAspects.length >= 3 → high (0.8)
 * - isComplete=false and missingAspects.length 1-2 → medium (0.5)
 * - isComplete=false and missingAspects.length 0   → low (0.2)
 * - isComplete=true → low (0.1)
 */
function completenessRiskFromQuality(
  isComplete: boolean,
  missingAspectsLength: number,
): 'low' | 'medium' | 'high' {
  if (isComplete) return 'low';

  if (missingAspectsLength >= 3) return 'high';
  if (missingAspectsLength >= 1) return 'medium';
  return 'low';
}

const preReviewChain = RunnableLambda.from(
  async (input: PreReviewInput): Promise<AgentReviewResult> => {
    const submissionDocument = new Document({
      pageContent: `${input.submission.shortcut}\n${input.submission.detail}`,
      metadata: {
        labels: input.submission.labels,
        scope: input.submission.scope,
      },
    });

    const submissionTokens = tokenize(submissionDocument.pageContent);
    let duplicateScore = 0;

    for (const entry of input.existingEntries) {
      const candidate = new Document({
        pageContent: `${entry.shortcut}\n${entry.detail}`,
        metadata: {
          scope: entry.scope,
          teamId: entry.teamId,
        },
      });

      duplicateScore = Math.max(
        duplicateScore,
        overlapScore(submissionTokens, tokenize(candidate.pageContent)),
      );
    }

    const duplicateRisk = toRisk(duplicateScore);
    const notes: string[] = [];

    if (duplicateRisk !== 'low') {
      notes.push(`Potential duplicate overlap score: ${duplicateScore.toFixed(2)}`);
    }

    // Extract candidate boundaries via LLM if available and no author boundary provided
    let extractedBoundary: Boundary | null = input.authorBoundary ?? null;
    let completeness: 'low' | 'medium' | 'high';
    let correctness: 'low' | 'medium' | 'high';

    if (input.chatProvider?.isConfigured && input.authorBoundary === undefined) {
      // Phase 3: Use quality-aware extraction when LLM is available
      const qualityResult = await extractCandidateBoundariesWithQuality(input.chatProvider, {
        shortcut: input.submission.shortcut,
        detail: input.submission.detail,
        labels: input.submission.labels,
      });

      if (qualityResult) {
        extractedBoundary = qualityResult.boundary;
        // Use LLM quality assessment for risk calculation
        correctness = correctnessRiskFromQuality(qualityResult.correctness.evidenceQuality);
        completeness = completenessRiskFromQuality(
          qualityResult.completeness.isComplete,
          qualityResult.completeness.missingAspects.length,
        );

        notes.push('Agent extracted candidate boundary constraints with quality assessment.');
        if (
          qualityResult.correctness.evidenceQuality === 'weak' ||
          qualityResult.correctness.evidenceQuality === 'none'
        ) {
          notes.push(
            `Evidence quality: ${qualityResult.correctness.evidenceQuality}. ${qualityResult.correctness.reasoning}`,
          );
        }
        if (
          !qualityResult.completeness.isComplete &&
          qualityResult.completeness.missingAspects.length > 0
        ) {
          notes.push(`Missing aspects: ${qualityResult.completeness.missingAspects.join(', ')}`);
        }
      } else {
        // Fallback: quality-aware extraction failed, try legacy boundary extraction
        const candidates = await extractCandidateBoundaries(input.chatProvider, {
          shortcut: input.submission.shortcut,
          detail: input.submission.detail,
          labels: input.submission.labels,
        });

        if (candidates) {
          extractedBoundary = candidates;
          notes.push('Agent extracted candidate boundary constraints (legacy mode).');
        } else {
          notes.push('Boundary extraction skipped (LLM unavailable).');
        }

        // Fall back to keyword-based risk assessment
        completeness = completenessRisk(input.submission);
        correctness = correctnessRisk(input.submission);
      }
    } else {
      // No LLM available or author boundary provided: use keyword-based heuristics
      completeness = completenessRisk(input.submission);
      correctness = correctnessRisk(input.submission);

      if (completeness !== 'low') {
        notes.push('Submission detail or labels look incomplete for later reuse.');
      }
      if (correctness !== 'low') {
        notes.push('Submission lacks strong fix/explanation evidence markers.');
      }
    }

    return agentReviewResultSchema.parse({
      status: duplicateRisk === 'high' || completeness === 'high' ? 'agent-rejected' : 'agent-pass',
      duplicateRisk,
      correctnessRisk: correctness,
      completenessRisk: completeness,
      checkedAt: nowIso(),
      notes,
      boundary: extractedBoundary,
    });
  },
);

export async function runPreReview(input: PreReviewInput): Promise<AgentReviewResult> {
  return preReviewChain.invoke(input);
}
