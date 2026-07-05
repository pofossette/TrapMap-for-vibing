import { describe, expect, it } from 'vitest';

import { resolveLangfuseAdapterConfigFromEnv } from './langfuse-config.js';

describe('resolveLangfuseAdapterConfigFromEnv', () => {
  it('returns resolved config when all required env vars are present', () => {
    const result = resolveLangfuseAdapterConfigFromEnv({
      LANGFUSE_BASE_URL: 'https://langfuse.example',
      LANGFUSE_PUBLIC_KEY: 'pk-test',
      LANGFUSE_SECRET_KEY: 'sk-test',
      TRAPMAP_EVAL_PLATFORM_FLUSH_TIMEOUT_MS: '2500',
    });

    expect(result).toEqual({
      ok: true,
      config: {
        baseUrl: 'https://langfuse.example',
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        flushTimeoutMs: 2500,
      },
    });
  });

  it('returns a warning when required env vars are missing', () => {
    const result = resolveLangfuseAdapterConfigFromEnv({
      LANGFUSE_PUBLIC_KEY: 'pk-test',
    });

    expect(result.ok).toBe(false);
    expect(result.warning).toContain('LANGFUSE_BASE_URL');
    expect(result.warning).toContain('LANGFUSE_SECRET_KEY');
  });

  it('returns a warning when flush timeout is invalid', () => {
    const result = resolveLangfuseAdapterConfigFromEnv({
      LANGFUSE_BASE_URL: 'https://langfuse.example',
      LANGFUSE_PUBLIC_KEY: 'pk-test',
      LANGFUSE_SECRET_KEY: 'sk-test',
      TRAPMAP_EVAL_PLATFORM_FLUSH_TIMEOUT_MS: '0',
    });

    expect(result).toEqual({
      ok: false,
      warning: expect.stringContaining('TRAPMAP_EVAL_PLATFORM_FLUSH_TIMEOUT_MS'),
    });
  });
});
