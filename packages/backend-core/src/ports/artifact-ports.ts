import type { LifecycleState, SkillArtifact, SkillArtifactRevision } from '@trapmap/contracts';

export interface ArtifactReadProjection {
  getById(artifactId: string): Promise<SkillArtifact | null>;
  listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  }): Promise<SkillArtifact[]>;
  listForRetrieval(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  }): Promise<SkillArtifact[]>;
  history(artifactId: string): Promise<SkillArtifactRevision[]>;
  exportArtifacts(input: Record<string, unknown>): Promise<SkillArtifact[]>;
  reviewQueue(): Promise<SkillArtifact[]>;
}
