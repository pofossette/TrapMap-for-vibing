export type RuntimeMode = 'api' | 'task-worker' | 'outbox-worker' | 'combined';

export interface RuntimeModeConfig {
  mode: RuntimeMode;
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
