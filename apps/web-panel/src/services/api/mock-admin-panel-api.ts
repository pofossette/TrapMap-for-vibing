import type { ReviewDecisionRequest, ReviewQueueResponse, SkillArtifact } from '@trapmap/contracts';

import type {
  ActivityFeedResponse,
  AdminPanelApiContract,
  AdminPanelSession,
  GraphDataResponse,
  ManualJsonEditInput,
  ReviewArtifactFile,
  ReviewDetailResponse,
  RuntimeOverviewResponse,
  SessionAccount,
} from '@trapmap/web-panel/shared/enum-types';

const mockArtifacts: SkillArtifact[] = [
  {
    id: 'art-101',
    teamId: null,
    scope: 'project',
    labels: ['docker', 'security'],
    title: 'Docker Runtime Governance Skill',
    slug: 'docker-runtime-gov-skill',
    requiredLevel: 3,
    lifecycleState: 'approved',
    owner: { id: 'actor-ops', handle: 'ops-lead', securityLevel: 4 },
    latestRevision: 1,
    createdAt: '2026-06-19T10:00:00.000Z',
    updatedAt: '2026-06-19T10:05:00.000Z',
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-301',
      latestSubmittedAt: '2026-06-19T10:00:00.000Z',
      latestReviewedAt: '2026-06-19T10:05:00.000Z',
      latestDecision: 'approve',
    },
    history: [
      {
        revision: 1,
        sourceHash: 'sha-docker-rev1',
        submittedAt: '2026-06-19T10:00:00.000Z',
        submittedBy: { id: 'actor-ops', handle: 'ops-lead', securityLevel: 4 },
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'sha-skill-md',
            sizeBytes: 1200,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
          },
          {
            path: 'references/docker-best-practices.md',
            kind: 'reference',
            sha256: 'sha-ref-docker',
            sizeBytes: 3400,
            mediaType: 'text/markdown',
            source: 'references/',
            includeInDerivation: true,
            activationOnly: false,
          },
          {
            path: 'scripts/cleanup.sh',
            kind: 'script',
            sha256: 'sha-script-cleanup',
            sizeBytes: 850,
            mediaType: 'application/x-sh',
            source: 'scripts/',
            includeInDerivation: false,
            activationOnly: true,
          },
        ],
        scriptDescriptors: [
          {
            path: 'scripts/cleanup.sh',
            sha256: 'sha-script-cleanup',
            capability: 'Clean up unused docker containers and volumes',
            argsSchemaSummary: 'None',
            sideEffectSummary: 'Removes local Docker data',
            defaultPolicy: 'needs-approval',
          },
        ],
        derived: {
          sourceHash: 'sha-docker-rev1',
          derivedAt: '2026-06-19T10:04:00.000Z',
          profile: {
            artifactId: 'art-101',
            revision: 1,
            sourceHash: 'sha-docker-rev1',
            title: 'Docker Runtime Governance Skill',
            description: 'Governs docker runtime environments and detects security gaps.',
            summary:
              'A capsule-based skill to enforce container isolation and prevent privilege escalation.',
            keywords: ['docker', 'container-security', 'isolation'],
            labels: ['docker'],
            prerequisites: ['Docker daemon active', 'Rootless access configured'],
            referencePaths: ['references/docker-best-practices.md'],
            contentHash: 'sha-profile-derived',
          },
          capsules: [
            {
              capsuleId: 'cap-101-1',
              artifactId: 'art-101',
              revision: 1,
              sourcePaths: ['SKILL.md'],
              content:
                'Ensure all containers run with read-only root filesystems when possible to prevent write-based malware persistence.',
              situation: 'Container runs with writable root filesystem',
              problem: 'Malicious processes can persist files on the container root filesystem.',
              goal: 'Mount the root filesystem as read-only and use tmpfs for temporary writes.',
              errorText: 'container has writable root',
              contextualPrefix: 'Docker container security configuration guidance',
              labels: ['docker', 'hardening', 'filesystem'],
              scope: 'project',
              requiredLevel: 3,
            },
            {
              capsuleId: 'cap-101-2',
              artifactId: 'art-101',
              revision: 1,
              sourcePaths: ['references/docker-best-practices.md'],
              content:
                'Do not expose the Docker daemon socket /var/run/docker.sock to untrusted containers.',
              situation: 'Docker socket mounted inside container',
              problem:
                'Containerized processes can control the host Docker daemon and escalate privilege to host root.',
              goal: 'Avoid socket mounts; use remote APIs with TLS or rootless docker where socket access is required.',
              errorText: 'docker socket exposed',
              contextualPrefix: 'Privilege escalation risks via docker socket mount',
              labels: ['docker', 'privilege-escalation', 'socket'],
              scope: 'project',
              requiredLevel: 4,
            },
          ],
          clientManifest: {
            artifactId: 'art-101',
            revision: 1,
            references: [
              {
                path: 'references/docker-best-practices.md',
                sha256: 'sha-ref-docker',
                sizeBytes: 3400,
                mediaType: 'text/markdown',
              },
            ],
            assets: [],
            scripts: [
              {
                path: 'scripts/cleanup.sh',
                sha256: 'sha-script-cleanup',
                capability: 'Clean up unused docker containers and volumes',
                argsSchemaSummary: 'None',
                sideEffectSummary: 'Removes local Docker data',
                defaultPolicy: 'needs-approval',
              },
            ],
            sourceHash: 'sha-docker-rev1',
          },
        },
      },
    ],
    agentReview: {
      status: 'agent-pass',
      duplicateRisk: 'low',
      correctnessRisk: 'low',
      completenessRisk: 'medium',
      checkedAt: '2026-06-19T10:02:00.000Z',
      notes: ['Valid Docker compliance rules.'],
      boundary: null,
    },
    reviewHistory: [
      {
        decidedAt: '2026-06-19T10:05:00.000Z',
        decidedBy: { id: 'actor-reviewer', handle: 'reviewer@trapmap.local', securityLevel: 4 },
        decision: 'approve',
        notes: 'Compliance rules look complete and follow guidelines.',
      },
    ],
    reviewNotes: [],
    lifecycleHistory: [],
    evidenceMeta: null,
    maintenanceMeta: null,
    remediation: null,
  },
  {
    id: 'art-102',
    teamId: null,
    scope: 'global',
    labels: ['kubernetes', 'network'],
    title: 'Kubernetes Network Security Policies',
    slug: 'k8s-netpol-skill',
    requiredLevel: 4,
    lifecycleState: 'submitted',
    owner: { id: 'actor-net', handle: 'net-sec-eng', securityLevel: 4 },
    latestRevision: 1,
    createdAt: '2026-06-20T14:00:00.000Z',
    updatedAt: '2026-06-20T14:00:00.000Z',
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-302',
      latestSubmittedAt: '2026-06-20T14:00:00.000Z',
      latestReviewedAt: null,
      latestDecision: null,
    },
    history: [
      {
        revision: 1,
        sourceHash: 'sha-k8s-rev1',
        submittedAt: '2026-06-20T14:00:00.000Z',
        submittedBy: { id: 'actor-net', handle: 'net-sec-eng', securityLevel: 4 },
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'sha-k8s-skill-md',
            sizeBytes: 1500,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
          },
        ],
        scriptDescriptors: [],
        derived: null,
      },
    ],
    agentReview: {
      status: 'agent-rejected',
      duplicateRisk: 'high',
      correctnessRisk: 'medium',
      completenessRisk: 'low',
      checkedAt: '2026-06-20T14:02:00.000Z',
      notes: ['Possible overlap with global network baseline policy.'],
      boundary: null,
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    evidenceMeta: null,
    maintenanceMeta: null,
    remediation: null,
  },
];

