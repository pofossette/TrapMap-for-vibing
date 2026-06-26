import type { OutboxEvent, OutboxPort, RuntimeWorkerHandle } from '@trapmap/backend-core';

export type OutboxFailureKind = 'retryable' | 'permanent';

export interface OutboxConfig {
  enabled: boolean;
  ownsWork: boolean;
  pollIntervalMs: number;
  batchSize: number;
  dispatch: (event: OutboxEvent) => Promise<void>;
  classifyFailure?: (error: unknown, event: OutboxEvent) => OutboxFailureKind;
  onEventResult?: (result: {
    eventId: string;
    eventName: string;
    status: 'completed' | 'failed';
    failureKind?: OutboxFailureKind;
  }) => void;
}

export const DEFAULT_OUTBOX_CONFIG: OutboxConfig = {
  enabled: true,
  ownsWork: true,
  pollIntervalMs: 2000,
  batchSize: 10,
  dispatch: async () => {},
  classifyFailure: () => 'retryable',
  onEventResult: () => {},
};

export function createInProcessOutboxDispatcher(
  outbox: OutboxPort | null,
  config: Partial<OutboxConfig> = {},
): RuntimeWorkerHandle | null {
  const merged = { ...DEFAULT_OUTBOX_CONFIG, ...config };

  if (!merged.enabled || !outbox) {
    return null;
  }

  let running = true;
  let sleepTimer: ReturnType<typeof setTimeout> | null = null;
  let wakeSleep: (() => void) | null = null;
  const inFlight = new Set<Promise<void>>();

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      wakeSleep = () => {
        wakeSleep = null;
        if (sleepTimer) {
          clearTimeout(sleepTimer);
          sleepTimer = null;
        }
        resolve();
      };
      sleepTimer = setTimeout(() => {
        sleepTimer = null;
        wakeSleep = null;
        resolve();
      }, ms);
    });

  const processEvent = async (event: OutboxEvent): Promise<void> => {
    try {
      await merged.dispatch(event);
      await outbox.complete(event.id);
      merged.onEventResult?.({
        eventId: event.id,
        eventName: event.eventName,
        status: 'completed',
      });
    } catch (error) {
      const failureKind = merged.classifyFailure?.(error, event) ?? 'retryable';
      const message = error instanceof Error ? error.message : String(error);
      await outbox.fail(event.id, message);
      merged.onEventResult?.({
        eventId: event.id,
        eventName: event.eventName,
        status: 'failed',
        failureKind,
      });
    }
  };

  const loopPromise = (async () => {
    while (running) {
      try {
        const events = (await outbox.claimBatch(merged.batchSize)) ?? [];
        if (events.length === 0) {
          await sleep(merged.pollIntervalMs);
          continue;
        }

        for (const event of events) {
          const eventPromise = processEvent(event).finally(() => {
            inFlight.delete(eventPromise);
          });
          inFlight.add(eventPromise);
          await eventPromise;
        }
      } catch {
        if (running) {
          await sleep(merged.pollIntervalMs);
        }
      }
    }

    await Promise.all(inFlight);
  })().finally(() => {
    running = false;
  });

  return {
    isRunning(): boolean {
      return running;
    },

    ownsWork(): boolean {
      return merged.ownsWork;
    },

    async stop(): Promise<void> {
      running = false;
      wakeSleep?.();
      await loopPromise;
    },
  };
}
