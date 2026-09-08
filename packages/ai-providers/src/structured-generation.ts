import { sha256 } from '@trapmap/lib';
import type { ZodType } from 'zod';
import { stripCodeFences } from './ai-parse.js';
import { resolveStructuredMaxRetries, resolveStructuredRetryBaseMs } from './provider-config.js';
import type { ChatProvider } from './types.js';

export interface StructuredGenerationResult<T> {
  value: T;
  rawText: string;
  rawTextSha256: string;
  provider: string;
  model: string | null;
  attempts: number;
}

type StructuredFailureClass = 'chat-unconfigured' | 'invoke' | 'json-parse' | 'schema-validation';

export class StructuredGenerationError extends Error {
  readonly attempts: number;
  readonly lastFailureClass: StructuredFailureClass;

  constructor(attempts: number, lastFailureClass: StructuredFailureClass) {
    super(`Structured generation failed after ${attempts} attempt(s)`);
    this.name = 'StructuredGenerationError';
    this.attempts = attempts;
    this.lastFailureClass = lastFailureClass;
  }
}

class GenerationResponseError extends Error {
  constructor(readonly failureClass: StructuredFailureClass) {
    super('Structured generation response could not be parsed');
  }
}

function assertRetryLimit(maxRetries: number): void {
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new RangeError('maxRetries must be an integer between 0 and 5');
  }
}

function parseStructuredValue<T>(rawText: string, schema: ZodType<T>): T {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFences(rawText));
  } catch {
    throw new GenerationResponseError('json-parse');
  }

  const parsed = schema.safeParse(parsedJson);
  if (!parsed.success) throw new GenerationResponseError('schema-validation');
  return parsed.data;
}

function failureClassFor(error: unknown): StructuredFailureClass {
  if (error instanceof GenerationResponseError) return error.failureClass;
  return 'invoke';
}

export async function generateStructured<T>(options: {
  chat: ChatProvider;
  system: string;
  prompt: string;
  schema: ZodType<T>;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  temperature?: number;
}): Promise<StructuredGenerationResult<T>> {
  // Defaults are centralized in ./provider-config.js (env-overridable);
  // the base-4 exponential shape below stays hardcoded.
  const maxRetries = options.maxRetries ?? resolveStructuredMaxRetries();
  assertRetryLimit(maxRetries);
  const baseDelayMs = options.retryBaseDelayMs ?? resolveStructuredRetryBaseMs();
  if (options.temperature !== undefined && (options.temperature < 0 || options.temperature > 2)) {
    throw new RangeError('temperature must be between 0 and 2');
  }

  if (!options.chat.isConfigured) {
    throw new StructuredGenerationError(0, 'chat-unconfigured');
  }

  let attempts = 0;
  let lastFailureClass: StructuredFailureClass = 'invoke';
  while (attempts <= maxRetries) {
    attempts += 1;
    try {
      const rawText =
        options.temperature === undefined
          ? await options.chat.invoke(options.system, options.prompt)
          : await (
              options.chat.invokeWithTemperature?.bind(options.chat) ??
              (() => {
                throw new Error('ChatProvider does not support explicit temperature');
              })
            )(options.system, options.prompt, options.temperature);
      const value = parseStructuredValue(rawText, options.schema);

      return {
        value,
        rawText,
        rawTextSha256: sha256(rawText),
        provider: options.chat.provider,
        model: options.chat.model ?? null,
        attempts,
      };
    } catch (error) {
      lastFailureClass = failureClassFor(error);
    }

    if (attempts <= maxRetries) {
      // NOTE: backoff base 4 differs from ai-parse (base 2) by design: 历史选择，默认参数下延迟序列一致，改前先压测
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 4 ** (attempts - 1)));
    }
  }

  throw new StructuredGenerationError(attempts, lastFailureClass);
}