const mockTrapGraph: GraphDataResponse = {
  nodes: [
    {
      id: 'trap-1',
      label: 'Docker socket exposure',
      kind: 'trap',
      severity: 'critical',
      scope: 'global',
      requiredLevel: 4,
    },
    { id: 'cue-1', label: 'Mounting /var/run/docker.sock', kind: 'cue' },
    { id: 'tool-1', label: 'Docker CLI', kind: 'tool' },
    { id: 'env-1', label: 'Host environment', kind: 'environment' },
    { id: 'mit-1', label: 'Rootless container runtimes', kind: 'mitigation' },
    { id: 'mit-2', label: 'Restricting socket mounts in k8s', kind: 'mitigation' },

    {
      id: 'trap-2',
      label: 'Writable root filesystem',
      kind: 'trap',
      severity: 'medium',
      scope: 'project',
      requiredLevel: 2,
    },
    { id: 'cue-2', label: 'Container root FS is writable', kind: 'cue' },
    { id: 'mit-3', label: 'Read-only root filesystem flag', kind: 'mitigation' },
  ],
  edges: [
    { id: 'e-1', source: 'cue-1', target: 'trap-1', kind: 'evidence' },
    { id: 'e-2', source: 'tool-1', target: 'trap-1', kind: 'requires' },
    { id: 'e-3', source: 'env-1', target: 'trap-1', kind: 'applies-in' },
    { id: 'e-4', source: 'mit-1', target: 'trap-1', kind: 'mitigates' },
    { id: 'e-5', source: 'mit-2', target: 'trap-1', kind: 'mitigates' },

    { id: 'e-6', source: 'cue-2', target: 'trap-2', kind: 'evidence' },
    { id: 'e-7', source: 'mit-3', target: 'trap-2', kind: 'mitigates' },
    { id: 'e-8', source: 'trap-2', target: 'trap-1', kind: 'risk-blocks' },
  ],
};

