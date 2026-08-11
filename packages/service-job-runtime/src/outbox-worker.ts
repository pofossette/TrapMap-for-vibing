import {
  OUTBOX_CLAIM_BATCH_SIZE,
  OUTBOX_POLL_INTERVAL_MS,
  type OutboxPort,
  unhandledEventIsAcknowledged,
} from '@trapmap/backend-core';

export interface JobRuntimeOutboxHandler {
  eventName: string;
  handle(payload: unknown): Promise<void>;
}

export interface JobRuntimeOutboxConsumer {
  run(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  ownsWork(): boolean;
}

export function createJobRuntimeOutboxConsumer(params: {
  outbox: OutboxPort;
  handlers: JobRuntimeOutboxHandler[];
  ownsWork: boolean;
  pollIntervalMs?: number;
  onError?: (error: unknown, event?: { eventName: string; aggregateId: string }) => void;
}): JobRuntimeOutboxConsumer {
  const handlers = new Map(params.handlers.map((handler) => [handler.eventName, handler]));
  const pollIntervalMs = params.pollIntervalMs ?? OUTBOX_POLL_INTERVAL_MS;
  let running = false;
  let loop: Promise<void> | null = null;
  let wakePoll: (() => void) | null = null;

  const pause = () =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wakePoll = null;
        resolve();
      }, pollIntervalMs);
      wakePoll = () => {
        clearTimeout(timer);
        wakePoll = null;
        resolve();
      };
    });

  return {
    async run() {
      if (loop || !params.ownsWork) return;
      running = true;
      loop = (async () => {
        while (running) {
          try {
            const events = await params.outbox.claimBatch(OUTBOX_CLAIM_BATCH_SIZE);
            for (const event of events) {
              const handler = handlers.get(event.eventName);
              if (handler === undefined) {
                if (unhandledEventIsAcknowledged(false)) {
                  await params.outbox.complete(event.id);
                }
                continue;
              }
              try {
                await handler.handle(event.payload);
                await params.outbox.complete(event.id);
              } catch (error) {
                await params.outbox.fail(
                  event.id,
                  error instanceof Error ? error.message : String(error),
                );
                params.onError?.(error, event);
              }
            }
            if (events.length === 0) await pause();
          } catch (error) {
            params.onError?.(error);
            await pause();
          }
        }
      })().finally(() => {
        running = false;
        loop = null;
      });
    },
    async stop() {
      running = false;
      wakePoll?.();
      await loop;
    },
    isRunning: () => running,
    ownsWork: () => params.ownsWork,
  };
}
