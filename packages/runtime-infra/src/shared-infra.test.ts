import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as runtimeInfra from './index.js';

describe('runtime-infra shared infra exports', () => {
  it('re-exports store seams without a compatibility repository aggregate', () => {
    expect(runtimeInfra).toHaveProperty('createSkillShareerStore');
    expect(runtimeInfra).toHaveProperty('PostgresStore');
    expect(runtimeInfra).toHaveProperty('JsonStore');
    expect(runtimeInfra).not.toHaveProperty('createRuntimeInfraRepos');
  });

  it('does not export knowledge-read compatibility assemblies', () => {
    expect(runtimeInfra).not.toHaveProperty('createDefaultKnowledgeReadRetrievalInfra');
    expect(runtimeInfra).not.toHaveProperty('createDefaultKnowledgeReadSupportInfra');
  });

  it('does not retain the compatibility repository aggregate source', () => {
    expect(existsSync(join(process.cwd(), 'packages/runtime-infra/src/repos.ts'))).toBe(false);
  });
});
