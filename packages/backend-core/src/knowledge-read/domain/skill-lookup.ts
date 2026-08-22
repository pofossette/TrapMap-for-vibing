import type { RetrievalMatch, SkillLookupResultItem, SkillSourceKind } from '@trapmap/contracts';

export interface SkillLookupArtifactMeta {
  slug: string;
  sourceKind: SkillSourceKind;
  title?: string;
}

export function toSkillLookupMatches(
  matches: RetrievalMatch[],
  artifactMetaByEntryId: ReadonlyMap<string, SkillLookupArtifactMeta>,
): SkillLookupResultItem[] {
  const rankedMatches = [...matches].sort((left, right) => right.score - left.score);
  const matchesByArtifactId = new Map<string, RetrievalMatch>();

  for (const match of rankedMatches) {
    if (!artifactMetaByEntryId.has(match.entryId) || matchesByArtifactId.has(match.entryId)) {
      continue;
    }
    matchesByArtifactId.set(match.entryId, match);
  }

  return [...matchesByArtifactId.entries()].map(([artifactId, match]) => {
    const meta = artifactMetaByEntryId.get(artifactId);
    if (!meta) {
      throw new Error(`Artifact metadata is missing for ${artifactId}`);
    }

    return {
      artifactId,
      title: meta.title ?? match.shortcut,
      slug: meta.slug,
      labels: match.labels,
      scope: match.scope,
      requiredLevel: match.requiredLevel,
      sourceKind: meta.sourceKind,
      score: match.score,
      reason: match.reason,
    };
  });
}
