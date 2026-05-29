import type { SkillLookupResponse } from '@trapmap/contracts';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as http from '@trapmap/cli/lib/http.js';
import * as outputProfile from '@trapmap/cli/lib/output-profile.js';
import { registerSkillCommands } from './skill.js';

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

describe('CLI skill commands', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
  });

  describe('registerSkillCommands', () => {
    it('registers skill command group when allowSearch is true', () => {
      registerSkillCommands(program, {
        allowSearch: true,
        allowSubmit: false,
        allowExport: false,
        allowReview: false,
      });

      const commands = program.commands;
      const skillCommand = commands.find((cmd) => cmd.name() === 'skill');

      expect(skillCommand).toBeDefined();
      expect(skillCommand?.description()).toBe('Search and manage skill artifacts');
    });

    it('does not register skill command when allowSearch is false', () => {
      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: false,
        allowReview: false,
      });

      const commands = program.commands;
      const skillCommand = commands.find((cmd) => cmd.name() === 'skill');

      expect(skillCommand).toBeUndefined();
    });

    it('registers review subcommands when only allowReview is true', () => {
      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: false,
        allowReview: true,
      });

      const skillCmd = program.commands.find((c) => c.name() === 'skill');
      expect(skillCmd).toBeDefined();
      const reviewQueue = skillCmd?.commands.find((c) => c.name() === 'review:queue');
      expect(reviewQueue).toBeDefined();
    });

    it('registers search-by-content subcommand under skill', () => {
      registerSkillCommands(program, {
        allowSearch: true,
        allowSubmit: false,
        allowExport: false,
        allowReview: false,
      });

      const skillCommand = program.commands.find((cmd) => cmd.name() === 'skill');
      const subcommands = skillCommand?.commands || [];
      const searchCommand = subcommands.find((cmd) => cmd.name() === 'search-by-content');

      expect(searchCommand).toBeDefined();
      expect(searchCommand?.description()).toBe('Search for skills by content text');
    });

    it('search-by-content has correct argument and options', () => {
      registerSkillCommands(program, {
        allowSearch: true,
        allowSubmit: false,
        allowExport: false,
        allowReview: false,
      });

      const skillCommand = program.commands.find((cmd) => cmd.name() === 'skill');
      const searchCommand = skillCommand?.commands.find(
        (cmd) => cmd.name() === 'search-by-content',
      );

      // Check arguments
      const args = searchCommand?.registeredArguments || [];
      expect(args.length).toBe(1);
      expect(args[0].name()).toBe('text');

      // Check options
      const options = searchCommand?.options || [];
      const maxResultsOption = options.find((opt) => opt.long === '--max-results');
      const jsonOption = options.find((opt) => opt.long === '--json');

      expect(maxResultsOption).toBeDefined();
      expect(jsonOption).toBeDefined();
    });
  });

  describe('command visibility', () => {
    it('skill command is additive - does not affect other commands', () => {
      // Register some other commands first
      program.command('test1').description('Test command 1');
      program.command('test2').description('Test command 2');

      // Register skill commands
      registerSkillCommands(program, {
        allowSearch: true,
        allowSubmit: false,
        allowExport: false,
        allowReview: false,
      });

      // Verify other commands still exist
      const test1 = program.commands.find((cmd) => cmd.name() === 'test1');
      const test2 = program.commands.find((cmd) => cmd.name() === 'test2');

      expect(test1).toBeDefined();
      expect(test2).toBeDefined();

      // And skill command exists
      const skill = program.commands.find((cmd) => cmd.name() === 'skill');
      expect(skill).toBeDefined();
    });

    it('when allowSearch is false, no skill commands are registered', () => {
      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: false,
        allowReview: false,
      });

      const skillCommand = program.commands.find((cmd) => cmd.name() === 'skill');
      expect(skillCommand).toBeUndefined();
    });
  });

  describe('search-by-content execution', () => {
    const mockResponse: SkillLookupResponse = {
      matches: [
        {
          artifactId: 'artifact.db',
          title: 'Database rollout',
          slug: 'db-rollout',
          labels: ['db', 'rollout'],
          scope: 'project',
          requiredLevel: 0,
          sourceKind: 'skill-directory',
          score: 0.9,
          reason: 'Matches rollout concerns',
        },
      ],
    };

    it('renders codex tool-specific skill lookup output when configured', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue({
        serverUrl: 'http://localhost:3000',
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
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: true,
        allowSubmit: false,
        allowExport: false,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'search-by-content', 'database rollout'], {
        from: 'user',
      });

      const parsed = JSON.parse(String(consoleLogSpy.mock.calls[0]?.[0]));
      expect(parsed.type).toBe('skill-lookup');
      expect(parsed.matches[0]).toMatchObject({
        artifactId: 'artifact.db',
        title: 'Database rollout',
      });
      expect(parsed.next_steps).toEqual(['Inspect the highest-scoring skill first.']);
      consoleLogSpy.mockRestore();
    });

    it('falls back to legacy skill formatter when tool-specific renderer fails', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue({
        serverUrl: 'http://localhost:3000',
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
        data: mockResponse,
        sessionToken: 'mock-token',
      });
      const resolveRendererSpy = vi.spyOn(outputProfile, 'resolveRenderer').mockReturnValue({
        id: 'codex:skill-lookup',
        render: () => {
          throw new Error('forced render failure');
        },
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: true,
        allowSubmit: false,
        allowExport: false,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'search-by-content', 'database rollout'], {
        from: 'user',
      });

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      expect(output).toContain('artifact.db');
      expect(output).toContain('Title: Database rollout');
      resolveRendererSpy.mockRestore();
      consoleLogSpy.mockRestore();
    });
  });

  describe('profile-aware admin commands', () => {
    it('renders codex command-result JSON for skill edit when output profile is configured', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue({
        serverUrl: 'http://localhost:3000',
        sessionToken: 'mock-token',
        session: {
          member: { handle: 'testuser', securityLevel: 0 },
          effectivePermissions: ['knowledge:search', 'knowledge:submit'],
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

      const fakeHash = 'a'.repeat(64);
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: {
          artifact: {
            id: 'artifact.db',
            teamId: null,
            scope: 'project',
            labels: ['db'],
            title: 'Database Skill',
            slug: 'database-skill',
            requiredLevel: 0,
            lifecycleState: 'approved',
            owner: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
            latestRevision: 3,
            history: [
              {
                revision: 3,
                sourceHash: fakeHash,
                files: [
                  {
                    path: 'SKILL.md',
                    kind: 'skill-markdown',
                    sha256: fakeHash,
                    sizeBytes: 100,
                    mediaType: 'text/markdown',
                    source: 'SKILL.md',
                    includeInDerivation: true,
                    activationOnly: false,
                  },
                ],
                submittedAt: '2026-05-09T10:00:00Z',
                submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
                derived: null,
              },
            ],
            metadata: {
              sourceKind: 'single-skill-md',
              submissionCount: 3,
              resubmissionCount: 0,
              revisionCount: 3,
            },
            agentReview: null,
            createdAt: '2026-05-01T00:00:00Z',
            updatedAt: '2026-05-09T10:00:00Z',
          },
          previousRevision: 2,
          lifecycleTransition: { from: 'draft', to: 'approved' },
        },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: true,
        allowSubmit: true,
        allowExport: false,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'edit', 'artifact.db', '--title', 'Updated Title'], {
        from: 'user',
      });

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('skill-edit');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('artifact.db');
      expect(parsed.summary).toContain('revision 3');
      consoleLogSpy.mockRestore();
    });

    it('renders opencode command-result Markdown for skill history when output profile is configured', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue({
        serverUrl: 'http://localhost:3000',
        sessionToken: 'mock-token',
        session: {
          member: { handle: 'testuser', securityLevel: 0 },
          effectivePermissions: ['knowledge:search', 'knowledge:export'],
        },
        outputProfile: {
          tool: 'opencode',
          modelHint: 'generic',
          renderMode: 'text',
          graphPlanMode: 'summary',
          verbosity: 'balanced',
          includeRawHints: true,
        },
      });

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: {
          artifactId: 'artifact.db',
          title: 'Database Skill',
          currentRevision: 3,
          lifecycleState: 'approved',
          revisions: [
            {
              revision: 3,
              submittedAt: '2026-05-09T10:00:00Z',
              submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
              summary: 'Updated title',
              lifecycleState: 'approved',
            },
          ],
        },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: true,
        allowSubmit: false,
        allowExport: true,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'history', 'artifact.db'], {
        from: 'user',
      });

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      expect(output).toContain('# Result');
      expect(output).toContain('skill-history');
      expect(output).toContain('## Summary');
      expect(output).toContain('artifact.db');
      consoleLogSpy.mockRestore();
    });
  });

  describe('fm-agent freeze: live gaps', () => {
    it('formatSkillHistoryResponse: renders revision entries without leading spaces', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: {
          artifactId: 'artifact.db',
          title: 'Database Skill',
          currentRevision: 2,
          lifecycleState: 'approved',
          revisions: [
            {
              revision: 1,
              submittedAt: '2026-05-01T10:00:00Z',
              submittedBy: { id: 'user-1', handle: 'testuser', securityLevel: 0 },
              summary: 'Initial',
              lifecycleState: 'approved',
            },
          ],
        },
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      registerSkillCommands(program, {
        allowSearch: false,
        allowSubmit: false,
        allowExport: true,
        allowReview: false,
      });

      await program.parseAsync(['skill', 'history', 'artifact.db'], {
        from: 'user',
      });

      const output = String(consoleLogSpy.mock.calls[0]?.[0]);
      expect(output).toContain('artifact.db Database Skill');
      expect(output).toContain('History for artifact.db');

      consoleLogSpy.mockRestore();
    });
  });
});
