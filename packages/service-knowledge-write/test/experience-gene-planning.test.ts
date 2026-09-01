import { describe, expect, it } from 'vitest';

import { experienceGeneDerivationTaskPayloadSchema } from '@trapmap/contracts';
import { sha256CanonicalJson } from '@trapmap/lib';
import { createExperienceGeneDerivationPlanner } from '../src/experience-gene-planning.js';
import { createExperienceGeneQueryPool } from '../src/testing/experience-gene-query-pool.js';

const event = {
  name: 'knowledge.approved',
  entryId: 'trap-1',
  previousState: 'agent-pass',
  nextState: 'approved',
  actorId: 'user-1',
  reason: 'approved',
  timestamp: '2026-08-26T00:00:00.000Z',
} as const;

describe('experience gene derivation planning', () => {
  it('plans one deterministic task for an approved trap', async () => {
    const { pool } = createExperienceGeneQueryPool([
      {
        match: /knowledge_entries/,
        rows: [
          {
            id: 'trap-1',
            shortcut: 'Queue retry storm',
            detail: 'Problem: retries fan out\nFix: claim a lease first',
            labels: ['queue'],
            scope: 'project',
            team_id: null,
            required_level: 2,
            revision_no: 3,
          },
        ],
      },
    ]);
    const tasks = await createExperienceGeneDerivationPlanner(pool).planFromLifecycle(event);

    expect(tasks).toHaveLength(1);
    const parsed = experienceGeneDerivationTaskPayloadSchema.parse(tasks[0]);
    expect(parsed.requestId).toBe('knowledge.approved:trap-1:v3');
    expect(parsed.source.sourceRevision).toBe(3);
    expect(parsed.derivationUnitId).toBe('trap:trap-1:v3');
    expect(parsed.snapshotHash).toBe(
      sha256CanonicalJson({
        kind: 'trap',
        sourceId: 'trap-1',
        revision: 3,
        sourceHash: parsed.source.sourceHash,
        derivationUnitId: 'trap:trap-1:v3',
        title: 'Queue retry storm',
        labels: ['queue'],
        scope: 'project',
        teamId: null,
        requiredLevel: 2,
        text: 'Problem: retries fan out\nFix: claim a lease first',
        truncated: false,
      }),
    );
  });

  it('plans one bounded SKILL.md unit for an approved artifact revision', async () => {
    const text = ['## MATCH', '- retries grow', '## STRATEGY', '- claim lease'].join('\n');
    const { pool } = createExperienceGeneQueryPool([
      {
        match: /SELECT sa\.id AS artifact_id/,
        rows: [
          {
            artifact_id: 'artifact-1',
            title: 'Reliable queues',
            labels: ['queue'],
            scope: 'global',
            team_id: null,
            required_level: 1,
            revision_no: 4,
            source_hash: 'a'.repeat(64),
            files: [{ path: 'SKILL.md', content: text }],
          },
        ],
      },
    ]);
    const tasks = await createExperienceGeneDerivationPlanner(pool).planFromLifecycle({
      ...event,
      name: 'artifact.approved',
      entryId: null,
      artifactId: 'artifact-1',
    });

    const parsed = experienceGeneDerivationTaskPayloadSchema.parse(tasks[0]);
    expect(parsed.requestId).toBe('artifact.approved:artifact-1:skill-md:v1:v4');
    expect(parsed.source.sourceId).toBe('artifact-1:skill-md:v1');
    expect(parsed.snapshotHash).toBe(
      sha256CanonicalJson({
        kind: 'skill-artifact',
        sourceId: 'artifact-1:skill-md:v1',
        revision: 4,
        sourceHash: 'a'.repeat(64),
        artifactId: 'artifact-1',
        artifactRevision: 4,
        derivationUnitId: 'skill-md:v1',
        title: 'Reliable queues',
        labels: ['queue'],
        scope: 'global',
        teamId: null,
        requiredLevel: 1,
        text,
        truncated: false,
      }),
    );
  });

  it('plans one task per current derived capsule', async () => {
    const { pool } = createExperienceGeneQueryPool([
      {
        match: /skill_artifact_capsules/,
        rows: [
          {
            capsule_id: 'capsule-1',
            artifact_id: 'artifact-1',
            revision_no: 4,
            source_hash: 'a'.repeat(64),
            content: 'Claim the lease.',
            situation: 'many publishers',
            problem: 'duplicate effects',
            goal: 'one owner',
            error_text: null,
            contextual_prefix: null,
            source_paths: ['SKILL.md'],
            labels: ['queue'],
            scope: 'project',
            required_level: 2,
            artifact_title: 'Reliable queues',
          },
        ],
      },
    ]);
    const tasks = await createExperienceGeneDerivationPlanner(pool).planFromLifecycle({
      ...event,
      name: 'artifact.approved',
      entryId: null,
      artifactId: 'artifact-1',
    });

    expect(tasks).toHaveLength(1);
    expect(experienceGeneDerivationTaskPayloadSchema.parse(tasks[0]).source.sourceId).toBe(
      'capsule-1',
    );
  });

  it('does not derive from rejected sources', async () => {
    const { pool } = createExperienceGeneQueryPool();
    const tasks = await createExperienceGeneDerivationPlanner(pool).planFromLifecycle({
      ...event,
      nextState: 'rejected',
    });

    expect(tasks).toEqual([]);
  });
});
