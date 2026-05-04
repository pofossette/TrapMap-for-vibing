/**
 * Adversarial tests for CLI knowledge commands CRUD operations.
 * Phase 71 Gap 2: Verifies that knowledge commands handle real CRUD paths,
 * edge cases in formatting, and error scenarios the basic tests may miss.
 */
import type {
  KnowledgeEntry,
  KnowledgeEntryResponse,
  KnowledgeHistoryResponse,
} from '@trapmap/contracts';
import { Command } from 'commander';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import * as http from '../lib/http.js';
import * as config from '../lib/config.js';
import * as input from '../lib/input.js';

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

// Helper for minimal valid entry
function createMockEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
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

describe('knowledge commands adversarial CRUD tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('submit command CRUD edge cases', () => {
    it('sends requiredLevel as number when --required-level is specified', async () => {
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
          '--scope', 'global',
          '--label', 'auth',
          '--shortcut', 'Test',
          '--required-level', '7',
        ],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            requiredLevel: 7,
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('sends undefined requiredLevel when flag is not provided', async () => {
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
        ['submit', '--scope', 'global', '--label', 'label1', '--shortcut', 'Test'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            requiredLevel: undefined,
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('calls resolveTextInput with text option when --detail is used', async () => {
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
          '--scope', 'global',
          '--label', 'label1',
          '--shortcut', 'Test',
          '--detail', 'My detailed description',
        ],
        { from: 'user' },
      );

      expect(input.resolveTextInput).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'My detailed description' }),
        'detail',
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('resubmit command CRUD edge cases', () => {
    it('sends correct API path with entryId interpolated', async () => {
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
        ['resubmit', 'entry-42', '--label', 'label1', '--shortcut', 'Test'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/v1/knowledge/entry-42/resubmit',
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('calls resolveTextInput for detail in resubmit', async () => {
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
        ['resubmit', 'entry-1', '--label', 'label1', '--shortcut', 'Test', '--detail', 'Updated detail'],
        { from: 'user' },
      );

      expect(input.resolveTextInput).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Updated detail' }),
        'detail',
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('supersede command CRUD edge cases', () => {
    it('sends correct replacementId in body', async () => {
      const entry = createMockEntry({ id: 'entry-old', lifecycleState: 'deactivated' });
      const mockResponse: KnowledgeEntryResponse = { entry };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      await program.parseAsync(
        ['supersede', 'entry-old', '--replacement', 'entry-new'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: { replacementId: 'entry-new' },
        }),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('review-status output formatting edge cases', () => {
    it('formatEntry correctly shows multiple labels comma-separated', async () => {
      const entry = createMockEntry({
        labels: ['auth', 'security', 'bug'],
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
      expect(output).toContain('Labels: auth, security, bug');

      consoleLogSpy.mockRestore();
    });

    it('formatEntry correctly shows history revision count for multi-revision entries', async () => {
      const entry = createMockEntry({
        history: [
          {
            revision: 1,
            submittedAt: '2024-01-01T00:00:00Z',
            submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
            shortcut: 'v1',
            detail: 'd1',
            labels: ['l1'],
            reviewNotes: [],
          },
          {
            revision: 2,
            submittedAt: '2024-01-02T00:00:00Z',
            submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
            shortcut: 'v2',
            detail: 'd2',
            labels: ['l1'],
            reviewNotes: [],
          },
          {
            revision: 3,
            submittedAt: '2024-01-03T00:00:00Z',
            submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
            shortcut: 'v3',
            detail: 'd3',
            labels: ['l1'],
            reviewNotes: [],
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
      expect(output).toContain('History: 3 revision(s)');

      consoleLogSpy.mockRestore();
    });

    it('formatHistory correctly separates multiple entries with double newline', async () => {
      const entry1 = createMockEntry({ id: 'entry-1', labels: ['a'] });
      const entry2 = createMockEntry({ id: 'entry-2', labels: ['b'] });
      const mockResponse: KnowledgeHistoryResponse = { items: [entry1, entry2] };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      await program.parseAsync(['review-status'], { from: 'user' });

      // The output should contain both entries
      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('entry-1 [submitted]');
      expect(output).toContain('entry-2 [submitted]');

      consoleLogSpy.mockRestore();
    });
  });

  describe('command registration edge cases', () => {
    it('registers zero commands when both allowSubmit and allowInspect are false', () => {
      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: false });

      expect(program.commands).toHaveLength(0);
    });

    it('registers only submit-family when allowSubmit is true and allowInspect is false', () => {
      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: false, allowSubmit: true });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('submit');
      expect(commands).toContain('resubmit');
      expect(commands).toContain('supersede');
      expect(commands).not.toContain('review-status');
    });

    it('registers only review-status when allowInspect is true and allowSubmit is false', () => {
      const program = new Command();
      registerKnowledgeCommands(program, { allowInspect: true, allowSubmit: false });

      const commands = program.commands.map((cmd) => cmd.name());
      expect(commands).toContain('review-status');
      expect(commands).not.toContain('submit');
      expect(commands).not.toContain('resubmit');
      expect(commands).not.toContain('supersede');
    });
  });
});
