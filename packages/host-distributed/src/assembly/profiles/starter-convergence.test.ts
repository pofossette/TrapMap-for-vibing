/**
 * Phase 3 golden evidence: starter convergence smoke.
 *
 * Every `start<X>Service()` thin caller must keep the legacy exported symbol
 * (the index.test.ts contract) while delegating to the distributed profile —
 * i.e. it must not re-implement the loadServiceConfig → createServiceDatabase
 * → createServer sequence at module top anymore.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const STARTER_FILES: readonly { file: string; symbol: string }[] = [
  { file: 'src/gateway/index.ts', symbol: 'startGatewayService' },
  { file: 'src/identity-access/index.ts', symbol: 'startIdentityAccessService' },
  { file: 'src/knowledge-read/index.ts', symbol: 'startKnowledgeReadService' },
  { file: 'src/knowledge-write/index.ts', symbol: 'startKnowledgeWriteService' },
  { file: 'src/candidate-ingestion/index.ts', symbol: 'startCandidateIngestionService' },
  { file: 'src/governance-review/index.ts', symbol: 'startGovernanceReviewService' },
  { file: 'src/job-runtime/index.ts', symbol: 'startJobRuntimeService' },
  { file: 'src/cron-scheduler/start.ts', symbol: 'startCronService' },
];

describe('host-distributed starter convergence', () => {
  it.each(STARTER_FILES)(
    '$symbol delegates to the distributed profile',
    async ({ file, symbol }) => {
      const root = path.resolve(import.meta.dirname, '..', '..', '..');
      const source = await readFile(path.join(root, file), 'utf-8');

      expect(source).toMatch(`export async function ${symbol}(`);
      // thin caller delegates to the shared boot closure
      expect(source).toContain('startDistributedService');
      expect(source).toContain("from '../assembly/profiles/distributed.js'");
      // legacy boilerplate must have moved into the profile/node layer
      // (assert on the actual call sites, not comment prose)
      expect(source).not.toContain('createServiceDatabase(');
      expect(source).not.toContain('loadServiceConfig(');
      expect(source).not.toContain('await server.start();');
    },
  );
});
