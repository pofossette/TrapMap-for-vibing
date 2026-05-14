/**
 * Pure intent parsing helpers for seed-based retrieval (RETR-02).
 * Server-internal module - NOT exported through contracts.
 *
 * This module provides deterministic, heuristic-based intent parsing that runs
 * without external model dependencies (no OPENAI_API_KEY required).
 * Any future model assistance should stay optional behind the same ParsedIntent interface.
 */

import type { NormalizedToken, ParsedIntent, StackPathHint } from '../types.js';

/**
 * Technology stacks recognized for hint extraction.
 * Lowercase for case-insensitive matching.
 */
const RECOGNIZED_STACKS = new Set([
  // Languages
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'kotlin',
  'ruby',
  'php',
  'csharp',
  'cpp',
  // Runtimes & Frameworks
  'nodejs',
  'node',
  'deno',
  'react',
  'vue',
  'angular',
  'express',
  'fastify',
  'nestjs',
  'nextjs',
  'svelte',
  // Infrastructure
  'docker',
  'kubernetes',
  'k8s',
  'terraform',
  'ansible',
  'nginx',
  'aws',
  'gcp',
  'azure',
  // Databases
  'postgres',
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
  'sqlite',
  'elasticsearch',
  // Build tools
  'npm',
  'yarn',
  'pnpm',
  'webpack',
  'vite',
  'esbuild',
  'rollup',
  'babel',
  // Testing
  'vitest',
  'jest',
  'mocha',
  'cypress',
  'playwright',
]);

/**
 * Error patterns to detect error-like seeds.
 * Matches common error message prefixes.
 */
const ERROR_PATTERNS = [
  /^error:\s*/i,
  /^typeerror:\s*/i,
  /^syntaxerror:\s*/i,
  /^referenceerror:\s*/i,
  /^rangeerror:\s*/i,
  /^fatal:\s*/i,
  /^enoent:/i,
  /^ep erm:/i,
  /^econnrefused/i,
  /^etimedout/i,
  /^connection refused/i,
  /^permission denied/i,
  /^cannot read property/i,
  /^undefined is not/i,
  /^unexpected token/i,
  /^unhandled promise/i,
];

/**
 * Path-like pattern for extracting file paths.
 * Matches strings that look like file paths with extensions.
 */
const PATH_PATTERN = /[\w/-]+\.[\w]+/g;

/**
 * Normalize a single token from the seed.
 *
 * @param token - The raw token text
 * @returns Normalized token with metadata
 */
export function normalizeToken(token: string): NormalizedToken {
  const normalized = token.toLowerCase();
  const isTechnical = RECOGNIZED_STACKS.has(normalized) || PATH_PATTERN.test(normalized);

  return {
    token: normalized,
    original: token,
    isTechnical,
  };
}

/**
 * Extract stack and path hints from normalized text.
 *
 * @param text - Normalized text to analyze
 * @returns Array of stack/path hints with confidence scores
 */
export function extractStackPathHints(text: string): StackPathHint[] {
  const hints: StackPathHint[] = [];
  // Split by whitespace and strip punctuation from tokens
  const tokens = text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[?.,!;:'"()]/g, ''));

  // Extract stack hints
  for (const token of tokens) {
    if (RECOGNIZED_STACKS.has(token)) {
      hints.push({
        hint: token,
        kind: 'stack',
        confidence: 0.9,
      });
    }
  }

  // Extract path hints
  const pathMatches = text.match(PATH_PATTERN);
  if (pathMatches) {
    for (const path of pathMatches) {
      // Skip if already added as a stack
      if (!hints.some((h) => h.hint === path)) {
        hints.push({
          hint: path,
          kind: 'path',
          confidence: 0.8,
        });
      }
    }
  }

  return hints;
}

/**
 * Detect if the seed contains an error message.
 *
 * @param seed - The seed text to analyze
 * @returns Extracted error text or null
 */
function detectError(seed: string): string | null {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(seed)) {
      // Extract the error portion (first sentence or up to 500 chars)
      const match = seed.match(pattern);
      if (match) {
        const startIndex = match.index ?? 0;
        const remaining = seed.slice(startIndex);
        const firstSentence = remaining.split(/[.!?\n]/)[0] ?? remaining;
        return firstSentence.slice(0, 500);
      }
    }
  }
  return null;
}

