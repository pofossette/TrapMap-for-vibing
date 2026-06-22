import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const MODULES_DIR = resolve(process.cwd(), 'src/modules');

describe('backend-core boundary import guard', () => {
  it('review module does not depend on KnowledgeRepositoryPort directly', () => {
    const source = readFileSync(resolve(MODULES_DIR, 'governance-review.ts'), 'utf8');
    expect(source).not.toContain('KnowledgeRepositoryPort');
    expect(source).toContain('KnowledgeWritePort');
  });

  it('candidate-ingestion module does not depend on QueuePorts directly', () => {
    const source = readFileSync(resolve(MODULES_DIR, 'candidate-ingestion.ts'), 'utf8');
    expect(source).not.toContain('QueuePorts');
    expect(source).toContain('JobRuntimePort');
    expect(source).toContain('KnowledgeWritePort');
  });
});
