import type { EvalPlatformEvent, EvalPlatformRun } from '../../types/platform.js';

export type { EvalPlatformEvent, EvalPlatformRun };

export type EvalPlatformAdapterKind = 'noop' | 'json-archive' | 'langfuse';

export interface EvalPlatformAdapterConfig {
  kind?: EvalPlatformAdapterKind | null;
  outputDir?: string;
  baseUrl?: string;
  publicKey?: string;
  secretKey?: string;
  flushTimeoutMs?: number;
}

export interface EvalPlatformAdapter {
  kind: EvalPlatformAdapterKind | string;
  publish(event: EvalPlatformEvent): Promise<void>;
  close(): Promise<void>;
}

export type EvalPlatformWarningLogger = (message: string, error?: unknown) => void;
