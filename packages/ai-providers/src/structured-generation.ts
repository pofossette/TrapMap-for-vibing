import type { ZodType } from 'zod';

import { sha256 } from '@trapmap/lib';
import { stripCodeFences } from './ai-parse.js';
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
}): Promise<StructuredGenerationResult<T>> {
  const maxRetries = options.maxRetries ?? 2;
  assertRetryLimit(maxRetries);
  const baseDelayMs = options.retryBaseDelayMs ?? 100;

  if (!options.chat.isConfigured) {
    throw new StructuredGenerationError(0, 'chat-unconfigured');
  }

  let attempts = 0;
  let lastFailureClass: StructuredFailureClass = 'invoke';
  while (attempts <= maxRetries) {
    attempts += 1;
    try {
      const rawText = await options.chat.invoke(options.system, options.prompt);
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
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 4 ** (attempts - 1)));
    }
  }

  throw new StructuredGenerationError(attempts, lastFailureClass);
}
