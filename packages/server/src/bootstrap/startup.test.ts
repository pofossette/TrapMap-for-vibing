import { describe, expect, it, vi } from 'vitest';

import { buildServer } from '../app.js';
import { bootstrapCandidateRecovery } from './bootstrap-candidate-recovery.js';
import { bootstrapLifecycle } from './bootstrap-lifecycle.js';

describe('startup sequence', () => {
  it('initializes repos before candidate recovery', async () => {
    const server = buildServer();
    const logSpy = vi.spyOn(server.log, 'error');

    await server.ready();

    expect(logSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      'Failed to check for interrupted candidates',
    );

    await server.close();
  });

  it('fm-agent: bootstrapCandidateRecovery enqueues candidates on non-PostgresStore', async () => {
    // The raw report confirms: when store is JsonStore (not PostgresStore),
    // the enqueue loop is guarded by if(isPostgres), so recovered candidates
    // are NOT re-enqueued.
    // FIXME: this test will fail until the enqueue loop is unguarded for
    // non-PG stores or an alternative enqueue mechanism is provided.
    const mockStore = {
      snapshot: async () => ({
        candidateSubmissions: [
          {
            id: 'candidate_json_1',
            sourceType: 'trap',
            submittedBy: 'user_1',
            teamId: null,
            status: 'queued',
            originalPayload: {
              sourceType: 'trap',
              payload: { scope: 'global', labels: ['test'], shortcut: 'Test', detail: 'Test' },
            },
            analysisSnapshot: null,
            duplicateCase: null,
            receivedAt: new Date().toISOString(),
            queuedAt: new Date().toISOString(),
            analyzingAt: null,
            completedAt: null,
            lastError: null,
            retryCount: 0,
            manualResult: null,
          },
        ],
        /* eslint-disable @typescript-eslint/no-explicit-any */
      } as any),
      transact: async <T>(mutator: (data: any) => Promise<T> | T): Promise<T> => mutator({
        candidateSubmissions: [
          {
            id: 'candidate_json_1',
            sourceType: 'trap',
            submittedBy: 'user_1',
            teamId: null,
            status: 'queued',
            originalPayload: {
              sourceType: 'trap',
              payload: { scope: 'global', labels: ['test'], shortcut: 'Test', detail: 'Test' },
            },
            analysisSnapshot: null,
            duplicateCase: null,
            receivedAt: new Date().toISOString(),
            queuedAt: new Date().toISOString(),
            analyzingAt: null,
            completedAt: null,
            lastError: null,
            retryCount: 0,
            manualResult: null,
          },
        ],
      } as any),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */

    const enqueueCalls: Array<{ candidateId: string }> = [];
    const mockApp = {
      skillShareer: {
        store: mockStore,
        repos: {
          candidate: {
            listByStatus: async () => [],
            updateStatus: async () => {},
          },
        },
      },
      log: {
        info: () => {},
        error: () => {},
      },
    } as any;

    await bootstrapCandidateRecovery(mockApp);

    // FIXME: will fail — enqueue loop is guarded by isPostgres
    // Spec requires "All recovered candidates are enqueued for worker processing"
    expect(enqueueCalls.length).toBeGreaterThan(0);
  });

  it('fm-agent: bootstrapLifecycle registers audit subscribers for all lifecycle events', () => {
    const registeredEvents: string[] = [];
    const mockEventBus = {
      onDomainEvent: (event: string) => {
        registeredEvents.push(event);
      },
      on: () => {},
    };

    const mockApp = {
      skillShareer: {
        eventBus: mockEventBus,
        store: {} as any,
        adapterRegistry: {} as any,
      },
      log: { info: () => {}, error: () => {} },
      decorate: () => {},
    } as any;

    bootstrapLifecycle(mockApp);

    // FIXME: will fail — audit subscribers for knowledge.resubmitted
    // and knowledge.re-review are missing from current bootstrap-lifecycle.ts
    expect(registeredEvents).toContain('knowledge.resubmitted');
    expect(registeredEvents).toContain('knowledge.re-review');
  });
});