const mockSkillGraphs: Record<string, Record<'derivation' | 'semantic', GraphDataResponse>> = {
  'art-101': {
    derivation: {
      nodes: [
        { id: 'art-101', label: 'Docker Governance', kind: 'artifact' },
        { id: 'prof-101', label: 'Docker Governance Profile', kind: 'profile' },
        { id: 'cap-101-1', label: 'cap-101-1: Read-only root FS', kind: 'capsule' },
        { id: 'cap-101-2', label: 'cap-101-2: Restrict Socket Exposure', kind: 'capsule' },
        { id: 'ref-101', label: 'references/docker-best-practices.md', kind: 'reference' },
        { id: 'script-101', label: 'scripts/cleanup.sh', kind: 'script' },
        { id: 'man-101', label: 'Artifact Manifest', kind: 'manifest' },
      ],
      edges: [
        { id: 'ed-1', source: 'art-101', target: 'prof-101', kind: 'derives' },
        { id: 'ed-2', source: 'art-101', target: 'man-101', kind: 'contains' },
        { id: 'ed-3', source: 'prof-101', target: 'cap-101-1', kind: 'defines-capsule' },
        { id: 'ed-4', source: 'prof-101', target: 'cap-101-2', kind: 'defines-capsule' },
        { id: 'ed-5', source: 'man-101', target: 'ref-101', kind: 'references-file' },
        { id: 'ed-6', source: 'man-101', target: 'script-101', kind: 'contains-script' },
        { id: 'ed-7', source: 'ref-101', target: 'cap-101-2', kind: 'contributes-to' },
      ],
    },
    semantic: {
      nodes: [
        { id: 'skill-101', label: 'Docker Governance Skill', kind: 'skill' },
        { id: 'cap-101-1', label: 'cap-101-1: Read-only root FS', kind: 'capsule' },
        { id: 'cap-101-2', label: 'cap-101-2: Restrict Socket Exposure', kind: 'capsule' },
        { id: 'cue-docker-sock', label: 'Mounting /var/run/docker.sock', kind: 'cue' },
        { id: 'mit-rootless', label: 'Rootless container runtimes', kind: 'mitigation' },
        { id: 'mit-readonly', label: 'Read-only root filesystem flag', kind: 'mitigation' },
      ],
      edges: [
        { id: 'es-1', source: 'skill-101', target: 'cap-101-1', kind: 'has-capsule' },
        { id: 'es-2', source: 'skill-101', target: 'cap-101-2', kind: 'has-capsule' },
        { id: 'es-3', source: 'cap-101-1', target: 'mit-readonly', kind: 'maps-mitigation' },
        { id: 'es-4', source: 'cap-101-2', target: 'cue-docker-sock', kind: 'addresses-cue' },
        { id: 'es-5', source: 'cap-101-2', target: 'mit-rootless', kind: 'maps-mitigation' },
      ],
    },
  },
  'art-102': {
    derivation: {
      nodes: [
        { id: 'art-102', label: 'K8s NetPol Policy', kind: 'artifact' },
        { id: 'man-102', label: 'Manifest', kind: 'manifest' },
      ],
      edges: [{ id: 'ed2-1', source: 'art-102', target: 'man-102', kind: 'contains' }],
    },
    semantic: {
      nodes: [{ id: 'skill-102', label: 'K8s Network Policies', kind: 'skill' }],
      edges: [],
    },
  },
};

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
      detail.entry.lifecycleState =
        input.decision === 'approve'
          ? 'approved'
          : input.decision === 'return-for-correction'
            ? 'submitted'
            : 'rejected';

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
    async loadArtifacts(query) {
      let filtered = [...mockArtifacts];
      if (query?.lifecycleState && query.lifecycleState !== 'all') {
        filtered = filtered.filter((a) => a.lifecycleState === query.lifecycleState);
      }
      if (query?.scope && query.scope !== 'all') {
        filtered = filtered.filter((a) => a.scope === query.scope);
      }
      if (query?.requiredLevel) {
        filtered = filtered.filter((a) => a.requiredLevel === query.requiredLevel);
      }
      if (query?.search) {
        const s = query.search.toLowerCase();
        filtered = filtered.filter(
          (a) => a.title.toLowerCase().includes(s) || a.id.toLowerCase().includes(s),
        );
      }
      return {
        items: filtered,
        total: filtered.length,
      };
    },
    async loadArtifactDetail(id) {
      const art = mockArtifacts.find((a) => a.id === id);
      if (!art) throw new Error('Artifact not found');
      return art;
    },
    async loadTrapGraph() {
      return mockTrapGraph;
    },
    async loadSkillGraph(artifactId, query) {
      const mode = query?.mode || 'derivation';
      const graph = mockSkillGraphs[artifactId]?.[mode];
      if (!graph) {
        return { nodes: [], edges: [] };
      }
      return graph;
    },
  };
}
