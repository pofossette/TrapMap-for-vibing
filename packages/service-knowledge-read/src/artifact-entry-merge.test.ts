import { createRetrievalArtifactFixture } from '@trapmap/contracts';
import { describe, expect, it } from 'vitest';

import {
  artifactToRetrievalEntry,
  mergeArtifactsIntoRetrievalPool,
} from './artifact-entry-merge.js';
import type { SkillArtifactRecord } from './store.js';

function artifact(
  id: string,
  options: { version?: string; title?: string; summary?: string } = {},
): SkillArtifactRecord {
  const fixture = createRetrievalArtifactFixture(id);
  return {
    ...fixture,
    title: options.title ?? `Artifact ${id}`,
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    latestRevision: {
      ...fixture.latestRevision,
      ...(options.version !== undefined ? { version: options.version } : {}),
      derived: {
        ...fixture.latestRevision.derived,
        profile: {
          ...fixture.latestRevision.derived.profile,
          summary: options.summary ?? 'Test summary',
        },
      },
    },
  } as unknown as SkillArtifactRecord; // lib type gap: fixture subset completed with the entry-view fields
}

describe('artifact → retrieval entry merge (cron version linkage)', () => {
  it('maps a versioned artifact into the entry shape with version/revision preserved', () => {
    const entry = artifactToRetrievalEntry(artifact('artifact-1', { version: '18.2.0' }));

    expect(entry.id).toBe('artifact-1');
    expect(entry.shortcut).toBe('Artifact artifact-1');
    expect(entry.detail).toContain('Test summary');
    expect(entry.labels).toEqual(['test']);
    expect(entry.teamId).toBeNull();
    expect(entry.scope).toBe('global');
    expect(entry.requiredLevel).toBe(0);
    expect(entry.lifecycleState).toBe('approved');
    expect(entry.latestRevision.version).toBe('18.2.0');
    expect(entry.latestRevision.revision).toBe(1);
    expect(entry.decayMeta?.freshnessType).toBe('versioned');
  });

  it('keeps unversioned artifacts evergreen (neutral ×1 decay)', () => {
    const entry = artifactToRetrievalEntry(artifact('artifact-2'));

    expect(entry.latestRevision.version).toBeUndefined();
    expect(entry.decayMeta?.freshnessType).toBe('evergreen');
  });

  it('builds detail from derived profile and capsule content', () => {
    const fixture = createRetrievalArtifactFixture('artifact-3');
    const withCapsules: SkillArtifactRecord = {
      ...artifact('artifact-3', { version: '1.0.0' }),
      latestRevision: {
        ...fixture.latestRevision,
        derived: {
          ...fixture.latestRevision.derived,
          profile: {
            ...fixture.latestRevision.derived.profile,
            summary: 'Profile summary',
            description: 'Profile description',
          },
          capsules: [
            {
              capsuleId: 'capsule-1',
              artifactId: 'artifact-3',
              revision: 1,
              sourcePaths: ['SKILL.md'],
              content: 'Capsule content body',
              situation: null,
              problem: null,
              goal: null,
              errorText: null,
              labels: [],
              scope: 'global',
              requiredLevel: 0,
            },
          ],
        },
      },
    };

    const entry = artifactToRetrievalEntry(withCapsules);

    expect(entry.detail).toContain('Profile summary');
    expect(entry.detail).toContain('Profile description');
    expect(entry.detail).toContain('Capsule content body');
  });

  it('merges artifacts after entries and dedupes by id (entries win)', () => {
    const entryArtifact = artifactToRetrievalEntry(artifact('shared-id', { version: '2.0.0' }));
    const entry = {
      ...entryArtifact,
      shortcut: 'existing entry shortcut',
    };

    const merged = mergeArtifactsIntoRetrievalPool(
      [entry],
      [artifact('shared-id'), artifact('a2')],
    );

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(entry);
    expect(merged[1]?.id).toBe('a2');
    expect(merged.find((item) => item.id === 'shared-id')?.shortcut).toBe(
      'existing entry shortcut',
    );
  });
});
