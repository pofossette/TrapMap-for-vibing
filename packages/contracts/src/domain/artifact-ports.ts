import type { SkillArtifact, SkillArtifactDerived, SkillArtifactRevision } from './artifacts.js';
import type { LifecycleState } from './common.js';

export interface ArtifactIndexingEntry {
  id: string;
  teamId: string | null;
  scope: SkillArtifact['scope'];
  labels: string[];
  title: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  revision: number;
  derived: SkillArtifactDerived | null;
}

export interface ArtifactIndexingPage {
  entries: ArtifactIndexingEntry[];
  nextOffset: number | null;
}

export interface ArtifactReadProjection {
  getById(artifactId: string): Promise<SkillArtifact | null>;
  getIndexingEntry(artifactId: string): Promise<ArtifactIndexingEntry | null>;
  listIndexingEntries(input: { offset: number; limit: number }): Promise<ArtifactIndexingPage>;
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
