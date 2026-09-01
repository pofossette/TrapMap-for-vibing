import type { Page, Route } from '@playwright/test';

export type MockRole = 'administrator' | 'reviewer' | 'read-only-operator' | 'unauthenticated';

type MockSessionShape = {
  accounts: Array<{
    id: string;
    token: string;
    user: { displayName: string; handle: string; role: string };
  }>;
  activeAccountId: string | null;
  authenticated: boolean;
  availableRoles: string[];
  token: string | null;
  user: { displayName: string; handle: string; role: string } | null;
};

const presetSessions: Record<MockRole, MockSessionShape> = {
  administrator: {
    accounts: [
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
    ],
    activeAccountId: 'acct-admin',
    authenticated: true,
    availableRoles: ['administrator', 'reviewer', 'read-only-operator'],
    token: 'mock-session-token-admin',
    user: {
      displayName: 'TrapMap Operator',
      handle: 'operator@trapmap.local',
      role: 'administrator',
    },
  },
  reviewer: {
    accounts: [
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
    ],
    activeAccountId: 'acct-reviewer',
    authenticated: true,
    availableRoles: ['administrator', 'reviewer', 'read-only-operator'],
    token: 'mock-session-token-reviewer',
    user: {
      displayName: 'Queue Reviewer',
      handle: 'reviewer@trapmap.local',
      role: 'reviewer',
    },
  },
  'read-only-operator': {
    accounts: [
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
    ],
    activeAccountId: 'acct-readonly',
    authenticated: true,
    availableRoles: ['administrator', 'reviewer', 'read-only-operator'],
    token: 'mock-session-token-readonly',
    user: {
      displayName: 'Audit Observer',
      handle: 'observer@trapmap.local',
      role: 'read-only-operator',
    },
  },
  unauthenticated: {
    accounts: [],
    activeAccountId: null,
    authenticated: false,
    availableRoles: [],
    token: null,
    user: null,
  },
};

const runtimeFixture = {
  buildId: 'web-panel-dev',
  deploymentProfile: 'team-monolith',
  failedJobsCount: 2,
  incidents: ['Schema drift detected in candidate-ingestion.'],
  lastHealthCheckAt: '2026-06-19T10:24:00.000Z',
  pendingReviewCount: 3,
  services: [
    {
      detail: 'Serving requests normally.',
      lastCheckedAt: '2026-06-19T10:24:00.000Z',
      name: 'gateway',
      status: 'healthy',
      version: '1.0.0',
    },
    {
      detail: 'Backlog elevated but processing.',
      lastCheckedAt: '2026-06-19T10:24:00.000Z',
      name: 'governance',
      status: 'degraded',
      version: '1.0.0',
    },
  ],
  throughputPerHour: 124,
  workload: [
    { label: 'Pending Reviews', value: 3 },
    { label: 'Candidate Backlog', value: 7 },
    { label: 'Failed Jobs', value: 2 },
  ],
};

