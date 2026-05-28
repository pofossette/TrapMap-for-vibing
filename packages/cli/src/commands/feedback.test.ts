import type {
  FeedbackBatchResponse,
  FeedbackListResponse,
  FeedbackResponse,
} from '@trapmap/contracts';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import * as http from '@trapmap/cli/lib/http.js';
import * as prompts from '@trapmap/cli/lib/prompts.js';
import { registerFeedbackAdminCommands } from './feedback-admin.js';
import { registerFeedbackCommands } from './feedback.js';

// Mock the dependencies
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(),
}));

vi.mock('../lib/prompts.js', () => ({
  isInteractiveEnvironment: vi.fn(() => false),
  promptSelect: vi.fn(),
  promptInput: vi.fn(),
  promptConfirm: vi.fn(),
}));

const mockBaseState = {
  serverUrl: 'http://localhost:3000',
  sessionToken: 'mock-token',
  session: {
    member: { handle: 'testuser', securityLevel: 0 },
    effectivePermissions: ['knowledge:search'],
  },
};

describe('CLI feedback command', () => {
  beforeEach(() => {
    vi.mocked(loadCliState).mockResolvedValue(mockBaseState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockFeedbackResponse: FeedbackResponse = {
    feedback: {
      id: 'fb_test123',
      entryId: 'trap_1',
      entryType: 'trap',
      problemType: 'incorrect',
      description: 'This solution did not work for my use case',
      context: undefined,
      querySeed: undefined,
      customAnswers: undefined,
      submittedAt: '2026-05-02T12:00:00Z',
      submittedBy: {
        id: 'member_1',
        handle: 'testuser',
        securityLevel: 0,
      },
      status: 'new',
    },
  };

  describe('non-interactive mode with flags', () => {
    it('submits feedback with all required flags', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockFeedbackResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await program.parseAsync(
        [
          'feedback',
          'trap_1',
          '--type',
          'incorrect',
          '--description',
          'This solution did not work',
        ],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/feedback',
          body: expect.objectContaining({
            entryId: 'trap_1',
            entryType: 'trap',
            problemType: 'incorrect',
            description: 'This solution did not work',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('rejects invalid problem type', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await expect(
        program.parseAsync(
          ['feedback', 'trap_1', '--type', 'invalid-type', '--description', 'Test description'],
          { from: 'user' },
        ),
      ).rejects.toThrow('Invalid problem type: invalid-type');

      consoleErrorSpy.mockRestore();
    });

    it('rejects invalid entry type', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await expect(
        program.parseAsync(
          [
            'feedback',
            'entry_1',
            '--entry-type',
            'invalid',
            '--type',
            'incorrect',
            '--description',
            'test description here',
          ],
          { from: 'user' },
        ),
      ).rejects.toThrow();

      consoleErrorSpy.mockRestore();
    });

    it('requires description in non-interactive mode', async () => {
      vi.mocked(prompts.isInteractiveEnvironment).mockReturnValue(false);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await expect(
        program.parseAsync(['feedback', 'trap_1', '--type', 'incorrect'], { from: 'user' }),
      ).rejects.toThrow('Non-interactive environment. Provide --description flag.');

      consoleErrorSpy.mockRestore();
    });

    it('requires type in non-interactive mode', async () => {
      vi.mocked(prompts.isInteractiveEnvironment).mockReturnValue(false);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await expect(program.parseAsync(['feedback', 'trap_1'], { from: 'user' })).rejects.toThrow(
        'Non-interactive environment. Provide --type and --description flags.',
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('successful submission', () => {
    it('displays feedback ID after successful submission', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockFeedbackResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await program.parseAsync(
        ['feedback', 'trap_1', '--type', 'incorrect', '--description', 'Test description here'],
        { from: 'user' },
      );

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');
      expect(output).toContain('fb_test123');
      expect(output).toContain('trap_1');
      expect(output).toContain('incorrect');
      expect(output).toContain('new');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is provided', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockFeedbackResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await program.parseAsync(
        [
          'feedback',
          'trap_1',
          '--type',
          'incorrect',
          '--description',
          'Test description here',
          '--json',
        ],
        { from: 'user' },
      );

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');
      expect(output).toContain('"id": "fb_test123"');
      expect(output).toContain('"entryId": "trap_1"');

      consoleLogSpy.mockRestore();
    });
  });

  describe('entry type handling', () => {
    it('defaults entry type to trap when not specified', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockFeedbackResponse,
        sessionToken: 'mock-token',
      });

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await program.parseAsync(
        ['feedback', 'trap_1', '--type', 'incorrect', '--description', 'Test description'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            entryType: 'trap',
          }),
        }),
      );
    });

    it('accepts skill as entry type', async () => {
      const skillResponse: FeedbackResponse = {
        feedback: {
          ...mockFeedbackResponse.feedback,
          entryId: 'skill_1',
          entryType: 'skill',
        },
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: skillResponse,
        sessionToken: 'mock-token',
      });

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await program.parseAsync(
        [
          'feedback',
          'skill_1',
          '--type',
          'outdated',
          '--description',
          'Test description',
          '--entry-type',
          'skill',
        ],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            entryId: 'skill_1',
            entryType: 'skill',
          }),
        }),
      );
    });
  });

  describe('optional fields', () => {
    it('includes context when provided', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockFeedbackResponse,
        sessionToken: 'mock-token',
      });

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await program.parseAsync(
        [
          'feedback',
          'trap_1',
          '--type',
          'incorrect',
          '--description',
          'Test description',
          '--context',
          'I was trying to deploy to production',
        ],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            context: 'I was trying to deploy to production',
          }),
        }),
      );
    });

    it('includes query seed when provided', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockFeedbackResponse,
        sessionToken: 'mock-token',
      });

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await program.parseAsync(
        [
          'feedback',
          'trap_1',
          '--type',
          'incorrect',
          '--description',
          'Test description',
          '--query-seed',
          'how to fix deployment error',
        ],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            querySeed: 'how to fix deployment error',
          }),
        }),
      );
    });
  });

  describe('visibility control', () => {
    it('does not register command when allowSubmit is false', () => {
      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: false });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).not.toContain('feedback');
    });

    it('registers command when allowSubmit is true', () => {
      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('feedback');
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

    it('renders codex command-result JSON for feedback submit', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockFeedbackResponse,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackCommands(program, { allowSubmit: true });

      await program.parseAsync(
        ['feedback', 'trap_1', '--type', 'incorrect', '--description', 'Test description here'],
        { from: 'user' },
      );

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('feedback-submit');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('fb_test123');
      consoleSpy.mockRestore();
    });
  });
});

