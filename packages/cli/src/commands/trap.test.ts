import type {
  KnowledgeEntry,
  KnowledgeEntryResponse,
  KnowledgeHistoryResponse,
} from '@trapmap/contracts';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as http from '@trapmap/cli/lib/http.js';

vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(() => ({
    gatewayUrl: 'http://localhost:3000',
    sessionToken: 'mock-token',
    session: {
      member: { handle: 'testuser', securityLevel: 0 },
      effectivePermissions: ['knowledge:submit'],
    },
  })),
}));

vi.mock('../lib/input.js', () => ({
  collectValues: (value: string, previous: string[] = []) => [...previous, value],
  resolveTextInput: vi.fn(async (options: { file?: string; stdin?: boolean; text?: string }) => {
    if (options.text) return options.text;
    if (options.file) return 'file content';
    if (options.stdin) return 'stdin content';
    return '';
  }),
}));

import { registerTrapCommands } from './trap.js';

function createMockEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  return {
    id: 'trap-1',
    teamId: null,
    scope: 'global',
    labels: ['pitfall'],
    shortcut: 'Test trap shortcut',
    detail: 'Test trap detail',
    requiredLevel: 0,
    lifecycleState: 'submitted',
    owner: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
    latestRevision: {
      revision: 1,
      submittedAt: '2024-01-01T00:00:00Z',
      submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
      shortcut: 'Test trap shortcut',
      detail: 'Test trap detail',
      labels: ['pitfall'],
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt: '2024-01-01T00:00:00Z',
        submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
        shortcut: 'Test trap shortcut',
        detail: 'Test trap detail',
        labels: ['pitfall'],
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

describe('trap commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submit command', () => {
    it('submits with required options', async () => {
      const entry = createMockEntry();
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: { entry },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = new Command();
      registerTrapCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['trap', 'submit', '--scope', 'global', '--label', 'pitfall', '--shortcut', 'Test trap'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/knowledge',
          body: expect.objectContaining({
            scope: 'global',
            labels: ['pitfall'],
            shortcut: 'Test trap',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('outputs formatted result', async () => {
      const entry = createMockEntry({ id: 'trap-123', lifecycleState: 'submitted' });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: { entry },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = new Command();
      registerTrapCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['trap', 'submit', '--scope', 'global', '--label', 'pitfall', '--shortcut', 'Test trap'],
        { from: 'user' },
      );

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Submitted trap-123');
      expect(output).toContain('Lifecycle: submitted');

      consoleLogSpy.mockRestore();
    });
  });

  describe('list command', () => {
    it('lists trap submissions', async () => {
      const mockResponse: KnowledgeHistoryResponse = {
        items: [
          createMockEntry({ id: 'trap-1', shortcut: 'First trap' }),
          createMockEntry({ id: 'trap-2', shortcut: 'Second trap' }),
        ],
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = new Command();
      registerTrapCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['trap', 'list'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('trap-1');
      expect(output).toContain('trap-2');

      consoleLogSpy.mockRestore();
    });
  });

  describe('show command', () => {
    it('shows trap entry details', async () => {
      const entry = createMockEntry({ id: 'trap-specific', lifecycleState: 'approved' });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: { entry },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = new Command();
      registerTrapCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['trap', 'show', 'trap-specific'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('trap-specific [approved]');

      consoleLogSpy.mockRestore();
    });
  });

  describe('command registration', () => {
    it('registers submit and resubmit when allowSubmit is true', () => {
      const program = new Command();
      registerTrapCommands(program, { allowInspect: false, allowSubmit: true });

      const trapCmd = program.commands.find((cmd) => cmd.name() === 'trap');
      const subcmds = trapCmd?.commands.map((cmd) => cmd.name()) ?? [];
      expect(subcmds).toContain('submit');
      expect(subcmds).toContain('resubmit');
    });

    it('registers list and show when allowInspect is true', () => {
      const program = new Command();
      registerTrapCommands(program, { allowInspect: true, allowSubmit: false });

      const trapCmd = program.commands.find((cmd) => cmd.name() === 'trap');
      const subcmds = trapCmd?.commands.map((cmd) => cmd.name()) ?? [];
      expect(subcmds).toContain('list');
      expect(subcmds).toContain('show');
    });
  });

  describe('profile-aware output', () => {
    it('renders codex command-result JSON for submit when output profile is configured', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue({
        gatewayUrl: 'http://localhost:3000',
        sessionToken: 'mock-token',
        session: {
          member: { handle: 'testuser', securityLevel: 0 },
          effectivePermissions: ['knowledge:submit'],
        },
        outputProfile: {
          tool: 'codex',
          modelHint: 'gpt',
          renderMode: 'text',
          graphPlanMode: 'summary',
          verbosity: 'balanced',
          includeRawHints: true,
        },
      });

      const entry = createMockEntry({ id: 'trap-456', lifecycleState: 'submitted' });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: { entry },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = new Command();
      registerTrapCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['trap', 'submit', '--scope', 'global', '--label', 'pitfall', '--shortcut', 'Test trap'],
        { from: 'user' },
      );

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('trap-submit');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('trap-456');
      expect(parsed.artifacts[0]).toMatchObject({ id: 'trap-456', newState: 'submitted' });
      consoleLogSpy.mockRestore();
    });

    it('renders codex command-result JSON for show when output profile is configured', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue({
        gatewayUrl: 'http://localhost:3000',
        sessionToken: 'mock-token',
        session: {
          member: { handle: 'testuser', securityLevel: 0 },
          effectivePermissions: ['knowledge:submit'],
        },
        outputProfile: {
          tool: 'codex',
          modelHint: 'gpt',
          renderMode: 'text',
          graphPlanMode: 'summary',
          verbosity: 'balanced',
          includeRawHints: true,
        },
      });

      const entry = createMockEntry({ id: 'trap-show', lifecycleState: 'approved' });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: { entry },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = new Command();
      registerTrapCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['trap', 'show', 'trap-show'], { from: 'user' });

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('trap-show');
      expect(parsed.success).toBe(true);
      expect(parsed.artifacts[0]).toMatchObject({ id: 'trap-show', newState: 'approved' });
      consoleLogSpy.mockRestore();
    });
  });
});
