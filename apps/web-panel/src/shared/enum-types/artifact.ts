import type { SkillArtifact } from '@trapmap/contracts';

export type ArtifactQuery = {
  lifecycleState?: string;
  scope?: string;
  requiredLevel?: number;
  search?: string;
};

export type ArtifactListResponse = {
  items: SkillArtifact[];
  total: number;
};
