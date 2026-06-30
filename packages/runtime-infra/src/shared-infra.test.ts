import { describe, expect, it } from 'vitest';

import * as runtimeInfra from './index.js';

describe('runtime-infra shared infra exports', () => {
  it('re-exports store and repo seams from package entry', () => {
    expect(runtimeInfra).toHaveProperty('createSkillShareerStore');
    expect(runtimeInfra).toHaveProperty('PostgresStore');
    expect(runtimeInfra).toHaveProperty('JsonStore');
    expect(runtimeInfra).toHaveProperty('createRuntimeInfraRepos');
  });
});
