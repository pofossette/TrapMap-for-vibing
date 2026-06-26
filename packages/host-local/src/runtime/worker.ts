import type {
  RuntimeWorkerHandle,
  TaskConsumerHandle,
  TaskHandler,
  TaskQueuePort,
} from '@trapmap/backend-core';

export interface WorkerConfig {
  enabled: boolean;
  ownsWork: boolean;
  pollIntervalMs: number;
  concurrency: number;
  handlers: TaskHandler<unknown>[];
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  enabled: true,
  ownsWork: true,
  pollIntervalMs: 1000,
  concurrency: 1,
  handlers: [],
};

export function createInProcessTaskWorker(
  taskQueue: TaskQueuePort | null,
  config: Partial<WorkerConfig> = {},
): RuntimeWorkerHandle | null {
  const merged = { ...DEFAULT_WORKER_CONFIG, ...config };

  if (!merged.enabled || !taskQueue?.createConsumer) {
    return null;
  }

  let consumerPromise: Promise<TaskConsumerHandle> | null = null;
  let startPromise: Promise<void> | null = null;
  let runPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  let consumerStopPromise: Promise<void> | null = null;
  let running = false;
  let stopRequested = false;

  const getConsumer = async (): Promise<TaskConsumerHandle> => {
    if (!consumerPromise) {
      consumerPromise = taskQueue.createConsumer!({
        handlers: merged.handlers,
        ownsWork: merged.ownsWork,
      });
    }
    return consumerPromise;
  };

  const stopConsumer = async (): Promise<void> => {
    if (!consumerStopPromise) {
      consumerStopPromise = getConsumer().then((consumer) => consumer.stop());
    }
    await consumerStopPromise;
  };

  const ensureStarted = async (): Promise<void> => {
    if (startPromise) {
      return startPromise;
    }

    startPromise = (async () => {
      const consumer = await getConsumer();
      if (!runPromise) {
        running = true;
        runPromise = consumer.run().finally(() => {
          running = false;
        });
      }

      if (stopRequested) {
        await stopConsumer();
      }
    })();

    return startPromise;
  };

  void ensureStarted().catch(() => {
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
      stopRequested = true;
      if (!stopPromise) {
        stopPromise = (async () => {
          await ensureStarted();
          await stopConsumer();
          await runPromise;
        })().finally(() => {
          running = false;
        });
      }
      await stopPromise;
    },
  };
}
