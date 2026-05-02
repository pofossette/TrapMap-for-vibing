import type { FeedbackResponse } from '@trapmap/contracts';
import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import * as http from '../lib/http.js';
import * as prompts from '../lib/prompts.js';
import { registerFeedbackCommands } from './feedback.js';

// Mock the dependencies
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(() => ({
    serverUrl: 'http://localhost:3000',
    sessionToken: 'mock-token',
    session: {
      member: { handle: 'testuser', securityLevel: 0 },
      effectivePermissions: ['knowledge:search'],
    },
  })),
}));

vi.mock('../lib/prompts.js', () => ({
  isInteractiveEnvironment: vi.fn(() => false),
  promptSelect: vi.fn(),
  promptInput: vi.fn(),
  promptConfirm: vi.fn(),
}));

describe('CLI feedback command', () => {
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
        ['feedback', 'trap_1', '--type', 'incorrect', '--description', 'This solution did not work'],
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

      await expect(
        program.parseAsync(['feedback', 'trap_1'], { from: 'user' }),
      ).rejects.toThrow('Non-interactive environment. Provide --type and --description flags.');

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
        ['feedback', 'trap_1', '--type', 'incorrect', '--description', 'Test description here', '--json'],
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
        ['feedback', 'skill_1', '--type', 'outdated', '--description', 'Test description', '--entry-type', 'skill'],
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
        ['feedback', 'trap_1', '--type', 'incorrect', '--description', 'Test description', '--context', 'I was trying to deploy to production'],
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
        ['feedback', 'trap_1', '--type', 'incorrect', '--description', 'Test description', '--query-seed', 'how to fix deployment error'],
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
});
