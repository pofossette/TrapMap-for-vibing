/**
 * Pure intent parsing helpers for seed-based retrieval (RETR-02).
 * Server-internal module - NOT exported through contracts.
 *
 * This module provides deterministic, heuristic-based intent parsing that runs
 * without external model dependencies (no OPENAI_API_KEY required).
 * Any future model assistance should stay optional behind the same ParsedIntent interface.
 */

import { stripCodeFences } from '@trapmap/server/lib/ai/parse.js';
import type { ChatProvider } from '@trapmap/server/lib/ai/types.js';
import type { IntentCacheStore } from '@trapmap/server/lib/retrieval/capsules/intent-cache.js';
import type {
  NormalizedToken,
  ParsedIntent,
  StackPathHint,
} from '@trapmap/server/lib/retrieval/types.js';
import { z } from 'zod';

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
 * Parse a natural-language seed into structured intent fields (RETR-02).
 * This fallback parser only extracts explicit structural signals that are
 * safe to derive without semantic interpretation.
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
      category: null,
      semanticQuery: null,
      parseMethod: 'regex',
    };
  }

  // Normalize the seed
  const normalized = seed.toLowerCase().trim();

  // Tokenize and normalize
  const rawTokens = seed.split(/\s+/).filter((t) => t.length > 0);
  const tokens = rawTokens.map(normalizeToken);

  // Extract stack and path hints
  const stackPathHints = extractStackPathHints(normalized);

  const errorText = detectError(seed);

  return {
    seed,
    normalized,
    situation: null,
    problem: null,
    goal: null,
    errorText,
    tokens,
    stackPathHints,
    category: null,
    semanticQuery: null,
    parseMethod: 'regex',
  };
}

export const INTENT_CATEGORY_VALUES = [
  'debugging',
  'configuration',
  'deployment',
  'performance',
  'integration',
  'security',
  'data',
  'testing',
  'general',
] as const;

const intentExtractionSchema = z.object({
  situation: z.string().nullable(),
  problem: z.string().nullable(),
  goal: z.string().nullable(),
  errorText: z.string().nullable(),
  category: z.enum(INTENT_CATEGORY_VALUES).nullable(),
  semanticQuery: z.string().max(200).nullable(),
});

function buildIntentExtractionSystemPrompt(): string {
  return `You are a query intent parser for an engineering knowledge base.
Analyze the user's search seed and extract structured intent.

Rules:
- Respond with ONLY valid JSON, no markdown fences, no explanation
- Extract: situation (context/when), problem (what's wrong),
  goal (what they want), errorText (error message if any)
- Extract: category — one of: debugging|configuration|deployment|
  performance|integration|security|data|testing|general
- Extract: semanticQuery — search-optimized reformulation using
  professional/technical terminology (max 200 chars)
- If a field cannot be determined, use null`;
}

function parseIntentExtractionResponse(raw: string): z.infer<typeof intentExtractionSchema> | null {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed = JSON.parse(cleaned);
    const result = intentExtractionSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function invokeIntentExtraction(
  chat: ChatProvider,
  seed: string,
): Promise<z.infer<typeof intentExtractionSchema> | null> {
  const maxRetries = 2;
  const systemPrompt = buildIntentExtractionSystemPrompt();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await chat.invoke(systemPrompt, seed);
      const parsed = parseIntentExtractionResponse(raw);
      if (parsed) return parsed;
    } catch {
      // transient failure, will retry
    }

    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt * 2)));
    }
  }

  return null;
}

export async function parseSeedIntentWithLLM(
  seed: string,
  chat: ChatProvider,
  options?: { cache?: IntentCacheStore },
): Promise<ParsedIntent> {
  const normalizedSeed = seed.toLowerCase().trim();
  const cached = options?.cache?.get(normalizedSeed);
  if (cached) return cached;

  if (!chat.isConfigured) {
    return parseSeedIntent(seed);
  }

  const fallback = parseSeedIntent(seed);
  const extraction = await invokeIntentExtraction(chat, seed);
  if (!extraction) return fallback;

  const result: ParsedIntent = {
    seed,
    normalized: normalizedSeed,
    situation: extraction.situation,
    problem: extraction.problem,
    goal: extraction.goal,
    errorText: extraction.errorText,
    tokens: seed.split(/\s+/).filter(Boolean).map(normalizeToken),
    stackPathHints: extractStackPathHints(normalizedSeed),
    category: extraction.category,
    semanticQuery: extraction.semanticQuery,
    parseMethod: 'llm',
  };

  options?.cache?.set(normalizedSeed, result);
  return result;
}
