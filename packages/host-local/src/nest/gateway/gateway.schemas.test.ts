import * as contracts from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

import { searchBodySchema } from './gateway.schemas.js';

describe('gateway search schema', () => {
  it('reuses the shared retrieval search body contract', () => {
    const contractRecord = contracts as Record<string, unknown>;

    expect(contractRecord).toHaveProperty('retrievalSearchBodySchema');
    expect(searchBodySchema).toBe(contractRecord.retrievalSearchBodySchema);
  });
});
