import type {
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
  SkillArtifactRecord,
} from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';

const userId = 'user_1';
const createdAt = nowIso();

export function createMockArtifact(overrides: {
  id: string;
  teamId: string | null;
  scope: 'global' | 'project';
  lifecycleState: 'approved' | 'submitted' | 'agent-pass' | 'rejected';
  requiredLevel: number;
  title: string;
  labels: string[];
  capsules: DerivedSkillCapsuleRecord[];
  profile?: DerivedSkillProfileRecord | null;
}): SkillArtifactRecord {
  return {
    id: overrides.id,
    teamId: overrides.teamId,
    scope: overrides.scope,
    labels: overrides.labels,
    title: overrides.title,
    slug: overrides.title.toLowerCase().replace(/\s+/g, '-'),
    requiredLevel: overrides.requiredLevel,
    lifecycleState: overrides.lifecycleState,
    ownerUserId: userId,
    latestRevision: {
      revision: 1,
      sourceHash: 'a'.repeat(64),
      files: [],
      submittedAt: createdAt,
      submittedByUserId: userId,
      scriptDescriptors: [],
      derived: {
        profile: overrides.profile ?? {
          artifactId: overrides.id,
          revision: 1,
          sourceHash: 'a'.repeat(64),
          title: overrides.title,
          summary: `Summary for ${overrides.title}`,
          keywords: overrides.labels,
          referencePaths: [],
          contentHash: 'b'.repeat(64),
        },
        capsules: overrides.capsules,
        clientManifest: null,
        sourceHash: 'a'.repeat(64),
        derivedAt: createdAt,
      },
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createMockCapsule(overrides: {
  capsuleId: string;
  artifactId: string;
  situation: string | null;
  problem: string | null;
  goal: string | null;
  labels: string[];
  scope: 'global' | 'project';
  requiredLevel: number;
  content?: string;
  contextualPrefix?: string;
}): DerivedSkillCapsuleRecord {
  return {
    capsuleId: overrides.capsuleId,
    artifactId: overrides.artifactId,
    revision: 1,
    sourcePaths: ['SKILL.md'],
    content: overrides.content ?? `Content for ${overrides.problem ?? overrides.capsuleId}`,
    situation: overrides.situation,
    problem: overrides.problem,
    goal: overrides.goal,
    errorText: null,
    ...(overrides.contextualPrefix !== undefined
      ? { contextualPrefix: overrides.contextualPrefix }
      : {}),
    labels: overrides.labels,
    scope: overrides.scope,
    requiredLevel: overrides.requiredLevel,
  };
}