const reviewQueueFixture = {
  filteredTotal: 3,
  nextCursor: null,
  total: 3,
  items: [
    {
      agentReview: {
        boundary: null,
        checkedAt: '2026-06-19T10:21:00.000Z',
        completenessRisk: 'high',
        correctnessRisk: 'high',
        duplicateRisk: 'medium',
        notes: ['Schema mismatch', 'Manual confirmation required'],
        status: 'agent-rejected',
      },
      entry: {
        agentReview: {
          boundary: null,
          checkedAt: '2026-06-19T10:21:00.000Z',
          completenessRisk: 'high',
          correctnessRisk: 'high',
          duplicateRisk: 'medium',
          notes: ['Schema mismatch', 'Manual confirmation required'],
          status: 'agent-rejected',
        },
        boundary: null,
        createdAt: '2026-06-19T10:20:00.000Z',
        detail: 'Candidate payload requires manual inspection before approval.',
        evidenceMeta: null,
        history: [],
        id: 'rev-201',
        labels: ['runtime', 'governance'],
        latestRevision: {
          detail: 'Candidate payload requires manual inspection before approval.',
          labels: ['runtime', 'governance'],
          reviewNotes: [],
          revision: 1,
          shortcut: 'Runtime candidate with schema drift',
          submittedAt: '2026-06-19T10:20:00.000Z',
          submittedBy: { handle: 'candidate-bot', id: 'actor-submitter', securityLevel: 3 },
        },
        latestSubmission: {
          agentReview: null,
          id: 'submission-201',
          lifecycleState: 'submitted',
          resubmissionOf: null,
          reviewNotes: [],
          reviewerDecision: null,
          revision: 1,
          submittedAt: '2026-06-19T10:20:00.000Z',
          submittedBy: { handle: 'candidate-bot', id: 'actor-submitter', securityLevel: 3 },
        },
        lifecycleHistory: [],
        lifecycleState: 'submitted',
        maintenanceMeta: null,
        metadata: {
          latestReviewedAt: null,
          latestDecision: null,
          latestSubmissionId: 'submission-201',
          latestSubmittedAt: '2026-06-19T10:20:00.000Z',
          resubmissionCount: 0,
          revisionCount: 1,
          scopeLabel: 'project-knowledge',
          submissionCount: 1,
        },
        owner: { handle: 'ops-owner', id: 'actor-owner', securityLevel: 4 },
        remediation: null,
        reviewHistory: [],
        reviewNotes: [],
        scope: 'global',
        shortcut: 'Runtime candidate with schema drift',
        submissionHistory: [],
        teamId: null,
        requiredLevel: 4,
        updatedAt: '2026-06-19T10:21:00.000Z',
      },
      lastDecision: null,
      latestSubmission: {
        agentReview: null,
        id: 'submission-201',
        lifecycleState: 'submitted',
        resubmissionOf: null,
        reviewNotes: [],
        reviewerDecision: null,
        revision: 1,
        submittedAt: '2026-06-19T10:20:00.000Z',
        submittedBy: { handle: 'ops-owner', id: 'actor-owner', securityLevel: 4 },
      },
      reviewNotes: [],
      submittedBy: { handle: 'candidate-bot', id: 'actor-submitter', securityLevel: 3 },
    },
    {
      agentReview: {
        boundary: null,
        checkedAt: '2026-06-19T10:15:00.000Z',
        completenessRisk: 'medium',
        correctnessRisk: 'medium',
        duplicateRisk: 'low',
        notes: ['Possible overlap'],
        status: 'agent-rejected',
      },
      entry: {
        agentReview: {
          boundary: null,
          checkedAt: '2026-06-19T10:15:00.000Z',
          completenessRisk: 'medium',
          correctnessRisk: 'medium',
          duplicateRisk: 'low',
          notes: ['Possible overlap'],
          status: 'agent-rejected',
        },
        boundary: null,
        createdAt: '2026-06-19T10:15:00.000Z',
        detail: 'Beta network isolation rules require governance review.',
        evidenceMeta: null,
        history: [],
        id: 'rev-202',
        labels: ['network'],
        latestRevision: {
          detail: 'Beta network isolation rules require governance review.',
          labels: ['network'],
          reviewNotes: [],
          revision: 1,
          shortcut: 'Network policy candidate',
          submittedAt: '2026-06-19T10:15:00.000Z',
          submittedBy: { handle: 'candidate-bot', id: 'actor-submitter', securityLevel: 3 },
        },
        latestSubmission: {
          agentReview: null,
          id: 'candidate-ingestion',
          lifecycleState: 'submitted',
          resubmissionOf: null,
          reviewNotes: [],
          reviewerDecision: null,
          revision: 1,
          submittedAt: '2026-06-19T10:15:00.000Z',
          submittedBy: { handle: 'candidate-bot', id: 'actor-submitter', securityLevel: 3 },
        },
        lifecycleHistory: [],
        lifecycleState: 'submitted',
        maintenanceMeta: null,
        metadata: {
          latestDecision: null,
          latestReviewedAt: null,
          latestSubmissionId: 'candidate-ingestion',
          latestSubmittedAt: '2026-06-19T10:15:00.000Z',
          resubmissionCount: 0,
          revisionCount: 1,
          scopeLabel: 'project-knowledge',
          submissionCount: 1,
        },
        owner: { handle: 'ops-owner', id: 'actor-owner', securityLevel: 4 },
        remediation: null,
        reviewHistory: [],
        reviewNotes: [],
        scope: 'global',
        shortcut: 'Network policy candidate',
        submissionHistory: [],
        teamId: null,
        requiredLevel: 3,
        updatedAt: '2026-06-19T10:15:00.000Z',
      },
      lastDecision: null,
      latestSubmission: {
        agentReview: null,
        id: 'candidate-ingestion',
        lifecycleState: 'submitted',
        resubmissionOf: null,
        reviewNotes: [],
        reviewerDecision: null,
        revision: 1,
        submittedAt: '2026-06-19T10:15:00.000Z',
        submittedBy: { handle: 'ops-owner', id: 'actor-owner', securityLevel: 4 },
      },
      reviewNotes: [],
      submittedBy: { handle: 'candidate-bot', id: 'actor-submitter', securityLevel: 3 },
    },
  ],
};

