import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const CONTEXT_ROOT = resolve(__dirname, '..');
const governanceReviewModule = resolve(CONTEXT_ROOT, 'governance-review/application/module.ts');
const candidateIngestionModule = resolve(CONTEXT_ROOT, 'candidate-ingestion/application/module.ts');

describe('backend-core boundary import guard', () => {
  it('review module does not depend on KnowledgeRepositoryPort directly', () => {
    const source = readFileSync(governanceReviewModule, 'utf8');
    expect(source).not.toContain('KnowledgeRepositoryPort');
    expect(source).toContain('KnowledgeWritePort');
  });

  it('candidate-ingestion module does not depend on QueuePorts directly', () => {
    const source = readFileSync(candidateIngestionModule, 'utf8');
    expect(source).not.toContain('QueuePorts');
    expect(source).toContain('JobRuntimePort');
    expect(source).toContain('KnowledgeWritePort');
  });

  it('candidate-ingestion module does not mark resolved before remote publish succeeds', () => {
    const source = readFileSync(candidateIngestionModule, 'utf8');
    expect(source).toContain(
      'const publishResult = await deps.knowledgeWrite.publishCandidateResult',
    );
    expect(source.indexOf('publishCandidateResult')).toBeLessThan(source.indexOf('markResolved'));
  });
});
