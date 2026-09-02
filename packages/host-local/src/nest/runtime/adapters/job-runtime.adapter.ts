import type { QueuePorts } from '@trapmap/backend-core';

import type { HostLocalAsyncTransport } from '../shared-infra.js';

export function createQueuePorts(asyncTransport?: HostLocalAsyncTransport): QueuePorts {
  if (asyncTransport) {
    return {
      task: {
        kind: asyncTransport.task.kind,
        enqueue: (type, payload, options) => asyncTransport.task.enqueue(type, payload, options),
        requeue: (taskId) => asyncTransport.task.requeue(taskId),
        getStatusSnapshot: () => asyncTransport.task.getStatusSnapshot(),
        async createConsumer(params) {
          if (!asyncTransport.task.createConsumer) {
            throw new Error('Task transport does not support consumers');
          }
          return asyncTransport.task.createConsumer({
            ownsWork: params.ownsWork,
            handlers: params.handlers,
          });
        },
      },
      outbox: asyncTransport.events,
    };
  }

  const missingTransportError = () =>
    new Error('Host-local async transport is not configured; queue ports cannot be used');

  return {
    task: {
      kind: 'postgres-task-queue',
      async enqueue() {
        throw missingTransportError();
      },
      async requeue() {
        throw missingTransportError();
      },
      async getStatusSnapshot() {
        return {
          provider: 'postgres',
          pending: 0,
          running: 0,
          dead: 0,
          staleRunning: 0,
          reclaimCount: 0,
        };
      },
    },
    outbox: {
      kind: 'postgres-domain-outbox',
      async enqueue() {
        throw missingTransportError();
      },
      async claimBatch() {
        throw missingTransportError();
      },
      async complete() {
        throw missingTransportError();
      },
      async fail() {
        throw missingTransportError();
      },
      async getStatusSnapshot() {
        return {
          provider: 'postgres',
          pending: 0,
          processing: 0,
          failed: 0,
          staleProcessing: 0,
          reclaimCount: 0,
        };
      },
    },
  };
}