/**
 * Extract situation context from seed.
 * Looks for action-oriented phrases like "when deploying", "while running", etc.
 *
 * @param seed - The seed text
 * @param tokens - Normalized tokens
 * @returns Extracted situation or null
 */
function extractSituation(seed: string, _tokens: NormalizedToken[]): string | null {
  const situationPatterns = [
    /when\s+(\w+ing\s+.+?)(?:,|\.|\?|$)/i,
    /while\s+(\w+ing\s+.+?)(?:,|\.|\?|$)/i,
    /during\s+(\w+ing\s+.+?)(?:,|\.|\?|$)/i,
    /after\s+(\w+ing\s+.+?)(?:,|\.|\?|$)/i,
    /before\s+(\w+ing\s+.+?)(?:,|\.|\?|$)/i,
  ];

  for (const pattern of situationPatterns) {
    const match = seed.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Extract problem statement from seed.
 * Looks for complaint-style phrases.
 *
 * @param seed - The seed text
 * @param tokens - Normalized tokens
 * @returns Extracted problem or null
 */
function extractProblem(seed: string, _tokens: NormalizedToken[]): string | null {
  const problemPatterns = [
    /(?:my|the)\s+(.+?)\s+(?:fails?|crashes?|errors?|broken|not working|doesn'?t work)/i,
    /(.+?)\s+(?:fails?|crashes?|errors?|broken)/i,
    /problem\s+(?:is|with)\s+(.+?)(?:\.|,|$)/i,
    /issue\s+(?:is|with)\s+(.+?)(?:\.|,|$)/i,
  ];

  for (const pattern of problemPatterns) {
    const match = seed.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  // If we detected an error, use that as the problem
  const error = detectError(seed);
  if (error) {
    return error;
  }

  return null;
}

/**
 * Extract goal/intent from seed.
 * Looks for question-style or intent phrases.
 *
 * @param seed - The seed text
 * @param tokens - Normalized tokens
 * @returns Extracted goal or null
 */
function extractGoal(seed: string, _tokens: NormalizedToken[]): string | null {
  const goalPatterns = [
    /how\s+(?:do\s+i|can\s+i|to)\s+(.+?)(?:\?|\.|$)/i,
    /(?:i\s+want|i\s+need|i'd\s+like)\s+(?:to\s+)?(.+?)(?:\.|,|$)/i,
    /(?:trying|attempting)\s+(?:to\s+)?(.+?)(?:\.|,|but|$)/i,
    /configure\s+(.+?)(?:\?|\.|$)/i,
    /set\s+up\s+(.+?)(?:\?|\.|$)/i,
  ];

  for (const pattern of goalPatterns) {
    const match = seed.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Parse a natural-language seed into structured intent fields (RETR-02).
 * This is a deterministic, heuristic-based parser that runs without external dependencies.
 *
 * The ParsedIntent result is server-internal and NOT part of the client contract.
 * This ensures RETR-01 compliance - clients only send seed, server handles decomposition.
 *
 * @param seed - The natural-language seed string
 * @returns Parsed intent with situation, problem, goal, errorText, tokens, and hints
 */
export function parseSeedIntent(seed: string): ParsedIntent {
  // Handle empty seed
  if (!seed || seed.trim().length === 0) {
    return {
      seed: '',
      normalized: '',
      situation: null,
      problem: null,
      goal: null,
      errorText: null,
      tokens: [],
      stackPathHints: [],
    };
  }

  // Normalize the seed
  const normalized = seed.toLowerCase().trim();

  // Tokenize and normalize
  const rawTokens = seed.split(/\s+/).filter((t) => t.length > 0);
  const tokens = rawTokens.map(normalizeToken);

  // Extract stack and path hints
  const stackPathHints = extractStackPathHints(normalized);

  // Extract structured intent fields
  const situation = extractSituation(seed, tokens);
  const problem = extractProblem(seed, tokens);
  const goal = extractGoal(seed, tokens);
  const errorText = detectError(seed);

  return {
    seed,
    normalized,
    situation,
    problem,
    goal,
    errorText,
    tokens,
    stackPathHints,
  };
}
