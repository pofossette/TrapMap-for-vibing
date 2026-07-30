import { describe, expect, it } from 'vitest';

import { buildBackfillReport, resolveDatabaseUrl } from './run.js';

describe('legacy snapshot backfill operator entrypoint', () => {
  it('rejects when no database URL is available', () => {
    expect(() => resolveDatabaseUrl({})).toThrow('DATABASE_URL');
  });

  it('resolves DATABASE_URL from environment', () => {
    const url = resolveDatabaseUrl({ DATABASE_URL: 'postgres://localhost/test' });
    expect(url).toBe('postgres://localhost/test');
  });

  it('prefers TRAPMAP_DATABASE_URL over DATABASE_URL', () => {
    const url = resolveDatabaseUrl({
      TRAPMAP_DATABASE_URL: 'postgres://localhost/trapmap',
      DATABASE_URL: 'postgres://localhost/other',
    });
    expect(url).toBe('postgres://localhost/trapmap');
  });

  it('formats a backfill report with bucket evidence', () => {
    const report = buildBackfillReport({
      succeeded: true,
      sourceCounts: {
        identityAudit: {
          users: 1,
          teams: 1,
          memberships: 1,
          accessKeys: 1,
          sessions: 1,
          auditEvents: 1,
        },
        knowledgeEntries: 2,
        skillArtifacts: 1,
        artifactFilePayloads: 0,
        candidateIngestion: { candidateSubmissions: 1, duplicateCases: 1, entityLineage: 1 },
        governance: { feedbackQueue: 1, conflicts: 1 },
      },
      evidence: [
        {
          owner: 'identity/audit',
          bucket: 'users',
          sourceCount: 1,
          destinationCount: 1,
          inserted: 1,
          skipped: 0,
          verified: true,
          result: null,
        },
      ],
      buckets: {} as never,
    });
    expect(report).toContain('succeeded: true');
    expect(report).toContain('identity/audit');
    expect(report).toContain('users');
    expect(report).toContain('inserted=1');
    expect(report).toContain('verified=true');
  });

  it('formats a failed report', () => {
    const report = buildBackfillReport({
      succeeded: false,
      sourceCounts: {
        identityAudit: {
          users: 0,
          teams: 0,
          memberships: 0,
          accessKeys: 0,
          sessions: 0,
          auditEvents: 0,
        },
        knowledgeEntries: 0,
        skillArtifacts: 0,
        artifactFilePayloads: 0,
        candidateIngestion: { candidateSubmissions: 0, duplicateCases: 0, entityLineage: 0 },
        governance: { feedbackQueue: 0, conflicts: 0 },
      },
      evidence: [],
      buckets: {} as never,
    });
    expect(report).toContain('succeeded: false');
  });
});
