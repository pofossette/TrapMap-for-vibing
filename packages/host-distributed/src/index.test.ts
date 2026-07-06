import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SERVICE_ENTRYPOINTS = [
  'src/gateway/index.ts',
  'src/identity-access/index.ts',
  'src/knowledge-read/index.ts',
  'src/knowledge-write/index.ts',
  'src/candidate-ingestion/index.ts',
  'src/governance-review/index.ts',
  'src/job-runtime/index.ts',
];

describe('host-distributed service entrypoints', () => {
  it('export service-specific bootstrap names instead of a shared start symbol', async () => {
    const root = path.resolve(import.meta.dirname, '..');

    for (const file of SERVICE_ENTRYPOINTS) {
      const source = await readFile(path.join(root, file), 'utf-8');
      expect(source).not.toContain('export async function start(');
      expect(source).toMatch(/export async function start[A-Z][A-Za-z]+Service\(/);
    }
  });

  it('dispatches through the renamed service-specific bootstrap exports', async () => {
    const root = path.resolve(import.meta.dirname, '..');
    const source = await readFile(path.join(root, 'src/index.ts'), 'utf-8');

    expect(source).toContain('startGatewayService');
    expect(source).toContain('startIdentityAccessService');
    expect(source).toContain('startKnowledgeReadService');
    expect(source).toContain('startKnowledgeWriteService');
    expect(source).toContain('startCandidateIngestionService');
    expect(source).toContain('startGovernanceReviewService');
    expect(source).toContain('startJobRuntimeService');
    expect(source).not.toContain('const { start } = await import(');
  });
});
