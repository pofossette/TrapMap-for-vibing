import type { ConflictRelation } from '@trapmap/contracts';
import type { GraphIndexDocumentRecord } from '../indexing/graph-lite/documents.js';
import type {
  AccessKeyRecord,
  ArtifactFilePayloadRecord,
  AuditEventRecord,
  CandidateSubmissionRecord,
  DuplicateCaseRecord,
  EntityLineageRecord,
  FeedbackQueueRecord,
  KnowledgeRecord,
  MembershipRecord,
  SessionRecord,
  SkillArtifactRecord,
  TeamRecord,
  UserRecord,
} from './types/index.js';

export interface StoreData {
  counters: Record<string, number>;
  users: UserRecord[];
  teams: TeamRecord[];
  memberships: MembershipRecord[];
  accessKeys: AccessKeyRecord[];
  sessions: SessionRecord[];
  /** @deprecated Phase 62: Use knowledge_entries table via KnowledgeRepository. */
  knowledgeEntries: KnowledgeRecord[];
  auditEvents: AuditEventRecord[];
  /** @deprecated Phase 63: Use skill_artifacts table via ArtifactRepository. */
  skillArtifacts: SkillArtifactRecord[];
  artifactFilePayloads: ArtifactFilePayloadRecord[];
  /** @deprecated Phase 61: Use candidates table via CandidateRepository. */
  candidateSubmissions: CandidateSubmissionRecord[];
  /** @deprecated Phase 100-02: Use DuplicateRepository via repos.duplicate. */
  duplicateCases: DuplicateCaseRecord[];
  entityLineage: EntityLineageRecord[];
  graphIndexDocuments: GraphIndexDocumentRecord[];
  conflicts: ConflictRelation[];
  feedbackQueue: FeedbackQueueRecord[];
}

const EMPTY_STORE: StoreData = {
  counters: {},
  users: [],
  teams: [],
  memberships: [],
  accessKeys: [],
  sessions: [],
  knowledgeEntries: [],
  auditEvents: [],
  skillArtifacts: [],
  artifactFilePayloads: [],
  candidateSubmissions: [],
  duplicateCases: [],
  entityLineage: [],
  graphIndexDocuments: [],
  conflicts: [],
  feedbackQueue: [],
};

export function createEmptyStoreData(): StoreData {
  return JSON.parse(JSON.stringify(EMPTY_STORE)) as StoreData;
}
