import type { RetrievalResponse } from '@skill-shareer/contracts';
import { retrievalResponseSchema } from '@skill-shareer/contracts';
import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import * as http from '../lib/http.js';
import { registerRetrievalCommands } from './retrieval.js';

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
        summary: null,
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
        summary: null,
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
        summary: null,
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
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--label', 'label1', '--label', 'label2'], {
        from: 'user',
      });

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
        summary: null,
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
        summary: null,
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
        summary: null,
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

  describe('permission-aware command visibility', () => {
    it('should register search command when allowSearch is true', () => {
      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      const commands = program.commands.map((c) => c.name());
      expect(commands).toContain('search');
    });

    it('should not register search command when allowSearch is false', () => {
      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: false });

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('search');
    });
  });

  describe('search command mode flag', () => {
    it('should include semantic mode by default', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            mode: 'semantic',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should support explicit mode flag', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--mode', 'semantic'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            mode: 'semantic',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should support hybrid mode flag', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--mode', 'hybrid'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            mode: 'hybrid',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('CLI passthrough for hybrid mode does not change output formatting', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Test shortcut',
            detail: 'Test detail',
            labels: ['test'],
            score: 0.9,
            reason: 'Score: 0.9',
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--mode', 'hybrid'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Output should be same format regardless of mode
      expect(output).toContain('Global constraints');
      expect(output).toContain('Test shortcut');
      expect(output).toContain('Score: 0.9');

      consoleLogSpy.mockRestore();
    });
  });

  describe('Phase 10 - citations and summary support', () => {
    it('should output full contract shape including citations in JSON mode', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'JWT Validation',
            detail: 'Test detail content',
            labels: ['security', 'auth'],
            score: 0.95,
            reason: 'Score: 0.95',
            citation: {
              source: {
                entryId: 'entry-1',
                scope: 'global',
                shortcut: 'JWT Validation',
              },
              snippet: 'Test detail content',
              tags: ['security', 'auth'],
              recallChannels: ['semantic', 'keyword'],
              scores: {
                semantic: 0.92,
                keyword: 0.85,
                graph: null,
                preRerank: 0.89,
                final: 0.95,
              },
            },
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'JWT validation', '--json'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Verify output is valid JSON matching contract schema
      const parsedOutput = JSON.parse(output);
      const validated = retrievalResponseSchema.parse(parsedOutput);

      // Citations should be present in JSON output
      expect(validated.globalConstraints[0].citation).toBeDefined();
      expect(validated.globalConstraints[0].citation?.source.entryId).toBe('entry-1');
      expect(validated.globalConstraints[0].citation?.recallChannels).toEqual(['semantic', 'keyword']);

      consoleLogSpy.mockRestore();
    });

    it('should output full contract shape including summary in JSON mode', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'JWT Validation',
            detail: 'Test detail content',
            labels: ['security'],
            score: 0.95,
            reason: 'Score: 0.95',
            citation: {
              source: {
                entryId: 'entry-1',
                scope: 'global',
                shortcut: 'JWT Validation',
              },
              snippet: 'Test detail content',
              tags: ['security'],
              recallChannels: ['semantic'],
              scores: {
                semantic: 0.95,
                keyword: null,
                graph: null,
                preRerank: 0.95,
                final: 0.95,
              },
            },
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: {
          text: 'JWT Validation: Test detail content',
          citations: [
            {
              source: {
                entryId: 'entry-1',
                scope: 'global',
                shortcut: 'JWT Validation',
              },
              snippet: 'Test detail content',
              tags: ['security'],
              recallChannels: ['semantic'],
              scores: {
                semantic: 0.95,
                keyword: null,
                graph: null,
                preRerank: 0.95,
                final: 0.95,
              },
            },
          ],
        },
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'JWT validation', '--json'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Verify output is valid JSON matching contract schema
      const parsedOutput = JSON.parse(output);
      const validated = retrievalResponseSchema.parse(parsedOutput);

      // Summary should be present in JSON output
      expect(validated.summary).toBeDefined();
      expect(validated.summary?.text).toBe('JWT Validation: Test detail content');
      expect(validated.summary?.citations).toHaveLength(1);

      consoleLogSpy.mockRestore();
    });

    it('should display curated citation information in text mode', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'JWT Validation',
            detail: 'Test detail content that shows how to validate JWT tokens properly',
            labels: ['security', 'auth'],
            score: 0.95,
            reason: 'Score: 0.95',
            citation: {
              source: {
                entryId: 'entry-1',
                scope: 'global',
                shortcut: 'JWT Validation',
              },
              snippet: 'Test detail content that shows how to validate...',
              tags: ['security', 'auth'],
              recallChannels: ['semantic', 'keyword'],
              scores: {
                semantic: 0.92,
                keyword: 0.85,
                graph: null,
                preRerank: 0.89,
                final: 0.95,
              },
            },
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'JWT validation'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Text mode should show high-value citation info (source, tags, channels)
      expect(output).toContain('entry-1');
      expect(output).toContain('JWT Validation');
      expect(output).toContain('security, auth');
      expect(output).toContain('Score: 0.95');

      consoleLogSpy.mockRestore();
    });

    it('should display summary in text mode when present', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'JWT Validation',
            detail: 'Test detail content',
            labels: ['security'],
            score: 0.95,
            reason: 'Score: 0.95',
            citation: {
              source: {
                entryId: 'entry-1',
                scope: 'global',
                shortcut: 'JWT Validation',
              },
              snippet: 'Test detail content',
              tags: ['security'],
              recallChannels: ['semantic'],
              scores: {
                semantic: 0.95,
                keyword: null,
                graph: null,
                preRerank: 0.95,
                final: 0.95,
              },
            },
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: {
          text: 'Based on 1 result:\n• JWT Validation: Test detail content',
          citations: [
            {
              source: {
                entryId: 'entry-1',
                scope: 'global',
                shortcut: 'JWT Validation',
              },
              snippet: 'Test detail content',
              tags: ['security'],
              recallChannels: ['semantic'],
              scores: {
                semantic: 0.95,
                keyword: null,
                graph: null,
                preRerank: 0.95,
                final: 0.95,
              },
            },
          ],
        },
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'JWT validation'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Text mode should show summary section
      expect(output).toContain('Summary');
      expect(output).toContain('Based on 1 result');

      consoleLogSpy.mockRestore();
    });

    it('should support --summary flag to enable summary generation', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--summary'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            includeSummary: true,
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should default includeSummary to false when flag not provided', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            includeSummary: false,
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should not compute citation fields in CLI - only display contract data', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Test shortcut',
            detail: 'Test detail',
            labels: ['test'],
            score: 0.9,
            reason: 'Score: 0.9',
            citation: {
              source: {
                entryId: 'entry-1',
                scope: 'global',
                shortcut: 'Test shortcut',
              },
              snippet: 'Test detail',
              tags: ['test'],
              recallChannels: ['semantic'],
              scores: {
                semantic: 0.9,
                keyword: null,
                graph: null,
                preRerank: 0.9,
                final: 0.9,
              },
            },
          },
        ],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--json'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');
      const parsedOutput = JSON.parse(output);

      // Verify CLI only passes through contract data from server
      // Citation fields come from server response, not computed in CLI
      expect(parsedOutput.globalConstraints[0].citation).toBeDefined();
      expect(parsedOutput.globalConstraints[0].citation?.scores.final).toBe(0.9);

      consoleLogSpy.mockRestore();
    });
  });
});
