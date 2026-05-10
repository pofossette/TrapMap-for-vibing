/**
 * Tests for CLI review commands with evidence flags (Phase 58-06).
 *
 * This module covers:
 * - Evidence object building when source-type and evidence-level provided
 * - Default values when only partial evidence provided
 * - Source-type validation using zod safeParse
 * - Evidence-level validation using zod safeParse
 * - No evidence when flags not provided
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(),
}));

// Import after mocking
import { Command } from 'commander';
import { loadCliState } from '../lib/config.js';
import { apiRequest } from '../lib/http.js';
import { registerReviewCommands } from './review.js';

// Mock the named import - get a reference to the mock function
const mockedApiRequest = vi.mocked(apiRequest);
const mockedLoadCliState = vi.mocked(loadCliState);

// Full mock API response matching KnowledgeEntryResponse schema
interface MockReviewResponse {
  data: {
    entry: {
      id: string;
      teamId: string | null;
      scope: 'global' | 'project';
      labels: string[];
      shortcut: string;
      detail: string;
      requiredLevel: number;
      lifecycleState: string;
      owner: { id: string; handle: string; securityLevel: number };
      latestRevision: {
        revision: number;
        submittedAt: string;
        submittedBy: { id: string; handle: string; securityLevel: number };
        shortcut: string;
        detail: string;
        labels: string[];
        reviewNotes: Array<{
          id: string;
          createdAt: string;
          authorType: string;
          author: null;
          message: string;
        }>;
      };
      history: Array<{
        revision: number;
        submittedAt: string;
        submittedBy: { id: string; handle: string; securityLevel: number };
        shortcut: string;
        detail: string;
        labels: string[];
        reviewNotes: Array<{
          id: string;
          createdAt: string;
          authorType: string;
          author: null;
          message: string;
        }>;
      }>;
      metadata: {
        scopeLabel: 'global-constraint' | 'project-knowledge';
        submissionCount: number;
        resubmissionCount: number;
        revisionCount: number;
        latestSubmissionId: string | null;
        latestSubmittedAt: string | null;
        latestReviewedAt: string | null;
        latestDecision: 'approve' | 'reject' | null;
      };
      latestSubmission: null;
      submissionHistory: unknown[];
      agentReview: null;
      reviewHistory: unknown[];
      reviewNotes: unknown[];
      lifecycleHistory: unknown[];
      boundary: unknown;
      evidenceMeta: {
        evidenceLevel: string;
        sourceType: string;
        sourceRef?: string;
        verifiedAt: string;
        verifiedBy: { id: string; handle: string; securityLevel: number };
      } | null;
      maintenanceMeta: unknown;
      createdAt: string;
      updatedAt: string;
    };
  };
  sessionToken: string;
}

const createMockResponse = (
  evidenceMeta: MockReviewResponse['data']['entry']['evidenceMeta'] = null,
): MockReviewResponse => ({
  data: {
    entry: {
      id: 'knowledge_1',
      teamId: null,
      scope: 'global',
      labels: ['test'],
      shortcut: 'Test shortcut',
      detail: 'Test detail',
      requiredLevel: 3,
      lifecycleState: 'approved',
      owner: { id: 'user_1', handle: 'owner', securityLevel: 5 },
      latestRevision: {
        revision: 1,
        submittedAt: '2026-05-02T00:00:00Z',
        submittedBy: { id: 'user_1', handle: 'owner', securityLevel: 5 },
        shortcut: 'Test shortcut',
        detail: 'Test detail',
        labels: ['test'],
        reviewNotes: [],
      },
      history: [
        {
          revision: 1,
          submittedAt: '2026-05-02T00:00:00Z',
          submittedBy: { id: 'user_1', handle: 'owner', securityLevel: 5 },
          shortcut: 'Test shortcut',
          detail: 'Test detail',
          labels: ['test'],
          reviewNotes: [],
        },
      ],
      metadata: {
        scopeLabel: 'global-constraint',
        submissionCount: 1,
        resubmissionCount: 0,
        revisionCount: 1,
        latestSubmissionId: null,
        latestSubmittedAt: null,
        latestReviewedAt: '2026-05-02T00:00:00Z',
        latestDecision: 'approve',
      },
      latestSubmission: null,
      submissionHistory: [],
      agentReview: null,
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      boundary: null,
      evidenceMeta,
      maintenanceMeta: null,
      createdAt: '2026-05-02T00:00:00Z',
      updatedAt: '2026-05-02T00:00:00Z',
    },
  },
  sessionToken: 'test-token',
});

describe('CLI review commands with evidence flags (Phase 58-06)', () => {
  let program: Command;
  const mockState = {
    serverUrl: 'http://localhost:3000',
    sessionToken: 'test-token',
    session: null,
  };

  beforeEach(() => {
    // Setup mocks - reset and set implementation
    mockedApiRequest.mockReset();
    mockedLoadCliState.mockReset();

    mockedLoadCliState.mockResolvedValue(mockState);

    // Create program and register commands
    program = new Command();
    registerReviewCommands(program, {
      allowReview: true,
    });
  });

  describe('evidence object building', () => {
    it('builds evidence object when source-type and evidence-level provided', async () => {
      const mockResponse = createMockResponse({
        evidenceLevel: 'documented',
        sourceType: 'doc',
        verifiedAt: '2026-05-02T00:00:00Z',
        verifiedBy: { id: 'user_1', handle: 'reviewer', securityLevel: 5 },
      });
      mockedApiRequest.mockResolvedValue(mockResponse);

      await program.parseAsync([
        'node',
        'test',
        'review:approve',
        'knowledge_1',
        '--notes',
        'LGTM',
        '--source-type',
        'doc',
        '--evidence-level',
        'documented',
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/knowledge/review',
          body: expect.objectContaining({
            entryId: 'knowledge_1',
            decision: 'approve',
            notes: 'LGTM',
            evidence: {
              sourceType: 'doc',
              evidenceLevel: 'documented',
            },
          }),
        }),
      );
    });

    it('includes sourceRef when provided', async () => {
      const mockResponse = createMockResponse({
        evidenceLevel: 'documented',
        sourceType: 'doc',
        sourceRef: 'https://docs.example.com/guide',
        verifiedAt: '2026-05-02T00:00:00Z',
        verifiedBy: { id: 'user_1', handle: 'reviewer', securityLevel: 5 },
      });
      mockedApiRequest.mockResolvedValue(mockResponse);

      await program.parseAsync([
        'node',
        'test',
        'review:approve',
        'knowledge_1',
        '--notes',
        'LGTM',
        '--source-type',
        'doc',
        '--source-ref',
        'https://docs.example.com/guide',
        '--evidence-level',
        'documented',
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          body: expect.objectContaining({
            evidence: expect.objectContaining({
              sourceRef: 'https://docs.example.com/guide',
            }),
          }),
        }),
      );
    });
  });

  describe('default values', () => {
    it('uses default values when only source-type provided', async () => {
      const mockResponse = createMockResponse({
        evidenceLevel: 'anecdotal',
        sourceType: 'incident',
        verifiedAt: '2026-05-02T00:00:00Z',
        verifiedBy: { id: 'user_1', handle: 'reviewer', securityLevel: 5 },
      });
      mockedApiRequest.mockResolvedValue(mockResponse);

      await program.parseAsync([
        'node',
        'test',
        'review:approve',
        'knowledge_1',
        '--notes',
        'LGTM',
        '--source-type',
        'incident',
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          body: expect.objectContaining({
            evidence: {
              sourceType: 'incident',
              evidenceLevel: 'anecdotal',
            },
          }),
        }),
      );
    });

    it('uses default values when only evidence-level provided', async () => {
      const mockResponse = createMockResponse({
        evidenceLevel: 'reproduced',
        sourceType: 'internal-experience',
        verifiedAt: '2026-05-02T00:00:00Z',
        verifiedBy: { id: 'user_1', handle: 'reviewer', securityLevel: 5 },
      });
      mockedApiRequest.mockResolvedValue(mockResponse);

      await program.parseAsync([
        'node',
        'test',
        'review:approve',
        'knowledge_1',
        '--notes',
        'LGTM',
        '--evidence-level',
        'reproduced',
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          body: expect.objectContaining({
            evidence: {
              sourceType: 'internal-experience',
              evidenceLevel: 'reproduced',
            },
          }),
        }),
      );
    });
  });

  describe('source-type validation', () => {
    it('validates source-type using zod safeParse', async () => {
      await expect(
        program.parseAsync([
          'node',
          'test',
          'review:approve',
          'knowledge_1',
          '--notes',
          'LGTM',
          '--source-type',
          'invalid-type',
        ]),
      ).rejects.toThrow('Invalid source type: invalid-type');

      // Check error message includes valid options
      try {
        await program.parseAsync([
          'node',
          'test',
          'review:approve',
          'knowledge_1',
          '--notes',
          'LGTM',
          '--source-type',
          'invalid-type',
        ]);
      } catch (error) {
        expect((error as Error).message).toContain('internal-experience');
        expect((error as Error).message).toContain('incident');
        expect((error as Error).message).toContain('doc');
        expect((error as Error).message).toContain('code');
        expect((error as Error).message).toContain('external-reference');
      }
    });
  });

  describe('evidence-level validation', () => {
    it('validates evidence-level using zod safeParse', async () => {
      await expect(
        program.parseAsync([
          'node',
          'test',
          'review:approve',
          'knowledge_1',
          '--notes',
          'LGTM',
          '--evidence-level',
          'invalid-level',
        ]),
      ).rejects.toThrow('Invalid evidence level: invalid-level');

      // Check error message includes valid options
      try {
        await program.parseAsync([
          'node',
          'test',
          'review:approve',
          'knowledge_1',
          '--notes',
          'LGTM',
          '--evidence-level',
          'invalid-level',
        ]);
      } catch (error) {
        expect((error as Error).message).toContain('anecdotal');
        expect((error as Error).message).toContain('reproduced');
        expect((error as Error).message).toContain('documented');
        expect((error as Error).message).toContain('verified-in-prod');
      }
    });
  });

  describe('no evidence case', () => {
    it('does not include evidence when flags not provided', async () => {
      const mockResponse = createMockResponse(null);
      mockedApiRequest.mockResolvedValue(mockResponse);

      await program.parseAsync([
        'node',
        'test',
        'review:approve',
        'knowledge_1',
        '--notes',
        'LGTM',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const args = callArgs?.[1] as { body: Record<string, unknown> };
      expect(args.body).not.toHaveProperty('evidence');
    });
  });

  describe('profile-aware output', () => {
    const codexProfileState = {
      serverUrl: 'http://localhost:3000',
      sessionToken: 'test-token',
      session: null,
      outputProfile: {
        tool: 'codex' as const,
        modelHint: 'gpt' as const,
        renderMode: 'text' as const,
        graphPlanMode: 'summary' as const,
        verbosity: 'balanced' as const,
        includeRawHints: true,
      },
    };

    it('renders codex command-result JSON for review:approve', async () => {
      const { loadCliState } = await import('../lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockResponse = createMockResponse(null);
      mockedApiRequest.mockResolvedValue(mockResponse);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'review:approve',
        'knowledge_1',
        '--notes',
        'LGTM',
      ]);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('review-approve');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('knowledge_1');
      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for review:reject', async () => {
      const { loadCliState } = await import('../lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockResponse = createMockResponse(null);
      mockedApiRequest.mockResolvedValue(mockResponse);

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'review:reject',
        'knowledge_1',
        '--notes',
        'Needs revision',
      ]);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('review-reject');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('knowledge_1');
      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for review:queue', async () => {
      const { loadCliState } = await import('../lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockEntry = createMockResponse(null).data.entry;
      const queueResponse = {
        items: [
          {
            entry: mockEntry,
            agentReview: null,
            submittedBy: { id: 'user_1', handle: 'owner', securityLevel: 5 },
            lastDecision: null,
            latestSubmission: null,
            reviewNotes: [],
          },
        ],
        nextCursor: null,
        total: 1,
      };
      mockedApiRequest.mockResolvedValue({ data: queueResponse, sessionToken: 'test-token' });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'review:queue']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('review-queue');
      expect(parsed.success).toBe(true);
      consoleSpy.mockRestore();
    });
  });
});