const activityFixture = {
  events: [
    {
      actor: 'reviewer@trapmap.local',
      description: 'Review queue handoff completed for candidate c-204.',
      id: 'evt-1',
      relatedReviewId: 'rev-201',
      timestamp: '2026-06-19T09:58:00.000Z',
      title: 'Review approved',
      tone: 'success',
      typeLabel: 'Decision',
    },
    {
      actor: 'operator@trapmap.local',
      description: 'JSON fix saved after schema recovery on candidate c-201.',
      id: 'evt-2',
      relatedReviewId: 'rev-201',
      timestamp: '2026-06-19T09:42:00.000Z',
      title: 'Payload edited',
      tone: 'warning',
      typeLabel: 'Intervention',
    },
    {
      actor: 'candidate-bot',
      description: 'Candidate payload accepted into governance ingestion.',
      id: 'evt-3',
      relatedReviewId: 'rev-201',
      timestamp: '2026-06-19T09:20:00.000Z',
      title: 'Candidate ingested',
      tone: 'success',
      typeLabel: 'System Ingestion',
    },
  ],
  filteredTotal: 3,
  nextCursor: null,
  total: 3,
};

const artifactFixture = {
  filteredTotal: 2,
  nextCursor: null,
  total: 2,
  items: [
    {
      createdAt: '2026-06-19T10:00:00.000Z',
      history: [
        {
          derived: {
            capsules: [
              {
                artifactId: 'art-101',
                capsuleId: 'cap-101-1',
                content: 'Ensure all containers run with read-only root filesystems when possible.',
                contextualPrefix: 'Docker container security configuration guidance',
                errorText: 'container has writable root',
                goal: 'Mount the root filesystem as read-only.',
                labels: ['docker', 'hardening', 'filesystem'],
                problem: 'Malicious processes can persist files on the container root filesystem.',
                requiredLevel: 3,
                revision: 1,
                scope: 'project',
                situation: 'Container runs with writable root filesystem',
                sourcePaths: ['SKILL.md'],
              },
            ],
            clientManifest: {
              artifactId: 'art-101',
              references: [],
              assets: [],
              revision: 1,
              scripts: [],
              sourceHash: 'sha-docker-rev1',
            },
            profile: {
              artifactId: 'art-101',
              contentHash: 'sha-profile-derived',
              description: 'Governs docker runtime environments and detects security gaps.',
              keywords: ['docker', 'container-security', 'isolation'],
              labels: ['docker'],
              prerequisites: [],
              referencePaths: [],
              revision: 1,
              sourceHash: 'sha-docker-rev1',
              summary: 'A capsule-based skill to enforce container isolation.',
              title: 'Docker Runtime Governance Skill',
            },
            sourceHash: 'sha-docker-rev1',
            derivedAt: '2026-06-19T10:04:00.000Z',
          },
          files: [
            {
              includeInDerivation: true,
              activationOnly: false,
              kind: 'skill-markdown',
              mediaType: 'text/markdown',
              path: 'SKILL.md',
              sha256: 'sha-skill-md',
              sizeBytes: 1200,
              source: 'SKILL.md',
            },
          ],
          revision: 1,
          scriptDescriptors: [],
          sourceHash: 'sha-docker-rev1',
          submittedAt: '2026-06-19T10:00:00.000Z',
          submittedBy: { handle: 'ops-lead', id: 'actor-ops', securityLevel: 4 },
        },
      ],
      id: 'art-101',
      labels: ['docker', 'security'],
      latestRevision: 1,
      lifecycleState: 'approved',
      metadata: {
        latestDecision: 'approve',
        latestReviewedAt: '2026-06-19T10:05:00.000Z',
        latestSubmissionId: 'sub-301',
        latestSubmittedAt: '2026-06-19T10:00:00.000Z',
        resubmissionCount: 0,
        revisionCount: 1,
        sourceKind: 'skill-directory',
        submissionCount: 1,
      },
      owner: { handle: 'ops-lead', id: 'actor-ops', securityLevel: 4 },
      requiredLevel: 3,
      scope: 'project',
      slug: 'docker-runtime-gov-skill',
      teamId: null,
      title: 'Docker Runtime Governance Skill',
      updatedAt: '2026-06-19T10:05:00.000Z',
      agentReview: {
        boundary: null,
        checkedAt: '2026-06-19T10:02:00.000Z',
        completenessRisk: 'medium',
        correctnessRisk: 'low',
        duplicateRisk: 'low',
        notes: ['Valid Docker compliance rules.'],
        status: 'agent-pass',
      },
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      evidenceMeta: null,
      maintenanceMeta: null,
      remediation: null,
    },
    {
      createdAt: '2026-06-20T14:00:00.000Z',
      history: [
        {
          derived: null,
          files: [
            {
              activationOnly: false,
              includeInDerivation: true,
              kind: 'skill-markdown',
              mediaType: 'text/markdown',
              path: 'SKILL.md',
              sha256: 'sha-k8s-skill-md',
              sizeBytes: 1500,
              source: 'SKILL.md',
            },
          ],
          revision: 1,
          scriptDescriptors: [],
          sourceHash: 'sha-k8s-rev1',
          submittedAt: '2026-06-20T14:00:00.000Z',
          submittedBy: { handle: 'net-sec-eng', id: 'actor-net', securityLevel: 4 },
        },
      ],
      id: 'art-102',
      labels: ['kubernetes', 'network'],
      latestRevision: 1,
      lifecycleState: 'submitted',
      metadata: {
        latestDecision: null,
        latestReviewedAt: null,
        latestSubmissionId: 'sub-302',
        latestSubmittedAt: '2026-06-20T14:00:00.000Z',
        resubmissionCount: 0,
        revisionCount: 1,
        sourceKind: 'skill-directory',
        submissionCount: 1,
      },
      owner: { handle: 'net-sec-eng', id: 'actor-net', securityLevel: 4 },
      requiredLevel: 4,
      scope: 'global',
      slug: 'k8s-netpol-skill',
      teamId: null,
      title: 'Kubernetes Network Security Policies',
      updatedAt: '2026-06-20T14:00:00.000Z',
      agentReview: {
        boundary: null,
        checkedAt: '2026-06-20T14:02:00.000Z',
        completenessRisk: 'low',
        correctnessRisk: 'medium',
        duplicateRisk: 'high',
        notes: ['Possible overlap with global network baseline policy.'],
        status: 'agent-rejected',
      },
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      evidenceMeta: null,
      maintenanceMeta: null,
      remediation: null,
    },
  ],
};

