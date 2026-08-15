import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const forbiddenPhrases = [
  'Pending Backlogs',
  'Running',
  'Approved',
  'Rejected',
  'Graph Stats',
  'Search graph node',
  'Loading artifacts',
  'Admin Workspace',
];

const filesToCheck = [
  'dashboard/dashboard-page.tsx',
  'artifacts/artifacts-page.tsx',
  'trap-graph/trap-graph-page.tsx',
  'skill-graph/skill-graph-page.tsx',
  'review-queue/review-queue-page.tsx',
  'review-detail/review-detail-page.tsx',
  'activity/activity-page.tsx',
  '../app/shell/app-shell.tsx',
];

describe('page localization regressions', () => {
  it('does not keep high-probability English UI residue in targeted files', () => {
    const offenders: string[] = [];

    for (const relativePath of filesToCheck) {
      const absolutePath = path.resolve(__dirname, relativePath);
      const content = readFileSync(absolutePath, 'utf8');

      for (const phrase of forbiddenPhrases) {
        if (content.includes(phrase)) {
          offenders.push(`${relativePath}: ${phrase}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
