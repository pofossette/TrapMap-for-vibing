import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd(), 'src/lib');

describe('service boundary guard', () => {
  it('candidate services avoid full SkillShareer repos dependencies', () => {
    const files = [
      'candidates/services/query-service.ts',
      'candidates/services/submission-service.ts',
      'candidates/services/resolution-service.ts',
      'jobs/handlers/remediation-reactivation.ts',
    ];

    const violations = files
      .map((file) => {
        const source = readFileSync(resolve(ROOT, file), 'utf8');
        const hasFullRepos =
          source.includes("SkillShareerServices['repos']") ||
          source.includes('SkillShareerRepos;') ||
          source.includes('repos: SkillShareerRepos');
        return hasFullRepos ? file : null;
      })
      .filter((value): value is string => value !== null);

    expect(
      violations,
      violations.length > 0
        ? `These services depend on a full repo bag instead of narrow ports:\n${violations.map((file) => `  ${file}`).join('\n')}`
        : undefined,
    ).toEqual([]);
  });
});