const trapGraphFixture = {
  edges: [
    { id: 'e-1', kind: 'evidence', source: 'cue-1', target: 'trap-1' },
    { id: 'e-2', kind: 'requires', source: 'tool-1', target: 'trap-1' },
    { id: 'e-3', kind: 'applies-in', source: 'env-1', target: 'trap-1' },
    { id: 'e-4', kind: 'mitigates', source: 'mit-1', target: 'trap-1' },
    { id: 'e-5', kind: 'mitigates', source: 'mit-2', target: 'trap-1' },
    { id: 'e-6', kind: 'evidence', source: 'cue-2', target: 'trap-2' },
    { id: 'e-7', kind: 'mitigates', source: 'mit-3', target: 'trap-2' },
    { id: 'e-8', kind: 'risk-blocks', source: 'trap-2', target: 'trap-1' },
  ],
  nodes: [
    {
      id: 'trap-1',
      kind: 'trap',
      label: 'Docker socket exposure',
      requiredLevel: 4,
      scope: 'global',
      severity: 'critical',
    },
    { id: 'cue-1', kind: 'cue', label: 'Mounting /var/run/docker.sock' },
    { id: 'tool-1', kind: 'tool', label: 'Docker CLI' },
    { id: 'env-1', kind: 'environment', label: 'Host environment' },
    { id: 'mit-1', kind: 'mitigation', label: 'Rootless container runtimes' },
    { id: 'mit-2', kind: 'mitigation', label: 'Restricting socket mounts in k8s' },
    {
      id: 'trap-2',
      kind: 'trap',
      label: 'Writable root filesystem',
      requiredLevel: 2,
      scope: 'project',
      severity: 'medium',
    },
    { id: 'cue-2', kind: 'cue', label: 'Container root FS is writable' },
    { id: 'mit-3', kind: 'mitigation', label: 'Read-only root filesystem flag' },
  ],
};

