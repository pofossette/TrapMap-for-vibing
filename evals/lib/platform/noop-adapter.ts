import type { EvalPlatformAdapter } from './types.js';

export function createNoopAdapter(): EvalPlatformAdapter {
  return {
    kind: 'noop',
    async publish() {},
    async close() {},
  };
}
