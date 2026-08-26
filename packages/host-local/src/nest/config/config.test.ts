import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from './config.js';

const EXPERIENCE_GENE_MODE = 'TRAPMAP_EXPERIENCE_GENE_MODE';

describe('host-local configuration', () => {
  afterEach(() => {
    delete process.env[EXPERIENCE_GENE_MODE];
  });

  it('defaults Experience Gene rollout to off and rejects unknown modes safely', () => {
    delete process.env[EXPERIENCE_GENE_MODE];
    expect(loadConfig().experienceGeneMode).toBe('off');

    process.env[EXPERIENCE_GENE_MODE] = 'unexpected';
    expect(loadConfig().experienceGeneMode).toBe('off');

    process.env[EXPERIENCE_GENE_MODE] = 'shadow';
    expect(loadConfig().experienceGeneMode).toBe('shadow');
  });
});
