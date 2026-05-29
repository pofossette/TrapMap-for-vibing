import { describe, expect, it } from 'vitest';

import { buildServer } from './app.js';

describe('app.ts live gaps — fm-agent raw report', () => {
  it('fm-agent: onClose awaits async worker shutdown before resolving', async () => {
    const app = buildServer();
    const events: string[] = [];

    (app as any).taskWorker = {
      stop: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push('task-stopped');
      },
    };
    (app as any).outboxWorker = {
      stop: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        events.push('outbox-stopped');
      },
    };

    await app.close();

    expect(events).toContain('task-stopped');
    expect(events).toContain('outbox-stopped');
  });

  it('fm-agent: app.skillShareer is frozen to prevent mutation', async () => {
    const app = buildServer();
    await app.ready();

    const frozen = Object.isFrozen(app.skillShareer);

    expect(frozen).toBe(true);

    await app.close();
  });
});
