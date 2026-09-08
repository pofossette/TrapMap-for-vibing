import type { ZodType } from 'zod';

import { resolveParseMaxRetries, resolveParseRetryBaseMs } from './provider-config.js';

/**
 * Shared LLM response parsing helpers.
 *
 * @module ai/parse
 */

/**
 * Strip markdown code fences from an LLM response.
 *
 * Handles the common pattern where LLMs wrap JSON in triple backticks:
 *   ```json\n{...}\n```  →  {...}
 *
 * @param raw - Raw LLM response text
 * @returns Response with code fences removed
 */
export function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '');
}

export function parseJsonWithSchema<T>(raw: string, schema: ZodType<T>): T | null {
  try {
    const cleaned = stripCodeFences(raw);
    const parsed: unknown = JSON.parse(cleaned);
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function invokeWithParseRetry<T>(options: {
  invoke: () => Promise<string>;
  schema: ZodType<T>;
  maxRetries?: number;
  backoffMs?: number | ((attempt: number) => number);
}): Promise<T | null> {
  // Defaults are centralized in ./provider-config.js (env-overridable);
  // the exponential shape below stays hardcoded.
  const maxRetries = options.maxRetries ?? resolveParseMaxRetries();
  const retryBaseMs = resolveParseRetryBaseMs();
  // NOTE: backoff base 2 differs from structured-generation (base 4) by design: 历史选择，默认参数下延迟序列一致，改前先压测
  const backoffMs = options.backoffMs ?? ((attempt: number) => retryBaseMs * 2 ** (attempt * 2));

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const raw = await options.invoke();
      const parsed = parseJsonWithSchema(raw, options.schema);
      if (parsed !== null) {
        return parsed;
      }
    } catch {
      // Retry invoke failures and parse failures through the same path.
    }

    if (attempt < maxRetries) {
      const delayMs = typeof backoffMs === 'function' ? backoffMs(attempt) : backoffMs;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return null;
}
