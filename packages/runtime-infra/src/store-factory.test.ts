import { describe, expect, it } from 'vitest';

import { createSkillShareerStore } from './store-factory.js';
import { JsonStore } from './store.js';

describe('runtime-infra store factory', () => {
  it('returns JsonStore when databaseUrl is absent', () => {
    const store = createSkillShareerStore({
      dataFile: '/tmp/runtime-infra-store.json',
      databaseUrl: null,
    });

    expect(store).toBeInstanceOf(JsonStore);
  });
});
