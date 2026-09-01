import { describe, expect, it } from 'vitest';

import type { ExperienceGeneSourceSnapshot } from '@trapmap/contracts';
import { sha256CanonicalJson } from '@trapmap/lib';
import { createPgExperienceGeneSourceLoaders } from '../src/experience-gene-snapshots.js';
import { createExperienceGeneQueryPool } from '../src/testing/experience-gene-query-pool.js';

describe('PostgreSQL experience gene snapshot loaders', () => {
  it('loads an eligible approved trap as an immutable snapshot', async () => {
    const row = {
      id: 'trap-1',
      shortcut: 'Queue retry storm',
      detail: 'Problem: retries fan out\nFix: claim a lease first',
      labels: ['queue'],
      scope: 'project',
      team_id: null,
      required_level: 2,
      revision_no: 3,
      remediation: null,
    };
    const { pool, queries } = createExperienceGeneQueryPool([
      { match: /knowledge_entries/, rows: [row] },
    ]);
    const snapshot = await createPgExperienceGeneSourceLoaders(pool).trap({
      sourceId: 'trap-1',
    });

    expect(snapshot).toEqual({
      kind: 'trap',
      sourceId: 'trap-1',
      revision: 3,
      sourceHash: sha256CanonicalJson({
        title: row.shortcut,
        text: row.detail,
        labels: row.labels,
      }),
      derivationUnitId: 'trap:trap-1:v3',
      title: 'Queue retry storm',
      labels: ['queue'],
      scope: 'project',
      teamId: null,
      requiredLevel: 2,
      text: row.detail,
      truncated: false,
    } satisfies ExperienceGeneSourceSnapshot);
    expect(queries[0]?.sql).toContain("lifecycle_state = 'approved'");
    expect(queries[0]?.sql).toContain("remediation->>'suppressedFromRetrieval'");
  });

  it('loads the requested artifact revision and bounded SKILL.md unit', async () => {
    const text = ['## MATCH', '- retries grow', '## STRATEGY', '- claim lease'].join('\n');
    const artifact = {
      id: 'artifact-1',
      title: 'Reliable queues',
      labels: ['queue'],
      scope: 'global',
      team_id: null,
      required_level: 1,
      lifecycle_state: 'approved',
      latest_revision: 4,
      remediation: null,
    };
    const revision = {
      revision_no: 4,
      source_hash: 'a'.repeat(64),
      files: [
        { path: 'references/ignored.md', content: 'ignore' },
        { path: 'SKILL.md', content: text },
      ],
    };
    const { pool, queries } = createExperienceGeneQueryPool([
      { match: /skill_artifacts/, rows: [artifact] },
      { match: /artifact_revisions/, rows: [revision] },
    ]);
    const snapshot = await createPgExperienceGeneSourceLoaders(pool).skillArtifact({
      artifactId: 'artifact-1',
      revision: 4,
      derivationUnitId: 'skill-md:v1',
    });

    expect(snapshot).toMatchObject({
      kind: 'skill-artifact',
      sourceId: 'artifact-1:skill-md:v1',
      revision: 4,
      sourceHash: revision.source_hash,
      artifactId: 'artifact-1',
      artifactRevision: 4,
      derivationUnitId: 'skill-md:v1',
      text,
      truncated: false,
    });
    expect(queries[1]?.params).toEqual(['artifact-1', 4]);
  });

  it('loads a current capsule with capsule-specific source provenance', async () => {
    const capsule = {
      capsule_id: 'capsule-1',
      artifact_id: 'artifact-1',
      revision_no: 4,
      source_hash: 'a'.repeat(64),
      content: 'Claim a queue lease before publishing.',
      situation: 'multiple publishers',
      problem: 'duplicate side effects',
      goal: 'one owner per work item',
      error_text: null,
      contextual_prefix: null,
      source_paths: ['SKILL.md'],
      labels: ['queue'],
      scope: 'project',
      required_level: 2,
      lifecycle_state: 'approved',
      artifact_title: 'Queue ownership',
      team_id: null,
    };
    const { pool } = createExperienceGeneQueryPool([
      { match: /skill_artifact_capsules/, rows: [capsule] },
    ]);
    const snapshot = await createPgExperienceGeneSourceLoaders(pool).skillCapsule({
      capsuleId: 'capsule-1',
    });

    expect(snapshot).toMatchObject({
      kind: 'skill-capsule',
      sourceId: 'capsule-1',
      revision: 4,
      artifactId: 'artifact-1',
      artifactRevision: 4,
      capsuleId: 'capsule-1',
      derivationUnitId: 'capsule-1',
      situation: 'multiple publishers',
      goal: 'one owner per work item',
      labels: ['queue'],
    });
    expect(snapshot?.sourceHash).toBe(
      sha256CanonicalJson({
        revisionSourceHash: capsule.source_hash,
        capsuleId: capsule.capsule_id,
        content: capsule.content,
        situation: capsule.situation,
        problem: capsule.problem,
        goal: capsule.goal,
        errorText: null,
        contextualPrefix: null,
      }),
    );
  });
});