describe('CLI feedback admin commands', () => {
  beforeEach(() => {
    vi.mocked(loadCliState).mockResolvedValue(mockBaseState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  const mockListResponse: FeedbackListResponse = {
    items: [
      {
        id: 'feedback_1',
        entryId: 'trap_1',
        entryType: 'trap',
        entryShortcut: 'test-trap',
        problemType: 'outdated',
        description: 'This content is outdated',
        context: null,
        submittedAt: '2026-05-02T12:00:00Z',
        submittedBy: { id: 'user_1', handle: 'tester', securityLevel: 0 },
        status: 'new',
        ageDays: 2,
        adminNotes: null,
      },
    ],
    total: 1,
  };

  const mockBatchResponse: FeedbackBatchResponse = {
    action: 'resolve',
    dryRun: false,
    items: [{ feedbackId: 'feedback_1', eligible: true, reason: null, transitionApplied: false }],
    totalEligible: 1,
    totalIneligible: 0,
    appliedAt: '2026-05-03T12:00:00Z',
  };

  describe('feedback-list command', () => {
    it('calls API with correct query params', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockListResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(['feedback-list', '--status', 'new', '--limit', '10'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: expect.stringContaining('/v1/operations/feedback'),
        }),
      );
      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: expect.stringContaining('status=new'),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('outputs human-readable format by default', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockListResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(['feedback-list'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');
      expect(output).toContain('feedback_1');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON with --json flag', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockListResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(['feedback-list', '--json'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');
      expect(output).toContain('"feedback_1"');

      consoleLogSpy.mockRestore();
    });

    it('handles empty results gracefully', async () => {
      const emptyResponse: FeedbackListResponse = { items: [], total: 0 };
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: emptyResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(['feedback-list'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');
      expect(output).toContain('No feedback found');

      consoleLogSpy.mockRestore();
    });
  });

  describe('feedback-batch command', () => {
    it('calls API with resolve action', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockBatchResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(['feedback-batch', '--action', 'resolve', '--ids', 'feedback_1'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/feedback/batch',
          body: expect.objectContaining({
            action: 'resolve',
            feedbackIds: ['feedback_1'],
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('calls API with dismiss action', async () => {
      const dismissResponse: FeedbackBatchResponse = {
        ...mockBatchResponse,
        action: 'dismiss',
      };
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: dismissResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(['feedback-batch', '--action', 'dismiss', '--ids', 'feedback_1'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            action: 'dismiss',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('includes notes when provided', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockBatchResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(
        ['feedback-batch', '--action', 'resolve', '--ids', 'feedback_1', '--notes', 'Fixed in v2'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            notes: 'Fixed in v2',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('handles dry-run mode', async () => {
      const dryRunResponse: FeedbackBatchResponse = {
        ...mockBatchResponse,
        dryRun: true,
        appliedAt: null,
      };
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: dryRunResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(
        ['feedback-batch', '--action', 'resolve', '--ids', 'feedback_1', '--dry-run'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            dryRun: true,
          }),
        }),
      );

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');
      expect(output).toContain('DRY RUN');

      consoleLogSpy.mockRestore();
    });

    it('outputs eligible/ineligible items', async () => {
      const mixedResponse: FeedbackBatchResponse = {
        action: 'resolve',
        dryRun: false,
        items: [
          { feedbackId: 'feedback_1', eligible: true, reason: null, transitionApplied: false },
          {
            feedbackId: 'feedback_2',
            eligible: false,
            reason: 'Feedback already resolved',
            transitionApplied: false,
          },
        ],
        totalEligible: 1,
        totalIneligible: 1,
        appliedAt: '2026-05-03T12:00:00Z',
      };
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mixedResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(
        ['feedback-batch', '--action', 'resolve', '--ids', 'feedback_1,feedback_2'],
        { from: 'user' },
      );

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');
      expect(output).toContain('Eligible: 1');
      expect(output).toContain('Ineligible: 1');

      consoleLogSpy.mockRestore();
    });
  });

  describe('visibility control', () => {
    it('does not register commands when allowManage is false', () => {
      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: false });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).not.toContain('feedback-list');
      expect(commands).not.toContain('feedback-batch');
    });

    it('registers commands when allowManage is true', () => {
      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('feedback-list');
      expect(commands).toContain('feedback-batch');
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

    it('renders codex command-result JSON for feedback-list', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockListResponse,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(['feedback-list'], { from: 'user' });

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('feedback-list');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('1');
      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for feedback-batch', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockBatchResponse,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerFeedbackAdminCommands(program, { allowManage: true });

      await program.parseAsync(['feedback-batch', '--action', 'resolve', '--ids', 'feedback_1'], {
        from: 'user',
      });

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('feedback-batch');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('resolve');
      consoleSpy.mockRestore();
    });
  });
});
