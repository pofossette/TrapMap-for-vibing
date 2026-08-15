/**
 * Judge module for summary evaluation.
 *
 * Phase 27-02: SEVAL-01, SEVAL-02
 * Updated: Phase 3 - Provider interface for LLM-as-judge
 *
 * This module implements the judge-driven verification for summary evaluation.
 * The judge verifies claims against retrieved context and calculates groundedness
 * and coverage scores.
 *
 * Key design:
 * - Fallback judge uses rules-based substring matching
 * - OpenAI-compatible provider interface for LLM-as-judge
 * - Scores are calculated deterministically for reproducibility
 */

import { buildClaimVerificationSystemPrompt } from '@trapmap/ai-providers/prompts.js';
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
  /** Base URL for OpenAI-compatible API (optional) */
  baseUrl?: string;
  /** API key for OpenAI-compatible API (optional, falls back to OPENAI_API_KEY) */
  apiKey?: string;
}

// =============================================================================
// LLM Judge Provider Interface
// =============================================================================

/**
 * Interface for LLM judge providers.
 * Allows swapping between OpenAI, Azure, local models, etc.
 */
export interface LlmJudgeProvider {
  /** Provider name for logging */
  readonly name: string;

  /**
   * Verify claims against context using LLM.
   * @param params - Claims and context to verify
   * @returns Verification results
   */
  verifyClaims(params: {
    claims: ExtractedClaim[];
    context: string[];
  }): Promise<ClaimVerification[]>;

  /**
   * Check for forbidden claims in summary.
   * @param params - Summary text and forbidden patterns
   * @returns Found forbidden claims
   */
  checkForbidden(params: {
    summaryText: string;
    forbiddenClaims: string[];
  }): Promise<string[]>;
}

/**
 * Create an OpenAI-compatible LLM judge provider.
 */
export function createOpenAiJudgeProvider(config: {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  temperature?: number;
}): LlmJudgeProvider {
  const model = config.model ?? process.env.AI_CHAT_MODEL ?? 'gpt-4o-mini';
  const baseUrl = config.baseUrl ?? process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
  const apiKey = config.apiKey ?? process.env.AI_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  const temperature = config.temperature ?? 0;

  return {
    name: 'openai',

    async verifyClaims(params: {
      claims: ExtractedClaim[];
      context: string[];
    }): Promise<ClaimVerification[]> {
      const { claims, context } = params;

      if (!claims || claims.length === 0) {
        return [];
      }

      // If no API key, fall back to rules-based
      if (!apiKey) {
        return fallbackVerifyClaims({ claims, context });
      }

      const systemPrompt = buildClaimVerificationSystemPrompt({ strict: true });

      const userMessage = `Context:
${context.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}

Claims to verify:
${claims.map((c, i) => `${i + 1}. ${c.text}`).join('\n')}

For each claim, respond in JSON format:
{"verifications": [{"claimIndex": 0, "supported": true/false, "evidence": "quote from context or null"}]}`;

      try {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            response_format: { type: 'json_object' },
          }),
        });

        if (!response.ok) {
          console.warn(`OpenAI API error: ${response.status}, falling back to rules-based`);
          return fallbackVerifyClaims({ claims, context });
        }

        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>;
        };
        const content = data.choices[0]?.message.content;

        if (!content) {
          return fallbackVerifyClaims({ claims, context });
        }

        const parsed = JSON.parse(content) as {
          verifications?: Array<{
            claimIndex: number;
            supported: boolean;
            evidence?: string;
          }>;
        };

        if (!parsed.verifications || !Array.isArray(parsed.verifications)) {
          return fallbackVerifyClaims({ claims, context });
        }

        return claims.map((claim, index) => {
          const verification = parsed.verifications?.find((v) => v.claimIndex === index);
          if (verification) {
            const result: ClaimVerification = {
              text: claim.text,
              supported: verification.supported,
            };
            if (verification.evidence) {
              result.evidence = verification.evidence;
            }
            return result;
          }
          // Fall back for missing verifications
          return {
            text: claim.text,
            supported: false,
          };
        });
      } catch (error) {
        console.warn(`OpenAI judge error: ${error}, falling back to rules-based`);
        return fallbackVerifyClaims({ claims, context });
      }
    },

    async checkForbidden(params: {
      summaryText: string;
      forbiddenClaims: string[];
    }): Promise<string[]> {
      // Use deterministic fallback for forbidden claim checking
      // This is more reliable than LLM for exact pattern matching
      return fallbackCheckForbidden(params);
    },
  };
}

