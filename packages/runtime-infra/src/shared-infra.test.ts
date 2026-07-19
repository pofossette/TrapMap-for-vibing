import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import * as runtimeInfra from './index.js';

describe('runtime-infra shared infra exports', () => {
  it('re-exports store and repo seams from package entry', () => {
    expect(runtimeInfra).toHaveProperty('createSkillShareerStore');
    expect(runtimeInfra).toHaveProperty('PostgresStore');
    expect(runtimeInfra).toHaveProperty('JsonStore');
    expect(runtimeInfra).toHaveProperty('createRuntimeInfraRepos');
  });

  it('exports the default knowledge-read retrieval assembly seam', () => {
    expect(runtimeInfra).toHaveProperty('createDefaultKnowledgeReadRetrievalInfra');
  });

  it('does not compose an artifact repository', () => {
    const source = readFileSync(new URL('./repos.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('createArtifactRepository');
    expect(source).not.toContain('ArtifactRepository');
  });

  it('does not compose governance feedback or conflict repositories', () => {
    const source = readFileSync(new URL('./repos.ts', import.meta.url), 'utf8');

    expect(source).not.toContain('createFeedbackRepository');
    expect(source).not.toContain('createConflictRepository');
    expect(source).not.toContain('FeedbackRepository');
    expect(source).not.toContain('ConflictRepository');
  });
});
