import { describe, expect, it } from 'vitest';

import { JsonStore } from './store.js';
import { createSkillShareerStore } from './store-factory.js';

describe('runtime-infra store factory', () => {
  it('returns JsonStore when databaseUrl is absent', () => {
    const store = createSkillShareerStore({
      dataFile: '/tmp/runtime-infra-store.json',
      databaseUrl: null,
    });

    expect(store).toBeInstanceOf(JsonStore);
  });
});
