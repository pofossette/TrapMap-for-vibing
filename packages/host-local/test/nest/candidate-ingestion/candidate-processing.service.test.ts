import { describe, expect, it, vi } from 'vitest';

import { CandidateProcessingService } from '../../../src/nest/candidate-ingestion/candidate-processing.service.js';
import type { HostLocalRuntime } from '../../../src/nest/runtime/host-runtime.js';

describe('CandidateProcessingService', () => {
  it('starts and stops the owner processing runtime with the Nest lifecycle', async () => {
    const processing = { start: vi.fn(), close: vi.fn() };
    const service = new CandidateProcessingService({ processing } as HostLocalRuntime);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(processing.start).toHaveBeenCalledOnce();
    expect(processing.close).toHaveBeenCalledOnce();
  });
});