const skillGraphFixture = {
  derivation: {
    edges: [
      { id: 'ed-1', kind: 'derives', source: 'art-101', target: 'prof-101' },
      { id: 'ed-2', kind: 'contains', source: 'art-101', target: 'man-101' },
      { id: 'ed-3', kind: 'defines-capsule', source: 'prof-101', target: 'cap-101-1' },
      { id: 'ed-4', kind: 'defines-capsule', source: 'prof-101', target: 'cap-101-2' },
      { id: 'ed-5', kind: 'references-file', source: 'man-101', target: 'ref-101' },
      { id: 'ed-6', kind: 'contains-script', source: 'man-101', target: 'script-101' },
    ],
    nodes: [
      { id: 'art-101', kind: 'artifact', label: 'Docker Governance' },
      { id: 'prof-101', kind: 'profile', label: 'Docker Governance Profile' },
      { id: 'cap-101-1', kind: 'capsule', label: 'cap-101-1: Read-only root FS' },
      { id: 'cap-101-2', kind: 'capsule', label: 'cap-101-2: Restrict Socket Exposure' },
      { id: 'ref-101', kind: 'reference', label: 'references/docker-best-practices.md' },
      { id: 'script-101', kind: 'script', label: 'scripts/cleanup.sh' },
      { id: 'man-101', kind: 'manifest', label: 'Artifact Manifest' },
    ],
  },
  semantic: {
    edges: [
      { id: 'es-1', kind: 'has-capsule', source: 'skill-101', target: 'cap-101-1' },
      { id: 'es-2', kind: 'has-capsule', source: 'skill-101', target: 'cap-101-2' },
    ],
    nodes: [
      { id: 'skill-101', kind: 'skill', label: 'Docker Governance Skill' },
      { id: 'cap-101-1', kind: 'capsule', label: 'cap-101-1: Read-only root FS' },
      { id: 'cap-101-2', kind: 'capsule', label: 'cap-101-2: Restrict Socket Exposure' },
    ],
  },
};

const reviewDetailFixture = {
  activity: activityFixture.events,
  entry: reviewQueueFixture.items[0]?.entry ?? {},
  files: [
    {
      content: JSON.stringify(reviewQueueFixture.items[0]?.entry ?? {}, null, 2),
      language: 'json',
      lastEditedAt: '2026-06-19T10:20:00.000Z',
      name: 'review-payload.json',
      path: 'entry/review-payload.json',
      size: 1840,
    },
  ],
};

function jsonOk(body: unknown): { contentType: string; status: number; body: string } {
  return {
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  };
}

function jsonError(
  status: number,
  body: unknown,
): { contentType: string; status: number; body: string } {
  return {
    body: JSON.stringify(body),
    contentType: 'application/json',
    status,
  };
}

export class MockApi {
  constructor(public readonly page: Page) {}

  getPresetSession(role: MockRole = 'administrator'): MockSessionShape {
    return structuredClone(presetSessions[role]);
  }

  async mockSession(role: MockRole = 'administrator'): Promise<void> {
    const session = this.getPresetSession(role);
    await this.page.unroute('**/v1/auth/session').catch(() => {});
    await this.page.route('**/v1/auth/session', async (route: Route) => {
      if (role === 'unauthenticated') {
        await route.fulfill(
          jsonError(401, {
            code: 'UNAUTHORIZED',
            kind: 'auth',
            message: 'Missing session token',
          }),
        );
        return;
      }
      await route.fulfill(jsonOk(session));
    });
    // Also cover switch endpoint fallback to same session when not explicitly mocked
    await this.page.unroute('**/v1/auth/session/switch').catch(() => {});
    await this.page.route('**/v1/auth/session/switch', async (route: Route) => {
      const method = route.request().method();
      if (method !== 'POST') {
        await route.fulfill(jsonOk(session));
        return;
      }
      let accountId = '';
      try {
        const raw = route.request().postData() ?? '{}';
        const parsed = JSON.parse(raw) as { accountId?: string };
        accountId = parsed.accountId ?? '';
      } catch {
        // ignore parse errors
      }
      const matched = session.accounts.find((a) => a.id === accountId);
      if (matched) {
        const next: MockSessionShape = {
          ...structuredClone(session),
          activeAccountId: matched.id,
          token: matched.token,
          user: matched.user,
        };
        await route.fulfill(jsonOk(next));
        return;
      }
      await route.fulfill(jsonOk(session));
    });
  }

