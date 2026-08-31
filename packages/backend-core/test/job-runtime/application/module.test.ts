import { describe, expect, it, vi } from 'vitest';

import type { AuditLogPort } from '../../../src/ports/audit-ports.js';
import type { OutboxPort } from '../../../src/ports/queue-ports.js';
import { createJobRuntimeModule } from '../../../src/job-runtime/application/module.js';

describe('job-runtime module', () => {
  it('forwards scheduling dedupe keys to the task queue', async () => {
    const enqueue = vi.fn().mockResolvedValue('task-1');
    const module = createJobRuntimeModule({
      queuePorts: {
        task: {
          kind: 'postgres-task-queue',
          enqueue,
          requeue: vi.fn(),
          getStatusSnapshot: vi.fn(),
        },
        outbox: {} as OutboxPort,
      },
      auditLog: {} as AuditLogPort,
    });

    await expect(
      module.schedule(
        'governance.conflict-detection',
        { entryId: 'entry-1', sourceEventId: 'event-1' },
        { dedupeKey: 'governance.conflict-detection:entry-1:event-1' },
      ),
    ).resolves.toBe('task-1');
    expect(enqueue).toHaveBeenCalledWith(
      'governance.conflict-detection',
      { entryId: 'entry-1', sourceEventId: 'event-1' },
      { dedupeKey: 'governance.conflict-detection:entry-1:event-1' },
    );
  });
});
