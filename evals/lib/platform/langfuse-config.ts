import type { EvalPlatformAdapterConfig } from './types.js';

type LangfuseResolvedConfig = Pick<
  EvalPlatformAdapterConfig,
  'baseUrl' | 'publicKey' | 'secretKey' | 'flushTimeoutMs'
>;

export type ResolveLangfuseAdapterConfigResult =
  | { ok: true; config: LangfuseResolvedConfig }
  | { ok: false; warning: string };

const DEFAULT_FLUSH_TIMEOUT_MS = 5000;

export function resolveLangfuseAdapterConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ResolveLangfuseAdapterConfigResult {
  const baseUrl = env.LANGFUSE_BASE_URL?.trim();
  const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = env.LANGFUSE_SECRET_KEY?.trim();

  const missingKeys = [
    !baseUrl ? 'LANGFUSE_BASE_URL' : null,
    !publicKey ? 'LANGFUSE_PUBLIC_KEY' : null,
    !secretKey ? 'LANGFUSE_SECRET_KEY' : null,
  ].filter((key): key is string => key !== null);

  if (missingKeys.length > 0) {
    return {
      ok: false,
      warning: `[eval-platform] langfuse adapter disabled: missing ${missingKeys.join(', ')}.`,
    };
  }

  const flushTimeoutValue = env.TRAPMAP_EVAL_PLATFORM_FLUSH_TIMEOUT_MS?.trim();
  if (!flushTimeoutValue) {
    return {
      ok: true,
      config: {
        baseUrl,
        publicKey,
        secretKey,
        flushTimeoutMs: DEFAULT_FLUSH_TIMEOUT_MS,
      },
    };
  }

  const flushTimeoutMs = Number.parseInt(flushTimeoutValue, 10);
  if (!Number.isFinite(flushTimeoutMs) || flushTimeoutMs <= 0) {
    return {
      ok: false,
      warning:
        '[eval-platform] langfuse adapter disabled: TRAPMAP_EVAL_PLATFORM_FLUSH_TIMEOUT_MS must be a positive integer.',
    };
  }

  return {
    ok: true,
    config: {
      baseUrl,
      publicKey,
      secretKey,
      flushTimeoutMs,
    },
  };
}
