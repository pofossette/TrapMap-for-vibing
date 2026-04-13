import { describe, expect, it, vi } from 'vitest';
import type { RetrievalResponse } from '@skill-shareer/contracts';
import { retrievalResponseSchema } from '@skill-shareer/contracts';
import { Command } from 'commander';

import { registerRetrievalCommands } from './retrieval.js';
import * as http from '../lib/http.js';

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

vi.mock('../lib/input.js', () => ({
  collectValues: (value: string, previous: string[] = []) => [...previous, value],
  resolveTextInput: vi.fn(async (options: { text?: string; stdin?: boolean }) => {
    if (options.text) return options.text;
    if (options.stdin) return 'stdin seed content';
    throw new Error('No seed provided');
  }),
}));

describe('CLI retrieval commands', () => {
  describe('search command with text output', () => {
    it('should produce formatted search result from direct seed argument', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Test shortcut 1',
            detail: 'Test detail 1',
            labels: ['label1'],
            score: 0.95,
            reason: 'Score: 0.95',
          },
        ],
        projectKnowledge: [
          {
            entryId: 'entry-2',
            scope: 'project',
            requiredLevel: 0,
            shortcut: 'Test shortcut 2',
            detail: 'Test detail 2',
            labels: ['label2'],
            score: 0.85,
            reason: 'Score: 0.85',
          },
        ],
        refinementSummary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test seed'], { from: 'user' });

      // Verify apiRequest was called with correct parameters
      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/retrieval/search',
          body: expect.objectContaining({
            seed: 'test seed',
          }),
        }),
      );

      // Verify output contains formatted sections
      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');
      expect(output).toContain('Global constraints');
      expect(output).toContain('Project knowledge');
      expect(output).toContain('Test shortcut 1');
      expect(output).toContain('Score: 0.95');

      consoleLogSpy.mockRestore();
    });

    it('should accept piped stdin seed content when --stdin flag is used', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [
          {
            entryId: 'entry-3',
            scope: 'project',
            requiredLevel: 0,
            shortcut: 'Stdin test',
            detail: 'Detail from stdin',
            labels: ['stdin'],
            score: 0.9,
            reason: 'Score: 0.9',
          },
        ],
        refinementSummary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', '--stdin'], { from: 'user' });

      // Verify apiRequest was called with stdin content
      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/retrieval/search',
          body: expect.objectContaining({
            seed: 'stdin seed content',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('search command with JSON output', () => {
    it('should print raw contract-shaped retrieval data when --json flag is used', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Test shortcut 1',
            detail: 'Test detail 1',
            labels: ['label1'],
            score: 0.95,
            reason: 'Score: 0.95',
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test seed', '--json'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Verify output is valid JSON
      const parsedOutput = JSON.parse(output);
      expect(retrievalResponseSchema.parse(parsedOutput)).toEqual(mockResponse);

      consoleLogSpy.mockRestore();
    });
  });

  describe('search command flags', () => {
    it('should support repeated --label flags', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(
        ['search', 'test', '--label', 'label1', '--label', 'label2'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            filters: expect.objectContaining({
              labels: ['label1', 'label2'],
            }),
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should support --scope flag', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--scope', 'global'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            filters: expect.objectContaining({
              scopes: ['global'],
            }),
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should support --max-results flag', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--max-results', '20'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            maxResults: 20,
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should support --no-refinement flag', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--no-refinement'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            includeRefinement: false,
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });
  });
});
