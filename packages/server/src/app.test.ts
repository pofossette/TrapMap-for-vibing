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

  it('exposes graph query runtime state from /ready', async () => {
    const app = buildServer();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      graphQuery: {
        mode: 'disabled',
        backendKind: 'memory',
      },
    });

    await app.close();
  });

  it('includes graph query runtime state in /health output', async () => {
    const app = buildServer();
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      graphQuery: {
        mode: 'disabled',
        backendKind: 'memory',
      },
    });

    await app.close();
  });
});
