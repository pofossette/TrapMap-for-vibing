import {
  createTaskWorkerFromQueue,
  type TaskWorkerConfig as ContractTaskWorkerConfig,
} from '@trapmap/contracts';
import type { Pool } from 'pg';

import { createTaskQueue } from './task-queue.js';

export type TaskWorkerConfig = ContractTaskWorkerConfig<Pool>;

export function createTaskWorker(config: TaskWorkerConfig) {
  return createTaskWorkerFromQueue(config, (pool) => createTaskQueue({ pool }));
}
