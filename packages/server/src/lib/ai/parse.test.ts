import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { invokeWithParseRetry, stripCodeFences } from './parse.js';

describe('stripCodeFences', () => {
  it('removes fenced json wrappers', () => {
    expect(stripCodeFences('```json\n{"ok":true}\n```')).toBe('{"ok":true}');
  });
});

describe('invokeWithParseRetry', () => {
  it('retries after a parse failure and returns validated data', async () => {
    const invoke = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('{"ok":true}');

    const result = await invokeWithParseRetry({
      invoke,
      schema: z.object({ ok: z.boolean() }),
      maxRetries: 1,
    });

    expect(result).toEqual({ ok: true });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('returns null after retries are exhausted', async () => {
    const invoke = vi.fn<() => Promise<string>>().mockResolvedValue('still bad');

    const result = await invokeWithParseRetry({
      invoke,
      schema: z.object({ ok: z.boolean() }),
      maxRetries: 1,
    });

    expect(result).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});
