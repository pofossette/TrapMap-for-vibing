import type { Pool } from 'pg';

import type { ServerConfig } from '@trapmap/server/config.js';
import { createRabbitMqTaskTransport } from './rabbitmq-task-queue.js';
import {
  type AsyncTransport,
  createPostgresEventTransport,
  createPostgresTaskTransport,
} from './transport.js';

export function createAsyncTransport(params: {
  config: ServerConfig;
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
