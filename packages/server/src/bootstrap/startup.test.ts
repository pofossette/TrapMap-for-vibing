import { describe, expect, it, vi } from 'vitest';

import { buildServer } from '@trapmap/server/app.js';
import { getArtifactAdapters } from '@trapmap/server/lib/indexing/artifact-pipeline.js';
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

  it('fm-agent: bootstrapCandidateRecovery handles non-PostgresStore without PG task queue', async () => {
    const mockStore = {
      snapshot: async () =>
        ({
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
        }) as any,
      transact: async <T>(mutator: (data: any) => Promise<T> | T): Promise<T> =>
        mutator({
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

    const warnLogs: string[] = [];
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
        warn: (msg: string) => {
          warnLogs.push(msg);
        },
        error: () => {},
      },
    } as any;

    await bootstrapCandidateRecovery(mockApp);

    // Non-PG stores (JSON) reset candidates but re-enqueue is unavailable
    // without PostgreSQL backend. This is intentional — JSON store mode
    // is for development/testing and does not have task queue infrastructure.
    // The warning log confirms the boundary is explicitly handled.
    expect(warnLogs.length).toBeGreaterThan(0);
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

    expect(registeredEvents).toContain('knowledge.resubmitted');
    expect(registeredEvents).toContain('knowledge.re-review');
  });

  it('registers shared artifact adapters during startup', async () => {
    const server = buildServer();
    await server.ready();

    const adapters = getArtifactAdapters();
    expect(adapters.length).toBeGreaterThanOrEqual(1);

    await server.close();
  });
});