  async mockLogin(): Promise<void> {
    await this.page.unroute('**/v1/auth/login').catch(() => {});
    await this.page.route('**/v1/auth/login', async (route: Route) => {
      const request = route.request();
      let key = '';
      try {
        const raw = request.postData() ?? '{}';
        const parsed = JSON.parse(raw) as { accessKey?: unknown };
        key = String(parsed.accessKey ?? '').trim();
      } catch {
        key = '';
      }
      if (key.length < 16) {
        await route.fulfill(
          jsonError(400, {
            code: 'VALIDATION_ERROR',
            kind: 'validation',
            message: 'Invalid access key: must be at least 16 characters',
          }),
        );
        return;
      }
      const session = this.getPresetSession('administrator');
      await route.fulfill(jsonOk(session));
    });
    // alias for legacy /api/auth/login if panel ever calls it
    await this.page.unroute('**/api/auth/login').catch(() => {});
    await this.page.route('**/api/auth/login', async (route: Route) => {
      const session = this.getPresetSession('administrator');
      await route.fulfill(jsonOk(session));
    });
  }

  async mockLogout(): Promise<void> {
    await this.page.unroute('**/v1/auth/logout').catch(() => {});
    await this.page.route('**/v1/auth/logout', async (route: Route) => {
      await route.fulfill(jsonOk({ ok: true }));
    });
  }

  async mockRuntimeOverview(): Promise<void> {
    await this.page.unroute('**/api/admin/runtime-overview').catch(() => {});
    await this.page.route('**/api/admin/runtime-overview', async (route: Route) => {
      await route.fulfill(jsonOk(runtimeFixture));
    });
    // also support bare without /api prefix for gateway proxy variations
    await this.page.unroute('**/runtime-overview').catch(() => {});
    await this.page.route('**/runtime-overview', async (route: Route) => {
      await route.fulfill(jsonOk(runtimeFixture));
    });
  }

  async mockReviewQueue(): Promise<void> {
    const handler = async (route: Route) => {
      await route.fulfill(jsonOk(reviewQueueFixture));
    };
    await this.page.unroute('**/api/admin/reviews').catch(() => {});
    await this.page.route('**/api/admin/reviews', handler);
    await this.page.unroute('**/api/admin/reviews?*').catch(() => {});
    await this.page.route('**/api/admin/reviews?*', handler);
    // legacy gateway paths
    await this.page.unroute('**/v1/knowledge/review-queue*').catch(() => {});
    await this.page.route('**/v1/knowledge/review-queue*', handler);
    await this.page.unroute('**/v1/knowledge/review*').catch(() => {});
    // detail fallback: if generic review list already matched, keep specific detail below
  }

  async mockReviewDetail(): Promise<void> {
    await this.page.unroute('**/api/admin/reviews/*').catch(() => {});
    await this.page.route('**/api/admin/reviews/*', async (route: Route) => {
      const url = route.request().url();
      // decision endpoint
      if (url.includes('/decision')) {
        await route.fulfill(jsonOk({ entry: reviewQueueFixture.items[0]?.entry ?? {} }));
        return;
      }
      // json-edits endpoint
      if (url.includes('/json-edits')) {
        await route.fulfill(jsonOk({ savedAt: new Date().toISOString() }));
        return;
      }
      await route.fulfill(jsonOk(reviewDetailFixture));
    });
    await this.page.unroute('**/v1/knowledge/*').catch(() => {});
    await this.page.route('**/v1/knowledge/*', async (route: Route) => {
      await route.fulfill(jsonOk(reviewDetailFixture));
    });
  }

