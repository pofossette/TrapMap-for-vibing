import { describe, expect, it, vi } from 'vitest';

import { createExperienceGeneDerivationTaskHandler } from '../../src/handlers/experience-gene.js';

const payload = {
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
};

describe('experience gene derivation task handler', () => {
  it('parses the frozen task payload and delegates to the owner operation', async () => {
    const derive = vi.fn(async () => ({ status: 'validated' }));
    const handler = createExperienceGeneDerivationTaskHandler({ derive });

    await handler.handle(
      { id: 'task-1', type: handler.type, payload, attempt: 1 },
      new AbortController().signal,
    );

    expect(handler.type).toBe('experience-gene.derive');
    expect(derive).toHaveBeenCalledWith(payload);
  });

  it('rejects unknown payloads before invoking the owner operation', async () => {
    const derive = vi.fn();
    const handler = createExperienceGeneDerivationTaskHandler({ derive });

    await expect(
      handler.handle(
        { id: 'task-2', type: handler.type, payload: {}, attempt: 1 },
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(derive).not.toHaveBeenCalled();
  });
});
