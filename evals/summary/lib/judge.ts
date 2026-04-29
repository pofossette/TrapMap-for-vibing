/**
 * Judge module for summary evaluation.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 *
 * This module implements the judge-driven verification for summary evaluation.
 * The judge verifies claims against retrieved context and calculates groundedness
 * and coverage scores.
 *
 * Key design:
 * - Fallback judge uses rules-based substring matching
 * - OpenAI integration placeholder for future LLM-as-judge
 * - Scores are calculated deterministically for reproducibility
 */

import { extractClaims, simplifyClaim } from './claims.js';
import type {
  ClaimVerification,
  ExtractedClaim,
  JudgeProvider,
  SummaryJudgeResult,
} from './types.js';

// =============================================================================
// Judge Configuration
// =============================================================================

/**
 * Configuration for the summary judge.
 */
export interface JudgeConfig {
  /** Judge provider to use */
  provider: JudgeProvider;
  /** Model name for OpenAI provider (e.g., 'gpt-4o-mini') */
  model?: string;
  /** Temperature for LLM calls (default 0 for determinism) */
  temperature?: number;
}

// =============================================================================
// Fallback Judge Implementation
// =============================================================================

/**
 * Verify claims against context using rules-based matching.
 *
 * The fallback approach:
 * 1. Simplify each claim text
 * 2. Check if simplified claim appears in any context item
 * 3. Mark as supported if match found, unsupported otherwise
 *
 * @param params - Claims and context to verify against
 * @returns Verification results for each claim
 */
export function fallbackVerifyClaims(params: {
  claims: ExtractedClaim[];
  context: string[];
}): ClaimVerification[] {
  const { claims, context } = params;

  if (!claims || claims.length === 0) {
    return [];
  }

  // Simplify context for matching
  const simplifiedContext = context.map((c) => simplifyClaim(c));

  return claims.map((claim) => {
    const simplifiedClaim = simplifyClaim(claim.text);

    // Check if simplified claim appears in any context item
    for (let i = 0; i < simplifiedContext.length; i++) {
      const contextItem = simplifiedContext[i];
      if (contextItem && simplifiedClaim && contextItem.includes(simplifiedClaim)) {
        return {
          text: claim.text,
          supported: true,
          evidence: context[i],
        };
      }
    }

    // Also try partial matching - check if key terms from claim appear in context
    const claimTerms = simplifiedClaim.split(/\s+/).filter((t) => t.length > 3);
    if (claimTerms.length > 0) {
      for (let i = 0; i < simplifiedContext.length; i++) {
        const contextItem = simplifiedContext[i];
        if (contextItem) {
          const matchCount = claimTerms.filter((term) => contextItem.includes(term)).length;
          // If more than half the terms match, consider it supported
          if (matchCount >= Math.ceil(claimTerms.length / 2)) {
            return {
              text: claim.text,
              supported: true,
              evidence: context[i],
            };
          }
        }
      }
    }

    return {
      text: claim.text,
      supported: false,
    };
  });
}

/**
 * Check for forbidden claims in summary text.
 *
 * @param params - Summary text and forbidden claim patterns
 * @returns Array of forbidden claims that were found
 */
export function fallbackCheckForbidden(params: {
  summaryText: string;
  forbiddenClaims: string[];
}): string[] {
  const { summaryText, forbiddenClaims } = params;

  if (!forbiddenClaims || forbiddenClaims.length === 0) {
    return [];
  }

  const summaryLower = summaryText.toLowerCase();
  const found: string[] = [];

  for (const forbidden of forbiddenClaims) {
    if (summaryLower.includes(forbidden.toLowerCase())) {
      found.push(forbidden);
    }
  }

  return found;
}

/**
 * Run the complete fallback judge evaluation.
 *
 * @param params - Summary text, context, and expectations
 * @returns Complete judge result with scores
 */
export function fallbackJudge(params: {
  summaryText: string;
  context: string[];
  requiredFacts: string[];
  forbiddenClaims: string[];
}): SummaryJudgeResult {
  const { summaryText, context, requiredFacts, forbiddenClaims } = params;

  // Extract claims from summary
  const claims = extractClaims(summaryText);

  // Verify claims against context
  const claimVerifications = fallbackVerifyClaims({ claims, context });

  // Calculate groundedness score
  const supportedCount = claimVerifications.filter((c) => c.supported).length;
  const groundednessScore = claims.length > 0 ? supportedCount / claims.length : 1.0;

  // Check required facts coverage
  const summaryLower = summaryText.toLowerCase();
  const requiredFactsCovered: string[] = [];
  const requiredFactsMissing: string[] = [];

  for (const fact of requiredFacts) {
    if (summaryLower.includes(fact.toLowerCase())) {
      requiredFactsCovered.push(fact);
    } else {
      requiredFactsMissing.push(fact);
    }
  }

  const coverageScore =
    requiredFacts.length > 0 ? requiredFactsCovered.length / requiredFacts.length : 1.0;

  // Check forbidden claims
  const forbiddenClaimsFound = fallbackCheckForbidden({
    summaryText,
    forbiddenClaims,
  });

  return {
    claims: claimVerifications,
    groundednessScore,
    coverageScore,
    requiredFactsCovered,
    requiredFactsMissing,
    forbiddenClaimsFound,
    provider: 'fallback',
  };
}

// =============================================================================
// Judge Factory
// =============================================================================

/**
 * Create a judge instance based on configuration.
 *
 * Currently only fallback judge is implemented.
 * OpenAI integration is a placeholder for future implementation.
 *
 * @param config - Judge configuration
 * @returns Judge instance with evaluate method
 */
export function createJudge(config: JudgeConfig) {
  return {
    config,

    /**
     * Evaluate a summary against context.
     *
     * @param summaryText - The summary text to evaluate
     * @param context - Context items from retrieved results
     * @param expected - Expected facts and forbidden claims
     * @returns Judge result with scores
     */
    evaluate(
      summaryText: string,
      context: string[],
      expected: {
        requiredFacts: string[];
        forbiddenClaims: string[];
      },
    ): SummaryJudgeResult {
      if (config.provider === 'openai') {
        // Placeholder for OpenAI integration
        // For now, fall back to rules-based judge
        // TODO: Implement OpenAI LLM-as-judge
        return fallbackJudge({
          summaryText,
          context,
          requiredFacts: expected.requiredFacts,
          forbiddenClaims: expected.forbiddenClaims,
        });
      }

      return fallbackJudge({
        summaryText,
        context,
        requiredFacts: expected.requiredFacts,
        forbiddenClaims: expected.forbiddenClaims,
      });
    },
  };
}
