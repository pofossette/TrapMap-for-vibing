import { describe, expect, it, vi } from 'vitest';

import { createHostLocalExperienceGeneHandlers } from './experience-gene-composition.js';

const queuePorts = {
  task: { enqueue: vi.fn(async () => 'task-id') },
};

describe('host-local experience gene composition', () => {
  it('registers neither consume nor fanout when rollout is off', () => {
    const handlers = createHostLocalExperienceGeneHandlers({
      experienceGeneMode: 'off',
      derive: vi.fn(),
      markStale: vi.fn(),
      plan: vi.fn(async () => []),
      queuePorts,
    });

    expect(handlers.taskHandler).toBeNull();
    expect(handlers.outboxHandlers).toEqual([]);
  });

  it('registers local consume and source-event fanout when rollout is enabled', async () => {
    const derive = vi.fn(async () => ({ status: 'validated' }));
    const markStale = vi.fn(async () => ({ marked: 0 }));
    const plan = vi.fn(async () => []);
    const handlers = createHostLocalExperienceGeneHandlers({
      experienceGeneMode: 'shadow',
      derive,
      markStale,
      plan,
      queuePorts,
    });

    expect(handlers.taskHandler?.type).toBe('experience-gene.derive');
    expect(handlers.outboxHandlers.map(({ eventName }) => eventName)).toEqual([
      'knowledge.approved',
      'knowledge.lifecycle-updated',
      'knowledge.rejected',
      'knowledge.remediation',
      'artifact.approved',
      'artifact.lifecycle-updated',
      'artifact.deactivated',
    ]);

    await handlers.taskHandler?.handle({
      payload: {
        requestId: 'request-1',
        source: {
          kind: 'trap',
          sourceId: 'trap-1',
          sourceRevision: 1,
          sourceHash: 'a'.repeat(64),
          artifactId: null,
          capsuleId: null,
          artifactRevision: null,
        },
        derivationUnitId: 'trap:trap-1:v1',
        generatorKind: 'rule',
        promptVersion: 'experience-gene-rule-v1',
        snapshotHash: 'b'.repeat(64),
      },
    });
    await handlers.outboxHandlers[0]?.handle({
      name: 'knowledge.remediation',
      entryId: 'trap-1',
      suppressedFromRetrieval: true,
      timestamp: '2026-08-26T00:00:00.000Z',
    });
    expect(derive).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-1' }));
    expect(markStale).toHaveBeenCalledOnce();
    expect(plan).not.toHaveBeenCalled();
  });
});