  async mockArtifacts(): Promise<void> {
    const listHandler = async (route: Route) => {
      await route.fulfill(jsonOk(artifactFixture));
    };
    await this.page.unroute('**/api/admin/artifacts').catch(() => {});
    await this.page.route('**/api/admin/artifacts', listHandler);
    await this.page.unroute('**/api/admin/artifacts?*').catch(() => {});
    await this.page.route('**/api/admin/artifacts?*', listHandler);
    // detail
    await this.page.unroute('**/api/admin/artifacts/*').catch(() => {});
    await this.page.route('**/api/admin/artifacts/*', async (route: Route) => {
      const url = route.request().url();
      const idMatch = url.match(/\/artifacts\/([^/?#]+)/);
      const artifactId = idMatch?.[1] ?? 'art-101';
      const found =
        artifactFixture.items.find((a) => a.id === artifactId) ?? artifactFixture.items[0];
      await route.fulfill(jsonOk(found ?? {}));
    });
  }

  async mockGraph(): Promise<void> {
    await this.page.unroute('**/api/admin/graph/traps*').catch(() => {});
    await this.page.route('**/api/admin/graph/traps*', async (route: Route) => {
      await route.fulfill(jsonOk(trapGraphFixture));
    });
    await this.page.unroute('**/api/admin/graph/skills*').catch(() => {});
    await this.page.route('**/api/admin/graph/skills*', async (route: Route) => {
      const url = new URL(route.request().url());
      const mode =
        (url.searchParams.get('mode') as 'derivation' | 'semantic' | null) ?? 'derivation';
      const artifactId = url.searchParams.get('artifactId') ?? 'art-101';
      const derived =
        skillGraphFixture[mode as keyof typeof skillGraphFixture] ?? skillGraphFixture.derivation;
      // return per artifact: if unknown artifact return empty
      if (artifactId !== 'art-101' && artifactId !== 'art-102') {
        await route.fulfill(jsonOk({ edges: [], nodes: [] }));
        return;
      }
      await route.fulfill(jsonOk(derived));
    });
    // legacy alias
    await this.page.unroute('**/api/admin/graphs/skill/*').catch(() => {});
    await this.page.route('**/api/admin/graphs/skill/*', async (route: Route) => {
      await route.fulfill(jsonOk(skillGraphFixture.derivation));
    });
  }

  async mockActivity(): Promise<void> {
    const handler = async (route: Route) => {
      await route.fulfill(jsonOk(activityFixture));
    };
    await this.page.unroute('**/api/admin/activity').catch(() => {});
    await this.page.route('**/api/admin/activity', handler);
    await this.page.unroute('**/api/admin/activity?*').catch(() => {});
    await this.page.route('**/api/admin/activity?*', handler);
    await this.page.unroute('**/v1/operations/feedback*').catch(() => {});
    await this.page.route('**/v1/operations/feedback*', handler);
  }

  async mockUnauthorized(): Promise<void> {
    await this.mockSession('unauthenticated');
    const unauthorizedHandler = async (route: Route) => {
      await route.fulfill(
        jsonError(401, {
          code: 'UNAUTHORIZED',
          kind: 'auth',
          message: 'Missing session token',
        }),
      );
    };
    for (const pattern of [
      '**/api/admin/**',
      '**/v1/knowledge/**',
      '**/v1/operations/**',
      '**/runtime-overview',
    ]) {
      await this.page.unroute(pattern).catch(() => {});
      await this.page.route(pattern, unauthorizedHandler);
    }
  }

  async mockAllAuthenticated(role: MockRole = 'administrator'): Promise<void> {
    await this.mockSession(role);
    await this.mockLogin();
    await this.mockLogout();
    await this.mockRuntimeOverview();
    await this.mockReviewQueue();
    await this.mockReviewDetail();
    await this.mockArtifacts();
    await this.mockGraph();
    await this.mockActivity();
  }

  async clearMocks(): Promise<void> {
    await this.page.unrouteAll({ behavior: 'wait' }).catch(() => {});
  }

  static getFixtures() {
    return {
      activity: structuredClone(activityFixture),
      artifactList: structuredClone(artifactFixture),
      reviewDetail: structuredClone(reviewDetailFixture),
      reviewQueue: structuredClone(reviewQueueFixture),
      runtime: structuredClone(runtimeFixture),
      sessions: structuredClone(presetSessions),
      skillGraph: structuredClone(skillGraphFixture),
      trapGraph: structuredClone(trapGraphFixture),
    };
  }
}
