import { describe, expect, it } from 'vitest';

import { LifecycleEventBus } from './event-bus.js';
import { emitLifecycleTransition } from './emit-transition.js';

describe('emitLifecycleTransition', () => {
  it('requires the PostgreSQL outbox instead of dispatching through JSON mode', async () => {
    await expect(
      emitLifecycleTransition({
        store: { getPool: () => null } as never,
        eventBus: new LifecycleEventBus(),
        aggregateType: 'knowledge-entry',
        aggregateId: 'knowledge-1',
        previousState: 'draft',
        nextState: 'submitted',
        actorId: 'user-1',
        reason: 'submit',
      }),
    ).rejects.toThrow('lifecycle transitions require a PostgreSQL outbox');
  });
});
