import type {
  KnowledgeEntry,
  LoginResponse,
  SessionStatusResponse,
  Team,
} from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// createMockEntry — canonical KnowledgeEntry factory
// Used by: knowledge.test.ts, knowledge.adversarial.test.ts, trap.test.ts
// ---------------------------------------------------------------------------

export function createMockEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'entry-1',
    teamId: null,
    scope: 'global',
    labels: ['label1'],
    shortcut: 'Test shortcut',
    detail: 'Test detail',
    requiredLevel: 0,
    lifecycleState: 'submitted',
    owner: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
    latestRevision: {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
      shortcut: 'Test shortcut',
      detail: 'Test detail',
      labels: ['label1'],
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
        shortcut: 'Test shortcut',
        detail: 'Test detail',
        labels: ['label1'],
        reviewNotes: [],
      },
    ],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-1',
      latestSubmittedAt: '2024-01-01T00:00:00Z',
      latestReviewedAt: null,
      latestDecision: null,
    },
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createMockTeam — canonical Team factory
// Used by: team.test.ts, team.adversarial.test.ts
// ---------------------------------------------------------------------------

export function createMockTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-1',
    name: 'Test Team',
    slug: 'test-team',
    description: 'A test team',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createMockLoginResponse — canonical LoginResponse factory
// Used by: auth.test.ts, team.test.ts, team.adversarial.test.ts
// ---------------------------------------------------------------------------

export interface CreateMockLoginResponseOptions {
  teamId?: string;
  securityLevel?: number;
  effectivePermissions?: string[];
}

export function createMockLoginResponse(
  teamIdOrOptions: string | CreateMockLoginResponseOptions = 'team-1',
): LoginResponse {
  const opts: Required<CreateMockLoginResponseOptions> =
    typeof teamIdOrOptions === 'string'
      ? { teamId: teamIdOrOptions, securityLevel: 0, effectivePermissions: ['session:read'] }
      : {
          teamId: teamIdOrOptions.teamId ?? 'team-1',
          securityLevel: teamIdOrOptions.securityLevel ?? 0,
          effectivePermissions: teamIdOrOptions.effectivePermissions ?? ['session:read'],
        };

  return {
    session: {
      sessionId: 'session-1',
      member: {
        id: 'member-1',
        teamId: opts.teamId,
        handle: 'testuser',
        roleTemplate: 'user',
        securityLevel: opts.securityLevel,
        permissions: [],
        notes: null,
        isSystem: false,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      activeTeam: createMockTeam({ id: opts.teamId }),
      effectivePermissions: opts.effectivePermissions,
      expiresAt: null,
      issuedAt: '2024-01-01T00:00:00Z',
    },
  };
}

// ---------------------------------------------------------------------------
// createMockSessionResponse — SessionStatusResponse factory
// Used by: auth.test.ts
// ---------------------------------------------------------------------------

export function createMockSessionResponse(
  session: LoginResponse['session'] | null = null,
): SessionStatusResponse {
  return {
    authenticated: session !== null,
    session,
  };
}

// ---------------------------------------------------------------------------
// Shared mock config state
// Provides the default `loadCliState` return value used across multiple tests.
// ---------------------------------------------------------------------------

// fallow-ignore-next-line unused-export — shared constant for test authors
export const MOCK_BASE_STATE = {
  gatewayUrl: 'http://localhost:3000',
  sessionToken: 'mock-token',
  session: {
    member: { handle: 'testuser', securityLevel: 0 },
    effectivePermissions: ['knowledge:submit'] as string[],
  },
};
