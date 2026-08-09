/**
 * Versioned snapshot schema for promptfoo suite parity.
 *
 * A `SuiteSnapshot` records the per-case judgment of one suite run so CI (and
 * the parity tests) can assert the promptfoo runner output stays stable without
 * relying on native execution code. The `cases` entries are the load-bearing
 * part and must be committed-output deterministic (sorted by `caseId`); the
 * `generatedAt` meta timestamp is informational only.
 */

import { z } from 'zod';

export const suiteSnapshotCaseSchema = z
  .object({
    caseId: z.string(),
    passed: z.boolean(),
  })
  .passthrough();

export const suiteSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  suiteId: z.string(),
  tier: z.enum(['smoke', 'core']),
  generatedAt: z.string(),
  command: z.string(),
  cases: z.array(suiteSnapshotCaseSchema),
});

export type SuiteSnapshotCase = z.infer<typeof suiteSnapshotCaseSchema>;

export interface SuiteSnapshot {
  schemaVersion: 1;
  suiteId: string;
  tier: 'smoke' | 'core';
  generatedAt: string;
  command: string;
  cases: Array<{ caseId: string; passed: boolean; [k: string]: unknown }>;
}
