import { describe, expect, it, vi } from 'vitest';

import type { Boundary } from '@trapmap/contracts';
import type { SkillArtifactRecord } from '../store.js';
import { nowIso } from '../store.js';
import { PgArtifactRepository } from './pg-repository.js';

function createBoundary(): Boundary {
  return {
    context: ['frontend'],
    versions: [{ package: 'react', range: '>=18' }],
    prerequisites: [{ description: 'node 20', kind: 'environment', required: true }],
    signals: [{ pattern: 'useEffect', kind: 'keyword' }],
    exclusions: [{ description: 'ssr', kind: 'platform' }],
    evidence: [{ kind: 'documentation', identifier: 'react-docs' }],
  };
}

function createArtifact(): SkillArtifactRecord {
  const now = nowIso();
  return {
    id: 'artifact_round4_1',
    teamId: null,
    scope: 'global',
    labels: ['round4'],
    title: 'Round 4 Artifact',
    slug: 'round4-artifact',
    requiredLevel: 2,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      sourceHash: 'hash-1',
      files: [
        {
          path: 'SKILL.md',
          kind: 'skill-markdown',
          sha256: 'sha-skill',
          sizeBytes: 10,
          mediaType: 'text/markdown',
          source: 'SKILL.md',
          includeInDerivation: true,
          activationOnly: false,
        },
        {
          path: 'scripts/run.sh',
          kind: 'script',
          sha256: 'sha-script',
          sizeBytes: 20,
          mediaType: 'text/x-shellscript',
          source: 'scripts/',
          includeInDerivation: false,
          activationOnly: true,
        },
      ],
      submittedAt: now,
      submittedByUserId: 'user_1',
      scriptDescriptors: [
        {
          path: 'scripts/run.sh',
          sha256: 'sha-script',
          capability: 'exec',
          argsSchemaSummary: '{}',
          sideEffectSummary: 'writes files',
          defaultPolicy: 'manual',
        },
      ],
      derived: {
        profile: {
          artifactId: 'artifact_round4_1',
          revision: 1,
          sourceHash: 'hash-1',
          title: 'Round 4 Artifact',
          summary: 'Summary',
          keywords: ['round4'],
          referencePaths: ['docs/ref.md'],
          contentHash: 'profile-hash',
        },
        capsules: [
          {
            capsuleId: 'capsule_round4_1',
            artifactId: 'artifact_round4_1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Capsule content',
            situation: 'ops',
            problem: 'problem',
            goal: 'goal',
            errorText: null,
            labels: ['round4'],
            scope: 'global',
            requiredLevel: 2,
          },
        ],
        clientManifest: {
          artifactId: 'artifact_round4_1',
          revision: 1,
          references: [
            { path: 'docs/ref.md', sha256: 'sha-ref', sizeBytes: 1, mediaType: 'text/markdown' },
          ],
          assets: [
            { path: 'assets/a.txt', sha256: 'sha-asset', sizeBytes: 1, mediaType: 'text/plain' },
          ],
          scripts: [
            {
              path: 'scripts/run.sh',
              sha256: 'sha-script',
              capability: 'exec',
              argsSchemaSummary: '{}',
              sideEffectSummary: 'writes files',
              defaultPolicy: 'manual',
            },
          ],
          sourceHash: 'hash-1',
        },
        sourceHash: 'hash-1',
        derivedAt: now,
      },
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub_1',
      latestSubmittedAt: now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    agentReview: {
      status: 'agent-pass',
      duplicateRisk: 'low',
      correctnessRisk: 'medium',
      completenessRisk: 'low',
      checkedAt: now,
      notes: ['looks good'],
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: createBoundary(),
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: {
      maintainerUserId: 'user_maintainer_1',
      maintainerHandle: 'alice',
      maintainerLevel: 3,
      reviewBy: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

describe('PgArtifactRepository Round 4 structured sync', () => {
  it('insert writes structured artifact sub-tables alongside JSONB cache columns', async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      return { rows: [] };
    });
    const pool = {
      query,
      connect: vi.fn(async () => ({ query, release: vi.fn() })),
    } as any;

    const repo = new PgArtifactRepository(pool);
    const artifact = createArtifact();
    artifact.history = [artifact.latestRevision];

    await repo.insert(artifact);

    expect(calls.some((call) => call.sql.includes('INSERT INTO skill_artifact_files'))).toBe(true);
    expect(
      calls.some((call) => call.sql.includes('INSERT INTO skill_artifact_script_descriptors')),
    ).toBe(true);
    expect(calls.some((call) => call.sql.includes('INSERT INTO skill_artifact_profiles'))).toBe(
      true,
    );
    expect(calls.some((call) => call.sql.includes('INSERT INTO skill_artifact_capsules'))).toBe(
      true,
    );
    expect(
      calls.some((call) => call.sql.includes('INSERT INTO skill_artifact_client_manifests')),
    ).toBe(true);
    expect(
      calls.some((call) => call.sql.includes('INSERT INTO skill_artifact_manifest_scripts')),
    ).toBe(true);
    expect(
      calls.some((call) => call.sql.includes('INSERT INTO skill_artifact_boundary_contexts')),
    ).toBe(true);
    expect(
      calls.some((call) => call.sql.includes('INSERT INTO skill_artifact_maintenance_assignments')),
    ).toBe(true);
    expect(
      calls.some((call) => call.sql.includes('INSERT INTO skill_artifact_agent_reviews')),
    ).toBe(true);
  });
});
