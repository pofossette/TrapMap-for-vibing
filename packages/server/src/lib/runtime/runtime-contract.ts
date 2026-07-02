export type RuntimeMode = 'api' | 'task-worker' | 'outbox-worker' | 'combined';

export interface RuntimeModeConfig {
  mode: RuntimeMode;
}

export type AsyncWorkerKind = 'queue' | 'outbox';

export interface RuntimeWorkerHandle {
  isRunning(): boolean;
  ownsWork(): boolean;
  stop(): Promise<void> | void;
}

export interface RuntimeWorkerSnapshot {
  owner: boolean | undefined;
  running: boolean;
}

export function shouldBootApiRuntime(mode: RuntimeMode): boolean {
  return mode === 'api' || mode === 'combined';
}

export function shouldBootTaskWorker(mode: RuntimeMode): boolean {
  return mode === 'task-worker' || mode === 'combined';
}

export function shouldBootOutboxWorker(mode: RuntimeMode): boolean {
  return mode === 'outbox-worker' || mode === 'combined';
}

export function shouldOwnAsyncWork(mode: RuntimeMode, workerKind: AsyncWorkerKind): boolean {
  return workerKind === 'queue' ? shouldBootTaskWorker(mode) : shouldBootOutboxWorker(mode);
}

export function snapshotRuntimeWorker(
  worker: RuntimeWorkerHandle | null | undefined,
): RuntimeWorkerSnapshot {
  return {
    owner: worker?.ownsWork?.(),
    running: worker?.isRunning?.() ?? false,
  };
}
