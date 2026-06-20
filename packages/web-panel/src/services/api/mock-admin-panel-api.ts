import type { ReviewDecisionRequest, ReviewQueueResponse } from '@trapmap/contracts';

import type {
  ActivityFeedResponse,
  AdminPanelApiContract,
  AdminPanelSession,
  ManualJsonEditInput,
  ReviewArtifactFile,
  ReviewDetailResponse,
  RuntimeOverviewResponse,
  SessionAccount,
} from '@trapmap/web-panel/shared/types/admin-panel';

const mockRuntimeOverview: RuntimeOverviewResponse = {
  deploymentProfile: 'team-monolith',
  buildId: 'web-panel-dev',
  lastHealthCheckAt: '2026-06-19T10:24:00.000Z',
  pendingReviewCount: 18,
  failedJobsCount: 2,
  throughputPerHour: 124,
  incidents: ['Schema drift detected in candidate-ingestion.'],
  services: [
    {
      name: 'gateway',
      status: 'healthy',
      detail: 'Serving requests normally.',
      lastCheckedAt: '2026-06-19T10:24:00.000Z',
      version: '1.0.0',
    },
    {
      name: 'governance',
      status: 'degraded',
      detail: 'Backlog elevated but processing.',
      lastCheckedAt: '2026-06-19T10:24:00.000Z',
      version: '1.0.0',
    },
  ],
  workload: [
    { label: 'Pending Reviews', value: 18 },
    { label: 'Candidate Backlog', value: 7 },
    { label: 'Failed Jobs', value: 2 },
  ],
};

const mockReviewQueue: ReviewQueueResponse = {
  items: [
    {
      entry: {
        id: 'rev-201',
        teamId: null,
        scope: 'global',
        labels: ['runtime', 'governance'],
        shortcut: 'Runtime candidate with schema drift',
        detail: 'Candidate payload requires manual inspection before approval.',
        requiredLevel: 4,
        lifecycleState: 'submitted',
        owner: { id: 'actor-owner', handle: 'ops-owner', securityLevel: 4 },
        latestRevision: {
          revision: 1,
          submittedAt: '2026-06-19T10:20:00.000Z',
          submittedBy: { id: 'actor-submitter', handle: 'candidate-bot', securityLevel: 3 },
          shortcut: 'Runtime candidate with schema drift',
          detail: 'Candidate payload requires manual inspection before approval.',
          labels: ['runtime', 'governance'],
          reviewNotes: [],
        },
        history: [
          {
            revision: 1,
            submittedAt: '2026-06-19T10:20:00.000Z',
            submittedBy: { id: 'actor-submitter', handle: 'candidate-bot', securityLevel: 3 },
            shortcut: 'Runtime candidate with schema drift',
            detail: 'Candidate payload requires manual inspection before approval.',
            labels: ['runtime', 'governance'],
            reviewNotes: [],
          },
        ],
        metadata: {
          scopeLabel: 'project-knowledge',
          submissionCount: 1,
          resubmissionCount: 0,
          revisionCount: 1,
          latestSubmissionId: 'submission-201',
          latestSubmittedAt: '2026-06-19T10:20:00.000Z',
          latestReviewedAt: null,
          latestDecision: null,
        },
        latestSubmission: {
          id: 'submission-201',
          revision: 1,
          submittedAt: '2026-06-19T10:20:00.000Z',
          submittedBy: { id: 'actor-submitter', handle: 'candidate-bot', securityLevel: 3 },
          lifecycleState: 'submitted',
          resubmissionOf: null,
          agentReview: {
            status: 'agent-rejected',
            duplicateRisk: 'medium',
            correctnessRisk: 'high',
            completenessRisk: 'high',
            checkedAt: '2026-06-19T10:21:00.000Z',
            notes: ['Schema mismatch', 'Manual confirmation required'],
            boundary: null,
          },
          reviewerDecision: null,
          reviewNotes: [],
        },
        submissionHistory: [],
        agentReview: {
          status: 'agent-rejected',
          duplicateRisk: 'medium',
          correctnessRisk: 'high',
          completenessRisk: 'high',
          checkedAt: '2026-06-19T10:21:00.000Z',
          notes: ['Schema mismatch', 'Manual confirmation required'],
          boundary: null,
        },
        reviewHistory: [],
        reviewNotes: [],
        lifecycleHistory: [],
        boundary: null,
        evidenceMeta: null,
        maintenanceMeta: null,
        remediation: null,
        createdAt: '2026-06-19T10:20:00.000Z',
        updatedAt: '2026-06-19T10:21:00.000Z',
      },
      agentReview: {
        status: 'agent-rejected',
        duplicateRisk: 'medium',
        correctnessRisk: 'high',
        completenessRisk: 'high',
        checkedAt: '2026-06-19T10:21:00.000Z',
        notes: ['Schema mismatch', 'Manual confirmation required'],
        boundary: null,
      },
      submittedBy: { id: 'actor-submitter', handle: 'candidate-bot', securityLevel: 3 },
      lastDecision: null,
      latestSubmission: {
        id: 'submission-201',
        revision: 1,
        submittedAt: '2026-06-19T10:20:00.000Z',
        submittedBy: { id: 'actor-submitter', handle: 'candidate-bot', securityLevel: 3 },
        lifecycleState: 'submitted',
        resubmissionOf: null,
        agentReview: null,
        reviewerDecision: null,
        reviewNotes: [],
      },
      reviewNotes: [],
    },
  ],
  nextCursor: null,
  total: 1,
};