/**
 * Create a fallback (rules-based) judge provider.
 */
export function createFallbackJudgeProvider(): LlmJudgeProvider {
  return {
    name: 'fallback',

    async verifyClaims(params: {
      claims: ExtractedClaim[];
      context: string[];
    }): Promise<ClaimVerification[]> {
      return fallbackVerifyClaims(params);
    },

    async checkForbidden(params: {
      summaryText: string;
      forbiddenClaims: string[];
    }): Promise<string[]> {
      return fallbackCheckForbidden(params);
    },
  };
}

/**
 * Create an LLM judge provider based on configuration.
 */
export function createLlmJudgeProvider(config: JudgeConfig): LlmJudgeProvider {
  if (config.provider === 'openai') {
    const providerConfig: {
      model?: string;
      baseUrl?: string;
      apiKey?: string;
      temperature?: number;
    } = {};
    if (config.model !== undefined) providerConfig.model = config.model;
    if (config.baseUrl !== undefined) providerConfig.baseUrl = config.baseUrl;
    if (config.apiKey !== undefined) providerConfig.apiKey = config.apiKey;
    if (config.temperature !== undefined) providerConfig.temperature = config.temperature;
    return createOpenAiJudgeProvider(providerConfig);
  }
  return createFallbackJudgeProvider();
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
      const originalContext = context[i];
      if (
        contextItem &&
        simplifiedClaim &&
        contextItem.includes(simplifiedClaim) &&
        originalContext
      ) {
        const result: ClaimVerification = {
          text: claim.text,
          supported: true,
          evidence: originalContext,
        };
        return result;
      }
    }

    // Also try partial matching - check if key terms from claim appear in context
    const claimTerms = simplifiedClaim.split(/\s+/).filter((t) => t.length > 3);
    if (claimTerms.length > 0) {
      for (let i = 0; i < simplifiedContext.length; i++) {
        const contextItem = simplifiedContext[i];
        const originalContext = context[i];
        if (contextItem && originalContext) {
          const matchCount = claimTerms.filter((term) => contextItem.includes(term)).length;
          // If more than half the terms match, consider it supported
          if (matchCount >= Math.ceil(claimTerms.length / 2)) {
            const result: ClaimVerification = {
              text: claim.text,
              supported: true,
              evidence: originalContext,
            };
            return result;
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
 * Supports:
 * - 'fallback': Rules-based judge (always available, deterministic)
 * - 'openai': OpenAI/compatible LLM judge (requires API key)
 *
 * @param config - Judge configuration
 * @returns Judge instance with evaluate method
 */
export function createJudge(config: JudgeConfig) {
  const llmProvider = createLlmJudgeProvider(config);

  return {
    config,
    llmProvider,

    /**
     * Evaluate a summary against context.
     *
     * @param summaryText - The summary text to evaluate
     * @param context - Context items from retrieved results
     * @param expected - Expected facts and forbidden claims
     * @returns Judge result with scores
     */
    async evaluate(
      summaryText: string,
      context: string[],
      expected: {
        requiredFacts: string[];
        forbiddenClaims: string[];
      },
    ): Promise<SummaryJudgeResult> {
      // Extract claims from summary
      const claims = extractClaims(summaryText);

      // Verify claims using LLM provider
      const claimVerifications = await llmProvider.verifyClaims({ claims, context });

      // Calculate groundedness score
      const supportedCount = claimVerifications.filter((c) => c.supported).length;
      const groundednessScore = claims.length > 0 ? supportedCount / claims.length : 1.0;

      // Check required facts coverage (always use deterministic check)
      const summaryLower = summaryText.toLowerCase();
      const requiredFactsCovered: string[] = [];
      const requiredFactsMissing: string[] = [];

      for (const fact of expected.requiredFacts) {
        if (summaryLower.includes(fact.toLowerCase())) {
          requiredFactsCovered.push(fact);
        } else {
          requiredFactsMissing.push(fact);
        }
      }

      const coverageScore =
        expected.requiredFacts.length > 0
          ? requiredFactsCovered.length / expected.requiredFacts.length
          : 1.0;

      // Check forbidden claims using LLM provider
      const forbiddenClaimsFound = await llmProvider.checkForbidden({
        summaryText,
        forbiddenClaims: expected.forbiddenClaims,
      });

      return {
        claims: claimVerifications,
        groundednessScore,
        coverageScore,
        requiredFactsCovered,
        requiredFactsMissing,
        forbiddenClaimsFound,
        provider: config.provider,
      };
    },
  };
}
