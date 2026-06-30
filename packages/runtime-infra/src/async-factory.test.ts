import { describe, expect, it } from 'vitest';

import { createAsyncTransport } from './async-factory.js';
import * as runtimeInfra from './index.js';

describe('runtime-infra async factory', () => {
  it('re-exports async transport seam from package entry', () => {
    expect(runtimeInfra).toHaveProperty('createAsyncTransport');
  });

  it('throws when rabbitmq provider is selected without rabbitmq config', () => {
    expect(() =>
      createAsyncTransport({
        config: {
          asyncTaskTransport: {
            provider: 'rabbitmq',
            rabbitmq: null,
          },
        },
        pool: {} as never,
      }),
    ).toThrow('RabbitMQ task transport config is required');
  });
});
