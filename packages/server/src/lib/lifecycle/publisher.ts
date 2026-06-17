import type { LifecycleState } from '@trapmap/contracts';

import type { LifecycleEventBus } from '@trapmap/server/lib/lifecycle/event-bus.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

import { emitLifecycleTransition } from './emit-transition.js';

export interface PublishLifecycleTransitionInput {
  aggregateType: string;
  aggregateId: string;
  previousState: LifecycleState;
  nextState: LifecycleState;
  actorId: string;
  reason: string;
}

export interface LifecyclePublisher {
  publishTransition(input: PublishLifecycleTransitionInput): Promise<void>;
}

export function createLifecyclePublisher(deps: {
  store: SkillShareerStore;
  eventBus: LifecycleEventBus;
  asyncTransport?: {
    events: {
      enqueue(params: {
        aggregateType: string;
        aggregateId: string;
        eventName: string;
        payload: unknown;
      }): Promise<unknown>;
      enqueueTx(client: unknown, params: unknown): Promise<unknown>;
    };
  };
}): LifecyclePublisher {
  return {
    publishTransition(input) {
      return emitLifecycleTransition({
        store: deps.store,
        eventBus: deps.eventBus,
        ...(deps.asyncTransport ? { asyncTransport: deps.asyncTransport } : {}),
        ...input,
      });
    },
  };
}