const mockActivityFeed: ActivityFeedResponse = {
  events: [
    {
      id: 'evt-1',
      actor: 'reviewer@trapmap.local',
      description: 'Review queue handoff completed for candidate c-204.',
      relatedReviewId: 'rev-201',
      timestamp: '2026-06-19T09:58:00.000Z',
      title: 'Review approved',
      tone: 'success',
      typeLabel: 'Decision',
    },
    {
      id: 'evt-2',
      actor: 'operator@trapmap.local',
      description: 'JSON fix saved after schema recovery on candidate c-201.',
      relatedReviewId: 'rev-201',
      timestamp: '2026-06-19T09:42:00.000Z',
      title: 'Payload edited',
      tone: 'warning',
      typeLabel: 'Intervention',
    },
  ],
};

const mockAccounts: SessionAccount[] = [
  {
    id: 'acct-admin',
    token: 'mock-session-token-admin',
    user: {
      displayName: 'TrapMap Operator',
      handle: 'operator@trapmap.local',
      role: 'administrator',
    },
  },
  {
    id: 'acct-reviewer',
    token: 'mock-session-token-reviewer',
    user: {
      displayName: 'Queue Reviewer',
      handle: 'reviewer@trapmap.local',
      role: 'reviewer',
    },
  },
  {
    id: 'acct-readonly',
    token: 'mock-session-token-readonly',
    user: {
      displayName: 'Audit Observer',
      handle: 'observer@trapmap.local',
      role: 'read-only-operator',
    },
  },
];

const mockFilesByReviewId: Record<string, ReviewArtifactFile[]> = {
  'rev-201': [
    {
      path: 'entry/review-payload.json',
      name: 'review-payload.json',
      language: 'json',
      lastEditedAt: '2026-06-19T10:20:00.000Z',
      size: 1840,
      content: JSON.stringify(mockReviewQueue.items[0]?.entry ?? {}, null, 2),
    },
    {
      path: 'entry/triage-notes.md',
      name: 'triage-notes.md',
      language: 'markdown',
      lastEditedAt: '2026-06-19T10:19:00.000Z',
      size: 412,
      content: [
        '# Runtime candidate review',
        '',
        '- Agent review reports schema drift.',
        '- Confirm `requiredLevel` and labels before approval.',
        '- Keep an audit rationale when editing payload files.',
      ].join('\n'),
    },
    {
      path: 'entry/submission-meta.yaml',
      name: 'submission-meta.yaml',
      language: 'yaml',
      lastEditedAt: '2026-06-19T10:18:00.000Z',
      size: 188,
      content: ['source: candidate-bot', 'boundary: none', 'needs_manual_review: true'].join('\n'),
    },
  ],
};

let activeAccountId = mockAccounts[0]?.id ?? null;
let reviewQueueState = structuredClone(mockReviewQueue);
const filesState = structuredClone(mockFilesByReviewId);
const activityState = structuredClone(mockActivityFeed);

