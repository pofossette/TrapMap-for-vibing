import type { InvocationError } from '@trapmap/backend-core';
import { describe, expect, it, vi } from 'vitest';
import { createRemoteJobRuntimeClient } from './internal-job-runtime-client.js';

describe('remote job-runtime client', () => {
  it('returns the authoritative remote job identifier', async () => {
    const schedule = vi.fn(async () => ({ status: 201, body: { jobId: 'job-remote-1' } }));
    const client = createRemoteJobRuntimeClient({ jobRuntime: { schedule } });

    await expect(
      client.schedule('candidate-processing', { candidateId: 'candidate-1' }),
    ).resolves.toBe('job-remote-1');
    expect(schedule).toHaveBeenCalledWith({
      type: 'candidate-processing',
      payload: { candidateId: 'candidate-1' },
    });
  });

  it('forwards task dedupe keys to the remote job-runtime', async () => {
    const schedule = vi.fn(async () => ({ status: 201, body: { jobId: 'job-remote-2' } }));
    const client = createRemoteJobRuntimeClient({ jobRuntime: { schedule } });

    await expect(
      client.schedule(
        'governance.conflict-detection',
        { entryId: 'entry-1', sourceEventId: 'event-1' },
        { dedupeKey: 'governance.conflict-detection:entry-1:event-1' },
      ),
    ).resolves.toBe('job-remote-2');
    expect(schedule).toHaveBeenCalledWith({
      type: 'governance.conflict-detection',
      payload: { entryId: 'entry-1', sourceEventId: 'event-1' },
      dedupeKey: 'governance.conflict-detection:entry-1:event-1',
    });
  });

  it('maps remote scheduling failures to canonical invocation errors', async () => {
    const client = createRemoteJobRuntimeClient({
      jobRuntime: {
        schedule: vi.fn(async () => ({
          status: 503,
          body: { error: 'job runtime unavailable', kind: 'unavailable' },
        })),
      },
    });

    await expect(client.schedule('candidate-processing', {})).rejects.toMatchObject({
      name: 'InvocationError',
      kind: 'unavailable',
    } satisfies Partial<InvocationError>);
  });
});
