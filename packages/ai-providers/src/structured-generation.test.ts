import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { sha256 } from '@trapmap/lib';
import { StructuredGenerationError, generateStructured } from './structured-generation.js';
import type { ChatProvider } from './types.js';

const schema = z.object({ answer: z.number() }).strict();

function createChat(responses: Array<() => Promise<string>>, model: string | null = 'model-1') {
  let attempt = 0;
  const invokes: Array<{ system: string; prompt: string }> = [];
  const chat: ChatProvider = {
    provider: 'fixture',
    isConfigured: true,
    model,
    async invoke(system, prompt) {
      invokes.push({ system, prompt });
      const operation = responses[attempt];
      attempt += 1;
      if (!operation) throw new Error('unexpected extra invocation');
      return operation();
    },
  };
  return { chat, invokes, attempts: () => attempt };
}

describe('generateStructured', () => {
  it('rejects an unconfigured provider without invoking it', async () => {
    const { chat } = createChat([async () => '{"answer":1}']);
    const unconfigured = { ...chat, isConfigured: false };

    await expect(
      generateStructured({ chat: unconfigured, system: '', prompt: '', schema }),
    ).rejects.toMatchObject({
      name: 'StructuredGenerationError',
      attempts: 0,
      lastFailureClass: 'chat-unconfigured',
    });
  });

  it('parses fenced JSON once and records raw metadata', async () => {
    const { chat, invokes, attempts } = createChat([async () => '```json\n{"answer":42}\n```']);

    await expect(
      generateStructured({ chat, system: 'system', prompt: 'prompt', schema }),
    ).resolves.toEqual({
      value: { answer: 42 },
      rawText: '```json\n{"answer":42}\n```',
      rawTextSha256: sha256('```json\n{"answer":42}\n```'),
      provider: 'fixture',
      model: 'model-1',
      attempts: 1,
    });
    expect(attempts()).toBe(1);
    expect(invokes).toEqual([{ system: 'system', prompt: 'prompt' }]);
  });

  it('retries invalid JSON before schema success', async () => {
    const { chat, attempts } = createChat([async () => 'not-json', async () => '{"answer":7}']);

    const result = await generateStructured({
      chat,
      system: '',
      prompt: '',
      schema,
      maxRetries: 2,
      retryBaseDelayMs: 0,
    });

    expect(result.value).toEqual({ answer: 7 });
    expect(result.attempts).toBe(2);
    expect(attempts()).toBe(2);
  });

  it('retries schema failures and invoke failures separately', async () => {
    const schemaFailure = createChat([async () => '{"answer":"bad"}', async () => '{"answer":1}']);
    await expect(
      generateStructured({
        chat: schemaFailure.chat,
        system: '',
        prompt: '',
        schema,
        retryBaseDelayMs: 0,
      }),
    ).resolves.toMatchObject({ attempts: 2 });

    const invokeFailure = createChat([
      async () => {
        throw new Error('network failed');
      },
      async () => '{"answer":2}',
    ]);
    await expect(
      generateStructured({
        chat: invokeFailure.chat,
        system: '',
        prompt: '',
        schema,
        retryBaseDelayMs: 0,
      }),
    ).resolves.toMatchObject({ attempts: 2 });
  });

  it('throws typed errors after exhausting retries without leaking raw text', async () => {
    const parseFailure = createChat([
      async () => 'raw-secret',
      async () => 'raw-secret',
      async () => 'raw-secret',
    ]);
    const result = generateStructured({
      chat: parseFailure.chat,
      system: '',
      prompt: '',
      schema,
      retryBaseDelayMs: 0,
    });

    await expect(result).rejects.toThrow(StructuredGenerationError);
    const error = await result.catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(StructuredGenerationError);
    expect(error).toMatchObject({
      name: 'StructuredGenerationError',
      attempts: 3,
      lastFailureClass: 'json-parse',
    });
    expect(String(error)).not.toContain('raw-secret');
  });
});
