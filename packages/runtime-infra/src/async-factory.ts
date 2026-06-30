import type { Pool } from 'pg';

import {
  type AsyncTransport,
  createPostgresEventTransport,
  createPostgresTaskTransport,
} from './async-transport.js';
import { createRabbitMqTaskTransport } from './rabbitmq-task-queue.js';

export interface AsyncTaskTransportConfig {
  provider: 'postgres' | 'rabbitmq';
  rabbitmq: {
    url: string;
    exchange: string;
    queue: string;
    prefetch: number;
  } | null;
}

export function createAsyncTransport(params: {
  config: {
    asyncTaskTransport: AsyncTaskTransportConfig;
  };
  pool: Pool;
}): AsyncTransport {
  if (params.config.asyncTaskTransport.provider === 'rabbitmq') {
    const rabbitmq = params.config.asyncTaskTransport.rabbitmq;
    if (!rabbitmq) {
      throw new Error('RabbitMQ task transport config is required');
    }

    return {
      task: createRabbitMqTaskTransport({
        url: rabbitmq.url,
        exchange: rabbitmq.exchange,
        queue: rabbitmq.queue,
        prefetch: rabbitmq.prefetch,
      }),
      events: createPostgresEventTransport(params.pool),
    };
  }

  return {
    task: createPostgresTaskTransport(params.pool),
    events: createPostgresEventTransport(params.pool),
  };
}
