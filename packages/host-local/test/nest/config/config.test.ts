import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../src/nest/config/config.js';

const EXPERIENCE_GENE_MODE = 'TRAPMAP_EXPERIENCE_GENE_MODE';
const EXPERIENCE_GENES_MODE = 'TRAPMAP_EXPERIENCE_GENES_MODE';

describe('host-local configuration', () => {
  afterEach(() => {
    delete process.env[EXPERIENCE_GENE_MODE];
    delete process.env[EXPERIENCE_GENES_MODE];
  });

  it('defaults Experience Gene rollout to off and rejects unknown modes safely', () => {
    delete process.env[EXPERIENCE_GENE_MODE];
    expect(loadConfig().experienceGeneMode).toBe('off');

    process.env[EXPERIENCE_GENE_MODE] = 'unexpected';
    expect(loadConfig().experienceGeneMode).toBe('off');

    process.env[EXPERIENCE_GENE_MODE] = 'shadow';
    expect(loadConfig().experienceGeneMode).toBe('shadow');
  });

  it('defaults Experience Gene retrieval rollout to off', () => {
    delete process.env[EXPERIENCE_GENES_MODE];
    expect(loadConfig().experienceGenesMode).toBe('off');

    process.env[EXPERIENCE_GENES_MODE] = 'serve';
    expect(loadConfig().experienceGenesMode).toBe('serve');
  });
});
