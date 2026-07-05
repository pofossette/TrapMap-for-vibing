import type { EvalPlatformEvent } from '../../../packages/contracts/src/domain/evals/platform.js';

import { createJsonArchiveAdapter } from './json-archive-adapter.js';
import { createLangfuseAdapter } from './langfuse-adapter.js';
import { createNoopAdapter } from './noop-adapter.js';
import type {
  EvalPlatformAdapter,
  EvalPlatformAdapterConfig,
  EvalPlatformWarningLogger,
} from './types.js';

export type {
  EvalPlatformAdapter,
  EvalPlatformAdapterConfig,
  EvalPlatformAdapterKind,
  EvalPlatformEvent,
  EvalPlatformRun,
  EvalPlatformWarningLogger,
} from './types.js';

export function createEvalPlatformAdapter(
  config: EvalPlatformAdapterConfig = {},
): EvalPlatformAdapter {
  if (config.kind === 'json-archive') {
    return createJsonArchiveAdapter({ outputDir: config.outputDir });
  }

  if (config.kind === 'langfuse') {
    return createLangfuseAdapter(config);
  }

  return createNoopAdapter();
}

export async function publishPlatformEventSafely(
  adapter: EvalPlatformAdapter,
  warn: EvalPlatformWarningLogger,
  event: EvalPlatformEvent,
): Promise<void> {
  try {
    await adapter.publish(event);
  } catch (error) {
    warn(
      `[eval-platform] ${adapter.kind} adapter publish failed; continuing without affecting eval status.`,
      error,
    );
  }
}

export async function closePlatformAdapterSafely(
  adapter: EvalPlatformAdapter,
  warn: EvalPlatformWarningLogger,
): Promise<void> {
  try {
    await adapter.close();
  } catch (error) {
    warn(
      `[eval-platform] ${adapter.kind} adapter close failed; continuing without affecting eval status.`,
      error,
    );
  }
}
