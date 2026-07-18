import { describe, expect, it, vi } from 'vitest';

import { createJobRuntimeTaskHandlers } from './handlers.js';

describe('distributed job-runtime task handlers', () => {
  it('consumes governance conflict tasks through the governance owner client', async () => {
    const detectConflicts = vi.fn(async () => ({
      status: 200,
      body: { detectedCount: 1 },
    }));
    const handlers = createJobRuntimeTaskHandlers({
      governanceReview: { detectConflicts },
    } as never);

    const handler = handlers.find(({ type }) => type === 'governance.conflict-detection');
    expect(handler).toBeDefined();

    await handler?.handle(
      {
        id: 'task-1',
        type: 'governance.conflict-detection',
        payload: { entryId: 'entry-1', sourceEventId: 'event-1' },
        attempt: 1,
      },
      new AbortController().signal,
    );

    expect(detectConflicts).toHaveBeenCalledWith({ entryId: 'entry-1' });
  });
});
