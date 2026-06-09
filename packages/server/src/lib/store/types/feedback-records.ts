import type { FeedbackProblemType } from '@trapmap/contracts';

export interface FeedbackQueueRecord {
  id: string;
  entryId: string;
  entryType: 'trap' | 'skill';
  problemType: FeedbackProblemType;
  description: string;
  context: string | null;
  querySeed: string | null;
  customAnswers: Array<{ prompt: string; answer: string }> | null;
  submittedAt: string;
  submittedByUserId: string;
  submittedByHandle: string;
  status: 'new' | 'triaged' | 'resolved' | 'dismissed';
  adminNotes: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  triggeredTransition: string | null;
  remediationStatus?: 'pending-human-review' | 'in-remediation' | 'ready-to-reindex' | null;
  remediationOpenedAt?: string | null;
  remediationOpenedByUserId?: string | null;
  remediationResolvedAt?: string | null;
  remediationResolvedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}
