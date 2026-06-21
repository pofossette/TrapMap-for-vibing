import type { CandidateSubmission, DuplicateCase } from '@trapmap/contracts';

export interface CandidateSubmissionRecord extends CandidateSubmission {}

export interface DuplicateCaseRecord extends DuplicateCase {}

export interface EntityLineageRecord {
  id: string;
  candidateId: string;
  relationshipType: 'published_as' | 'merged_into';
  sourceType: 'candidate' | 'trap' | 'skill';
  sourceId: string;
  targetType: 'trap' | 'skill';
  targetId: string;
  createdAt: string;
  notes: string | null;
}
