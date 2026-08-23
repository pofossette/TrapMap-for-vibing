import type { SkillArtifact } from '@trapmap/contracts';

import type { ArtifactQuery } from '@trapmap/web-panel/shared/enum-types';

export type ArtifactPage = {
  filteredTotal: number;
  items: SkillArtifact[];
  nextCursor: string | null;
  total: number;
};

function matchesSearch(artifact: SkillArtifact, search: string): boolean {
  if (search.length === 0) return true;

  return [artifact.id, artifact.title, artifact.slug, ...artifact.labels].some((value) =>
    value.toLowerCase().includes(search),
  );
}

function parseCursor(cursor: string): number {
  if (!/^[0-9]{1,128}$/.test(cursor)) {
    throw new Error('Invalid artifact cursor');
  }

  const offset = Number.parseInt(cursor, 10);
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new Error('Invalid artifact cursor');
  }

  return offset;
}

export function applyArtifactQuery(
  artifacts: readonly SkillArtifact[],
  query?: ArtifactQuery,
): ArtifactPage {
  const search = query?.search?.trim().toLowerCase() ?? '';
  const lifecycleState = query?.lifecycleState ?? 'all';
  const scope = query?.scope ?? 'all';
  const requiredLevel = query?.requiredLevel;

  const filtered = artifacts.filter((artifact) => {
    if (lifecycleState !== 'all' && artifact.lifecycleState !== lifecycleState) return false;
    if (scope !== 'all' && artifact.scope !== scope) return false;
    if (requiredLevel !== undefined && artifact.requiredLevel !== requiredLevel) return false;
    return matchesSearch(artifact, search);
  });

  const sorted = [...filtered].sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
  );

  const limit = query?.limit && query.limit > 0 ? Math.min(query.limit, 100) : 20;
  const offset = query?.cursor ? parseCursor(query.cursor) : 0;

  return {
    items: sorted.slice(offset, offset + limit),
    filteredTotal: sorted.length,
    nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
    total: artifacts.length,
  };
}