function buildSession(accountId = activeAccountId): AdminPanelSession {
  const activeAccount = mockAccounts.find((account) => account.id === accountId) ?? null;

  return {
    authenticated: Boolean(activeAccount),
    activeAccountId: activeAccount?.id ?? null,
    accounts: structuredClone(mockAccounts),
    availableRoles: ['administrator', 'reviewer', 'read-only-operator'],
    token: activeAccount?.token ?? null,
    user: activeAccount ? structuredClone(activeAccount.user) : null,
  };
}

function cloneReviewQueue(): ReviewQueueResponse {
  return structuredClone(reviewQueueState);
}

function cloneFiles(reviewId: string): ReviewArtifactFile[] {
  const files = filesState[reviewId] ?? [];
  return structuredClone(files);
}

function buildReviewDetailResponse(reviewId: string): ReviewDetailResponse {
  const item =
    cloneReviewQueue().items.find((entry) => entry.entry.id === reviewId) ??
    cloneReviewQueue().items[0]!;

  return {
    entry: item.entry,
    activity: structuredClone(activityState.events),
    files: cloneFiles(item.entry.id),
  };
}

function updateFileContent(input: ManualJsonEditInput, nextContent: string, now: string): void {
  const reviewFiles = filesState[input.reviewId] ?? [];
  const targetPath = input.filePath ?? 'entry/review-payload.json';
  const targetIndex = reviewFiles.findIndex((file) => file.path === targetPath);

  if (targetIndex === -1) {
    reviewFiles.unshift({
      path: targetPath,
      name: targetPath.split('/').at(-1) ?? targetPath,
      language: 'json',
      lastEditedAt: now,
      size: nextContent.length,
      content: nextContent,
    });
  } else {
    reviewFiles[targetIndex] = {
      ...reviewFiles[targetIndex]!,
      content: nextContent,
      size: nextContent.length,
      lastEditedAt: now,
    };
  }

  filesState[input.reviewId] = reviewFiles;
}

export function createMockAdminPanelApi(): AdminPanelApiContract {
  return {
    async loadSession() {
      return buildSession();
    },
    async switchSessionAccount(accountId) {
      activeAccountId =
        mockAccounts.find((account) => account.id === accountId)?.id ?? activeAccountId;
      return buildSession();
    },
    async loadRuntimeOverview() {
      return structuredClone(mockRuntimeOverview);
    },
    async loadPendingReviews() {
      return cloneReviewQueue();
    },
    async loadReviewDetail(reviewId) {
      return buildReviewDetailResponse(reviewId);
    },
    async submitReviewDecision(input: ReviewDecisionRequest) {
      const detail = buildReviewDetailResponse(input.entryId);
      const activeUser = buildSession().user;
      const decidedAt = '2026-06-19T10:30:00.000Z';

      detail.entry.reviewHistory.push({
        decidedAt,
        decidedBy: {
          id: `actor-${activeUser?.role ?? 'reviewer'}`,
          handle: activeUser?.handle ?? 'reviewer@trapmap.local',
          securityLevel: 5,
        },
        decision: input.decision,
        notes: input.notes,
      });
      detail.entry.lifecycleState = input.decision === 'approve' ? 'approved' : 'rejected';

      reviewQueueState = {
        ...reviewQueueState,
        items: reviewQueueState.items.map((item) =>
          item.entry.id === input.entryId
            ? { ...item, entry: structuredClone(detail.entry) }
            : item,
        ),
      };

      return { entry: detail.entry };
    },
    async saveManualJsonEdit(input: ManualJsonEditInput) {
      const savedAt = '2026-06-19T10:31:00.000Z';
      const nextContent =
        typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload, null, 2);
      updateFileContent(input, nextContent, savedAt);

      activityState.events.unshift({
        id: `evt-edit-${Date.now()}`,
        actor: buildSession().user?.handle ?? 'operator@trapmap.local',
        description: `Updated ${input.filePath ?? 'entry/review-payload.json'} with manual intervention.`,
        relatedReviewId: input.reviewId,
        timestamp: savedAt,
        title: 'Payload edited',
        tone: 'warning',
        typeLabel: 'Intervention',
      });

      return { savedAt };
    },
    async loadActivityFeed() {
      return structuredClone(activityState);
    },
  };
}
