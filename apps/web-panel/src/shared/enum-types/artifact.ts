import type { SkillArtifact } from '@trapmap/contracts';

export type ArtifactQuery = {
  cursor?: string;
  lifecycleState?: string;
  limit?: number;
  scope?: string;
  requiredLevel?: number;
  search?: string;
};

export type ArtifactListResponse = {
  filteredTotal: number;
  items: SkillArtifact[];
  nextCursor: string | null;
  total: number;
};
