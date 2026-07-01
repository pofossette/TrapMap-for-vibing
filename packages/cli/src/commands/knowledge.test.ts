import type { KnowledgeEntryResponse, KnowledgeHistoryResponse } from '@trapmap/contracts';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as config from '@trapmap/cli/lib/config.js';
import * as http from '@trapmap/cli/lib/http.js';
import * as input from '@trapmap/cli/lib/input.js';
import { createMockEntry } from '@trapmap/cli/testing/cli-test-utils.js';

// Mock the dependencies
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

// Import after mocking
import { registerKnowledgeCommands } from './knowledge.js';

describe('knowledge commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatEntry function', () => {
    it('formats entry with all fields present', async () => {
      const entry = createMockEntry({
        agentReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: '2024-01-01T01:00:00Z',
          notes: ['Note 1', 'Note 2'],
        },
        reviewHistory: [
          {
            decidedAt: '2024-01-01T02:00:00Z',
            decidedBy: { id: 'reviewer-1', handle: 'reviewer', securityLevel: 5 },
            decision: 'approve',
            notes: 'Looks good',
          },
        ],
      });

      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status', 'entry-1'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('entry-1 [submitted]');
      expect(output).toContain('Scope: global');
      expect(output).toContain('Required level: 0');
      expect(output).toContain('Owner: testuser');
      expect(output).toContain('Labels: label1');
      expect(output).toContain('Shortcut: Test shortcut');
      expect(output).toContain('History: 1 revision(s)');
      expect(output).toContain('Agent review: agent-pass');
      expect(output).toContain('Agent notes: Note 1 | Note 2');
      expect(output).toContain('Last decision: approve by reviewer (Looks good)');

      consoleLogSpy.mockRestore();
    });

    it('handles entry without agentReview', async () => {
      const entry = createMockEntry({
        agentReview: null,
      });

      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status', 'entry-1'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).not.toContain('Agent review:');

      consoleLogSpy.mockRestore();
    });

    it('handles entry without reviewHistory', async () => {
      const entry = createMockEntry({
        reviewHistory: [],
      });

      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status', 'entry-1'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).not.toContain('Last decision:');

      consoleLogSpy.mockRestore();
    });

    it('formats agent notes with separator', async () => {
      const entry = createMockEntry({
        agentReview: {
          status: 'agent-pass',
          duplicateRisk: 'low',
          correctnessRisk: 'low',
          completenessRisk: 'low',
          checkedAt: '2024-01-01T01:00:00Z',
          notes: ['First note', 'Second note', 'Third note'],
        },
      });

      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status', 'entry-1'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Agent notes: First note | Second note | Third note');

      consoleLogSpy.mockRestore();
    });
  });

  describe('formatHistory function', () => {
    it('returns "No submissions found" for empty array', async () => {
      const mockResponse: KnowledgeHistoryResponse = { items: [] };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status'], { from: 'user' });

      expect(consoleLogSpy).toHaveBeenCalledWith('No submissions found');

      consoleLogSpy.mockRestore();
    });

    it('joins multiple entries with double newlines', async () => {
      const entry1 = createMockEntry({ id: 'entry-1', shortcut: 'First' });
      const entry2 = createMockEntry({ id: 'entry-2', shortcut: 'Second' });

      const mockResponse: KnowledgeHistoryResponse = { items: [entry1, entry2] };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('entry-1');
      expect(output).toContain('entry-2');
      // Check that entries are separated
      expect(output).toContain('First');
      expect(output).toContain('Second');

      consoleLogSpy.mockRestore();
    });
  });

  describe('submit command', () => {
    it('submits with required options (scope, label, shortcut)', async () => {
      const entry = createMockEntry();
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['submit', '--scope', 'global', '--label', 'label1', '--shortcut', 'Test shortcut'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/knowledge',
          body: expect.objectContaining({
            scope: 'global',
            labels: ['label1'],
            shortcut: 'Test shortcut',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('reads detail from --file option', async () => {
      const entry = createMockEntry();
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        [
          'submit',
          '--scope',
          'global',
          '--label',
          'label1',
          '--shortcut',
          'Test',
          '--file',
          '/path/to/file.txt',
        ],
        { from: 'user' },
      );

      expect(input.resolveTextInput).toHaveBeenCalledWith(
        expect.objectContaining({ file: '/path/to/file.txt' }),
        'detail',
      );

      consoleLogSpy.mockRestore();
    });

    it('parses boundary JSON option', async () => {
      const entry = createMockEntry();
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        [
          'submit',
          '--scope',
          'global',
          '--label',
          'label1',
          '--shortcut',
          'Test',
          '--boundary',
          '{"type":"test"}',
        ],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            boundary: { type: 'test' },
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('throws on invalid boundary JSON', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const program = new Command();
      program.exitOverride(() => {
        throw new Error('Command failed');
      });
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await expect(
        program.parseAsync(
          [
            'submit',
            '--scope',
            'global',
            '--label',
            'label1',
            '--shortcut',
            'Test',
            '--boundary',
            'not-valid-json',
          ],
          { from: 'user' },
        ),
      ).rejects.toThrow();

      consoleLogSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('requires authentication', async () => {
      vi.mocked(config.loadCliState).mockResolvedValueOnce({
        gatewayUrl: 'http://localhost:3000',
        sessionToken: null,
        session: null,
      });
      vi.mocked(http.requireSessionToken).mockImplementationOnce(() => {
        throw new Error('Not authenticated. Run `trapmap login` first.');
      });

      const program = new Command();
      program.exitOverride(() => {
        throw new Error('Command failed');
      });
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await expect(
        program.parseAsync(
          ['submit', '--scope', 'global', '--label', 'label1', '--shortcut', 'Test'],
          { from: 'user' },
        ),
      ).rejects.toThrow();

      expect(http.requireSessionToken).toHaveBeenCalled();
    });

    it('outputs formatted result', async () => {
      const entry = createMockEntry({ id: 'entry-123', lifecycleState: 'submitted' });
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['submit', '--scope', 'global', '--label', 'label1', '--shortcut', 'Test shortcut'],
        { from: 'user' },
      );

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Submitted entry-123');
      expect(output).toContain('Lifecycle: submitted');
      expect(output).toContain('Shortcut: Test shortcut');

      consoleLogSpy.mockRestore();
    });
  });

  describe('resubmit command', () => {
    it('resubmits with entryId and required options', async () => {
      const entry = createMockEntry({
        id: 'entry-1',
        lifecycleState: 'submitted',
        latestRevision: {
          revision: 2,
          submittedAt: '2024-01-02T00:00:00Z',
          submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
          shortcut: 'Updated shortcut',
          detail: 'Updated detail',
          labels: ['label1'],
          reviewNotes: [],
        },
      });
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['resubmit', 'entry-1', '--label', 'label1', '--shortcut', 'Updated shortcut'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/knowledge/entry-1/resubmit',
          body: expect.objectContaining({
            labels: ['label1'],
            shortcut: 'Updated shortcut',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('reads updated detail from stdin', async () => {
      const entry = createMockEntry();
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['resubmit', 'entry-1', '--label', 'label1', '--shortcut', 'Test', '--stdin'],
        { from: 'user' },
      );

      expect(input.resolveTextInput).toHaveBeenCalledWith(
        expect.objectContaining({ stdin: true }),
        'detail',
      );

      consoleLogSpy.mockRestore();
    });

    it('parses boundary JSON option', async () => {
      const entry = createMockEntry();
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        [
          'resubmit',
          'entry-1',
          '--label',
          'label1',
          '--shortcut',
          'Test',
          '--boundary',
          '{"key":"value"}',
        ],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            boundary: { key: 'value' },
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('requires authentication', async () => {
      vi.mocked(config.loadCliState).mockResolvedValueOnce({
        gatewayUrl: 'http://localhost:3000',
        sessionToken: null,
        session: null,
      });
      vi.mocked(http.requireSessionToken).mockImplementationOnce(() => {
        throw new Error('Not authenticated. Run `trapmap login` first.');
      });

      const program = new Command();
      program.exitOverride(() => {
        throw new Error('Command failed');
      });
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await expect(
        program.parseAsync(['resubmit', 'entry-1', '--label', 'label1', '--shortcut', 'Test'], {
          from: 'user',
        }),
      ).rejects.toThrow();

      expect(http.requireSessionToken).toHaveBeenCalled();
    });

    it('outputs formatted result with revision number', async () => {
      const entry = createMockEntry({
        id: 'entry-1',
        lifecycleState: 'submitted',
        latestRevision: {
          revision: 3,
          submittedAt: '2024-01-03T00:00:00Z',
          submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
          shortcut: 'Test shortcut',
          detail: 'Test detail',
          labels: ['label1'],
          reviewNotes: [],
        },
      });
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(['resubmit', 'entry-1', '--label', 'label1', '--shortcut', 'Test'], {
        from: 'user',
      });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Resubmitted entry-1');
      expect(output).toContain('Revision: 3');

      consoleLogSpy.mockRestore();
    });
  });

  describe('supersede command', () => {
    it('supersedes entry with replacement ID', async () => {
      const entry = createMockEntry({ id: 'entry-1', lifecycleState: 'deactivated' });
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(['supersede', 'entry-1', '--replacement', 'entry-2'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/knowledge/entry-1/supersede',
          body: { replacementId: 'entry-2' },
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('requires authentication', async () => {
      vi.mocked(config.loadCliState).mockResolvedValueOnce({
        gatewayUrl: 'http://localhost:3000',
        sessionToken: null,
        session: null,
      });
      vi.mocked(http.requireSessionToken).mockImplementationOnce(() => {
        throw new Error('Not authenticated. Run `trapmap login` first.');
      });

      const program = new Command();
      program.exitOverride(() => {
        throw new Error('Command failed');
      });
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await expect(
        program.parseAsync(['supersede', 'entry-1', '--replacement', 'entry-2'], { from: 'user' }),
      ).rejects.toThrow();

      expect(http.requireSessionToken).toHaveBeenCalled();
    });

    it('outputs formatted result', async () => {
      const entry = createMockEntry({ id: 'entry-1', lifecycleState: 'deactivated' });
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(['supersede', 'entry-1', '--replacement', 'entry-2'], {
        from: 'user',
      });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Superseded entry-1');
      expect(output).toContain('Lifecycle: deactivated');

      consoleLogSpy.mockRestore();
    });
  });

  describe('review-status command', () => {
    it('lists user submission history (no entryId)', async () => {
      const mockResponse: KnowledgeHistoryResponse = {
        items: [createMockEntry({ id: 'entry-1' }), createMockEntry({ id: 'entry-2' })],
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/v1/knowledge/mine',
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('shows specific entry details (with entryId)', async () => {
      const entry = createMockEntry({ id: 'entry-specific' });
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status', 'entry-specific'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/v1/knowledge/entry-specific',
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('requires authentication', async () => {
      vi.mocked(config.loadCliState).mockResolvedValueOnce({
        gatewayUrl: 'http://localhost:3000',
        sessionToken: null,
        session: null,
      });

      const program = new Command();
      program.exitOverride(() => {
        throw new Error('Command failed');
      });
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await expect(program.parseAsync(['review-status'], { from: 'user' })).rejects.toThrow();

      expect(http.requireSessionToken).toHaveBeenCalled();
    });

    it('formats entry output', async () => {
      const entry = createMockEntry({
        id: 'entry-1',
        lifecycleState: 'approved',
        shortcut: 'My Pitfall',
      });
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status', 'entry-1'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('entry-1 [approved]');
      expect(output).toContain('Shortcut: My Pitfall');

      consoleLogSpy.mockRestore();
    });

    it('formats history output', async () => {
      const mockResponse: KnowledgeHistoryResponse = {
        items: [
          createMockEntry({ id: 'entry-1', shortcut: 'First' }),
          createMockEntry({ id: 'entry-2', shortcut: 'Second' }),
        ],
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('entry-1');
      expect(output).toContain('entry-2');
      expect(output).toContain('First');
      expect(output).toContain('Second');

      consoleLogSpy.mockRestore();
    });
  });

  describe('command registration', () => {
    it('registers submit commands when allowSubmit is true', async () => {
      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('submit');
      expect(commands).toContain('resubmit');
      expect(commands).toContain('supersede');
    });

    it('registers review-status when allowInspect is true', async () => {
      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('review-status');
    });

    it('omits submit commands when allowSubmit is false', async () => {
      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).not.toContain('submit');
      expect(commands).not.toContain('resubmit');
      expect(commands).not.toContain('supersede');
    });

    it('omits review-status when allowInspect is false', async () => {
      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).not.toContain('review-status');
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

      const entry = createMockEntry({ id: 'entry-123', lifecycleState: 'submitted' });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: { entry },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['submit', '--scope', 'global', '--label', 'label1', '--shortcut', 'Test shortcut'],
        { from: 'user' },
      );

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('knowledge-submit');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('entry-123');
      expect(parsed.artifacts[0]).toMatchObject({ id: 'entry-123', newState: 'submitted' });
      consoleLogSpy.mockRestore();
    });

    it('renders codex command-result JSON for review-status when output profile is configured', async () => {
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

      const entry = createMockEntry({ id: 'entry-specific', lifecycleState: 'approved' });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: { entry },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status', 'entry-specific'], { from: 'user' });

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('knowledge-review-status');
      expect(parsed.success).toBe(true);
      expect(parsed.artifacts[0]).toMatchObject({ id: 'entry-specific', newState: 'approved' });
      consoleLogSpy.mockRestore();
    });
  });

  describe('JSON output', () => {
    it('outputs JSON when --json flag is used for submit', async () => {
      const entry = createMockEntry();
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['submit', '--scope', 'global', '--label', 'label1', '--shortcut', 'Test', '--json'],
        { from: 'user' },
      );

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('entry');
      expect(parsed.entry).toHaveProperty('id', 'entry-1');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is used for review-status', async () => {
      const entry = createMockEntry();
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status', 'entry-1', '--json'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('entry');

      consoleLogSpy.mockRestore();
    });
  });
});
