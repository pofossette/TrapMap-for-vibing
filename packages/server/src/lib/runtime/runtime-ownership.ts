import type { AsyncWorkerDependencyState } from '@trapmap/contracts';

import type {
  AsyncWorkerKind,
  RuntimeMode,
  RuntimeWorkerHandle,
  RuntimeWorkerSnapshot,
} from './runtime-contract.js';
import { shouldOwnAsyncWork, snapshotRuntimeWorker } from './runtime-contract.js';

export interface ResolveAsyncWorkerStateOptions {
  database: 'postgres' | 'json-store';
  runtimeMode: RuntimeMode;
  workerKind: AsyncWorkerKind;
  worker?: RuntimeWorkerHandle | null;
  owner?: boolean | undefined;
  running?: boolean;
}

export function resolveAsyncWorkerState(
  args: ResolveAsyncWorkerStateOptions,
): AsyncWorkerDependencyState {
  if (args.database === 'json-store') {
    return 'not-configured';
  }

  const snapshot: RuntimeWorkerSnapshot =
    args.worker === undefined
      ? { owner: args.owner, running: args.running ?? false }
      : snapshotRuntimeWorker(args.worker);

  if (!shouldOwnAsyncWork(args.runtimeMode, args.workerKind) || snapshot.owner === false) {
    return 'remote';
  }

  return snapshot.running ? 'running' : 'degraded';
}
