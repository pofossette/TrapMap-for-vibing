import type { RetrievalResponse, RetrievalV2Response } from '@trapmap/contracts';
import { retrievalResponseSchema, retrievalV2ResponseSchema } from '@trapmap/contracts';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as http from '@trapmap/cli/lib/http.js';
import { registerRetrievalCommands } from './retrieval.js';

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
  beforeEach(async () => {
    const { loadCliState } = await import('@trapmap/cli/lib/config.js');
    vi.mocked(loadCliState).mockResolvedValue({
      gatewayUrl: 'http://localhost:3000',
      sessionToken: 'mock-token',
      session: {
        member: { handle: 'testuser', securityLevel: 0 },
        effectivePermissions: ['knowledge:search'],
      },
    });
  });

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

  describe('adaptive output profile rendering', () => {
    it('renders claude-code text for v2 retrieval when output profile is configured', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue({
        gatewayUrl: 'http://localhost:3000',
        sessionToken: 'mock-token',
        session: {
          member: { handle: 'testuser', securityLevel: 0 },
          effectivePermissions: ['knowledge:search'],
        },
        outputProfile: {
          tool: 'claude-code',
          modelHint: 'claude',
          renderMode: 'text',
          graphPlanMode: 'summary',
          verbosity: 'balanced',
          includeRawHints: true,
        },
      });

      const mockResponse: RetrievalV2Response = {
        capsules: [
          {
            capsuleId: 'cap-1',
            artifactId: 'skill-1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Use the cache invalidation skill.',
            situation: 'Need cache guidance',
            problem: 'Cache invalidation mistakes',
            goal: 'Apply safer cache flow',
            labels: ['cache'],
            scope: 'project',
            requiredLevel: 0,
            score: 0.97,
            reason: 'High semantic match',
          },
        ],
        profileHints: [],
        refinementSummary: null,
        summary: {
          text: 'Prefer the cache invalidation skill.',
          citations: [
            {
              source: {
                entryId: 'entry-1',
                scope: 'project',
                shortcut: 'Cache invalidation',
              },
              snippet: 'Use the cache invalidation skill.',
              tags: ['cache'],
              recallChannels: ['semantic'],
              sourceType: 'capsule',
              scores: {
                semantic: 0.97,
                keyword: null,
                graph: null,
                preRerank: 0.95,
                final: 0.97,
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

      await program.parseAsync(['search', 'cache invalidation', '--v2'], { from: 'user' });

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      expect(output).toContain('<trapmap_skill_pack>');
      expect(output).toContain('cache invalidation skill');
      consoleLogSpy.mockRestore();
    });

    it('falls back to legacy formatter when codex retrieval-v2 renderer fails', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue({
        gatewayUrl: 'http://localhost:3000',
        sessionToken: 'mock-token',
        session: {
          member: { handle: 'testuser', securityLevel: 0 },
          effectivePermissions: ['knowledge:search'],
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

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: {
          capsules: [],
          profileHints: [],
          refinementSummary: null,
          summary: null,
          failRender: true,
        },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'cache invalidation', '--v2'], { from: 'user' });

      expect(String(consoleLogSpy.mock.calls[0]?.[0])).toContain('No results found');
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
              sourceType: 'knowledge',
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
      expect(validated.globalConstraints[0].citation?.recallChannels).toEqual([
        'semantic',
        'keyword',
      ]);

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
              sourceType: 'knowledge',
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
              sourceType: 'knowledge',
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
              sourceType: 'knowledge',
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
              sourceType: 'knowledge',
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
              sourceType: 'knowledge',
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
              sourceType: 'knowledge',
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

  // Phase 14: v2 retrieval CLI tests (COMP-03, RETR-01, RETR-04)
  describe('v2 retrieval with --v2 flag', () => {
    it('should call v2 endpoint when --v2 flag is provided', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [],
        profileHints: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test seed', '--v2'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v2/retrieval/search',
          body: expect.objectContaining({
            seed: 'test seed',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should send seed-only input to v2 endpoint (RETR-01)', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [],
        profileHints: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockClear();
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'my seed query', '--v2'], { from: 'user' });

      // Verify v2 request body has only seed and allowed v2 fields
      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/v2/retrieval/search',
          body: expect.objectContaining({
            seed: 'my seed query',
            maxResults: 10, // default
          }),
        }),
      );

      // Verify v1-only fields are NOT sent
      const callArgs = vi.mocked(http.apiRequest).mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs[1].body as Record<string, unknown>;
      expect(body).not.toHaveProperty('includeRefinement');
      expect(body).not.toHaveProperty('includeSummary');
      expect(body).not.toHaveProperty('mode');

      consoleLogSpy.mockRestore();
    });

    it('should format capsule-first text output without bundle payloads (RETR-04, T-14-11)', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [
          {
            capsuleId: 'capsule-1',
            artifactId: 'artifact-1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Distilled capsule content',
            situation: 'Docker container fails to start',
            problem: 'Missing environment variable',
            goal: 'Add required ENV variable to docker-compose',
            labels: ['docker', 'containers'],
            scope: 'global',
            requiredLevel: 0,
            score: 0.95,
            reason: 'High situation match',
          },
        ],
        profileHints: [
          {
            artifactId: 'artifact-1',
            title: 'Docker Debugging',
            slug: 'docker-debugging',
            labels: ['docker', 'debugging'],
          },
        ],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'docker problem', '--v2'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Verify capsule-first sections are present
      expect(output).toContain('Capsules');
      expect(output).toContain('capsule-1');
      expect(output).toContain('Docker container fails to start');
      expect(output).toContain('Missing environment variable');
      expect(output).toContain('Add required ENV variable');
      expect(output).toContain('Profile hints');

      consoleLogSpy.mockRestore();
    });

    it('should output full v2 contract shape in JSON mode', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [
          {
            capsuleId: 'capsule-1',
            artifactId: 'artifact-1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Distilled content',
            situation: 'Situation text',
            problem: 'Problem text',
            goal: 'Goal text',
            labels: ['test'],
            scope: 'global',
            requiredLevel: 0,
            score: 0.9,
            reason: 'Match reason',
          },
        ],
        profileHints: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--v2', '--json'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Verify output is valid JSON matching v2 contract schema
      const parsedOutput = JSON.parse(output);
      const validated = retrievalV2ResponseSchema.parse(parsedOutput);

      expect(validated.capsules).toHaveLength(1);
      expect(validated.capsules[0].capsuleId).toBe('capsule-1');
      expect(validated.capsules[0].content).toBe('Distilled content');

      consoleLogSpy.mockRestore();
    });

    it('should support --max-results flag with --v2', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [],
        profileHints: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--v2', '--max-results', '5'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            maxResults: 5,
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should support filter flags with --v2', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [],
        profileHints: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(
        ['search', 'test', '--v2', '--label', 'docker', '--scope', 'global'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            filters: expect.objectContaining({
              labels: ['docker'],
              scopes: ['global'],
            }),
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should display summary in v2 text mode when present', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [
          {
            capsuleId: 'capsule-1',
            artifactId: 'artifact-1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Content',
            situation: 'Situation',
            problem: 'Problem',
            goal: 'Goal',
            labels: ['test'],
            scope: 'global',
            requiredLevel: 0,
            score: 0.9,
            reason: 'Match',
          },
        ],
        profileHints: [],
        refinementSummary: null,
        summary: {
          text: 'Summary of capsule matches',
          citations: [
            {
              source: {
                entryId: 'capsule-1',
                scope: 'global',
                shortcut: 'Capsule 1',
              },
              snippet: 'Content',
              tags: ['test'],
              recallChannels: ['semantic'],
              sourceType: 'capsule',
              scores: {
                semantic: 0.9,
                keyword: null,
                graph: null,
                preRerank: 0.9,
                final: 0.9,
              },
            },
          ],
        },
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--v2'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      expect(output).toContain('Summary');
      expect(output).toContain('Summary of capsule matches');

      consoleLogSpy.mockRestore();
    });

    it('should preserve single-seed UX when using --v2 flag (RETR-01)', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [],
        profileHints: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      // Just seed argument, no additional required flags
      await program.parseAsync(['search', 'simple seed query', '--v2'], { from: 'user' });

      // Verify seed was sent as-is
      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/v2/retrieval/search',
          body: expect.objectContaining({
            seed: 'simple seed query',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('should ignore v1-only flags when using --v2', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [],
        profileHints: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockClear();
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      // Pass v1-only flags along with --v2
      await program.parseAsync(['search', 'test', '--v2', '--no-refinement', '--mode', 'hybrid'], {
        from: 'user',
      });

      const callArgs = vi.mocked(http.apiRequest).mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs[1].body as Record<string, unknown>;

      // v2 endpoint should not receive v1-only fields
      expect(body).not.toHaveProperty('includeRefinement');
      expect(body).not.toHaveProperty('mode');

      consoleLogSpy.mockRestore();
    });
  });

  // Phase 16-02: CLI metadata-only output boundary (T-16-06)
  describe('CLI metadata-only output boundary (Phase 16-02)', () => {
    it('v2 text output does not surface raw bundle payloads', async () => {
      // V2 response contains capsules with distilled content, not bundle payloads
      const mockV2Response: RetrievalV2Response = {
        capsules: [
          {
            capsuleId: 'capsule-1',
            artifactId: 'artifact-1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Distilled capsule content',
            situation: 'Docker container fails to start',
            problem: 'Missing environment variable',
            goal: 'Add required ENV variable',
            labels: ['docker'],
            scope: 'global',
            requiredLevel: 0,
            score: 0.95,
            reason: 'High match',
          },
        ],
        profileHints: [],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--v2'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Output should show capsule metadata fields
      expect(output).toContain('Docker container fails to start');
      expect(output).toContain('Missing environment variable');
      expect(output).toContain('Add required ENV variable');
      // Should NOT contain any raw bundle payload markers
      expect(output).not.toContain('bundle:');
      expect(output).not.toContain('payload:');
      expect(output).not.toContain('scriptBody:');
      expect(output).not.toContain('assetContent:');

      consoleLogSpy.mockRestore();
    });

    it('v1 text output does not surface embedding vectors', async () => {
      // V1 response contains entry metadata, not internal embedding data
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Test Entry',
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

      await program.parseAsync(['search', 'test'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Output should show entry metadata
      expect(output).toContain('Test Entry');
      expect(output).toContain('Score: 0.9');
      // Should NOT contain embedding vector data
      expect(output).not.toContain('embedding:');
      expect(output).not.toContain('vector:');
      expect(output).not.toContain('[0.');

      consoleLogSpy.mockRestore();
    });

    it('v2 JSON output does not include script bodies or asset payloads', async () => {
      const mockV2Response: RetrievalV2Response = {
        capsules: [
          {
            capsuleId: 'capsule-1',
            artifactId: 'artifact-1',
            revision: 1,
            sourcePaths: ['SKILL.md'],
            content: 'Capsule content',
            situation: 'Situation',
            problem: 'Problem',
            goal: 'Goal',
            labels: ['test'],
            scope: 'global',
            requiredLevel: 0,
            score: 0.9,
            reason: 'Match',
          },
        ],
        profileHints: [
          {
            artifactId: 'artifact-1',
            title: 'Test Artifact',
            slug: 'test-artifact',
            labels: ['test'],
          },
        ],
        refinementSummary: null,
        summary: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockV2Response,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerRetrievalCommands(program, { allowSearch: true });

      await program.parseAsync(['search', 'test', '--v2', '--json'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      // Parse output as JSON
      const parsed = JSON.parse(output);

      // Capsules should not have script body or asset payload fields
      expect(parsed.capsules).toBeDefined();
      expect(parsed.capsules[0]).not.toHaveProperty('scriptBody');
      expect(parsed.capsules[0]).not.toHaveProperty('assetPayload');
      expect(parsed.capsules[0]).not.toHaveProperty('bundlePayload');

      // Profile hints should be metadata-only
      expect(parsed.profileHints).toBeDefined();
      expect(parsed.profileHints[0]).not.toHaveProperty('content');
      expect(parsed.profileHints[0]).not.toHaveProperty('files');

      consoleLogSpy.mockRestore();
    });

    it('v1 JSON output does not include internal metadata fields', async () => {
      const mockResponse: RetrievalResponse = {
        globalConstraints: [
          {
            entryId: 'entry-1',
            scope: 'global',
            requiredLevel: 0,
            shortcut: 'Test',
            detail: 'Detail',
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

      await program.parseAsync(['search', 'test', '--json'], { from: 'user' });

      const outputCalls = consoleLogSpy.mock.calls.map((call) => call[0]);
      const output = outputCalls.join('\n');

      const parsed = JSON.parse(output);

      // Entries should not expose internal fields
      expect(parsed.globalConstraints[0]).not.toHaveProperty('embeddingCache');
      expect(parsed.globalConstraints[0]).not.toHaveProperty('indexState');
      expect(parsed.globalConstraints[0]).not.toHaveProperty('ownerUserId');

      consoleLogSpy.mockRestore();
    });
  });
});
