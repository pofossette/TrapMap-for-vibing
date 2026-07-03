import type {
  EvalPlatformEvent,
  EvalPlatformRun,
} from '../../../packages/contracts/src/domain/evals/platform.js';

export type { EvalPlatformEvent, EvalPlatformRun };

export type EvalPlatformAdapterKind = 'noop' | 'json-archive';

export interface EvalPlatformAdapterConfig {
  kind?: EvalPlatformAdapterKind | null;
  outputDir?: string;
}

export interface EvalPlatformAdapter {
  kind: EvalPlatformAdapterKind | string;
  publish(event: EvalPlatformEvent): Promise<void>;
  close(): Promise<void>;
}

export type EvalPlatformWarningLogger = (message: string, error?: unknown) => void;
