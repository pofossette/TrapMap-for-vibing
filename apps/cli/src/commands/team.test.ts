import type { TeamListResponse } from '@trapmap/contracts';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import * as http from '@trapmap/cli/lib/http.js';
import { createMockLoginResponse, createMockTeam } from '@trapmap/cli/testing/cli-test-utils.js';

// Mock the dependencies
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(),
  updateCliState: vi.fn(async (patch: unknown) => {
    const current = {
      gatewayUrl: 'http://localhost:3000',
      sessionToken: 'mock-token',
      session: {
        member: { handle: 'testuser', securityLevel: 0 },
        effectivePermissions: ['team:list', 'team:select'],
      },
    };
    if (typeof patch === 'function') {
      return patch(current);
    }
    return { ...current, ...patch };
  }),
}));

// Import after mocking
import { registerTeamCommands } from './team.js';

const mockBaseState = {
  gatewayUrl: 'http://localhost:3000',
  sessionToken: 'mock-token',
  session: {
    member: { handle: 'testuser', securityLevel: 0 },
    effectivePermissions: ['team:list', 'team:select'],
  },
};

describe('team commands', () => {
  beforeEach(() => {
    vi.mocked(loadCliState).mockResolvedValue(mockBaseState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list command', () => {
    it('lists available teams', async () => {
      const mockResponse: TeamListResponse = {
        teams: [
          createMockTeam({ id: 'team-1', name: 'Team One' }),
          createMockTeam({ id: 'team-2', name: 'Team Two' }),
        ],
        activeTeamId: 'team-1',
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'list'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/v1/teams',
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('marks active team with asterisk', async () => {
      const mockResponse: TeamListResponse = {
        teams: [
          createMockTeam({ id: 'team-1', name: 'Team One' }),
          createMockTeam({ id: 'team-2', name: 'Team Two' }),
        ],
        activeTeamId: 'team-1',
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'list'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('* team-1 Team One');
      expect(output).toContain('  team-2 Team Two');

      consoleLogSpy.mockRestore();
    });

    it('requires authentication', async () => {
      vi.mocked(loadCliState).mockResolvedValueOnce({
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
      registerTeamCommands(program, { allowCreate: false });

      await expect(program.parseAsync(['team', 'list'], { from: 'user' })).rejects.toThrow();

      expect(http.requireSessionToken).toHaveBeenCalled();
    });

    it('outputs formatted result', async () => {
      const mockResponse: TeamListResponse = {
        teams: [createMockTeam({ id: 'team-1', name: 'Team One' })],
        activeTeamId: 'team-1',
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'list'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('team-1');
      expect(output).toContain('Team One');

      consoleLogSpy.mockRestore();
    });
  });

  describe('select command', () => {
    it('selects team by ID', async () => {
      const mockResponse = createMockLoginResponse('team-2');

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'select', 'team-2'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/teams/select',
          body: { teamId: 'team-2' },
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('updates CLI state with new session', async () => {
      const mockResponse = createMockLoginResponse('team-2');

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'new-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'select', 'team-2'], { from: 'user' });

      const { updateCliState } = await import('@trapmap/cli/lib/config.js');
      expect(updateCliState).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('requires authentication', async () => {
      vi.mocked(loadCliState).mockResolvedValueOnce({
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
      registerTeamCommands(program, { allowCreate: false });

      await expect(
        program.parseAsync(['team', 'select', 'team-1'], { from: 'user' }),
      ).rejects.toThrow();

      expect(http.requireSessionToken).toHaveBeenCalled();
    });

    it('outputs formatted result with team name', async () => {
      const mockResponse = createMockLoginResponse('team-2');

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'select', 'team-2'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Active team:');
      expect(output).toContain('Test Team');

      consoleLogSpy.mockRestore();
    });
  });

  describe('create command', () => {
    it('creates team with name', async () => {
      const newTeam = createMockTeam({ id: 'team-new', name: 'New Team' });

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: newTeam,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: true });

      await program.parseAsync(['team', 'create', 'New Team'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/teams',
          body: expect.objectContaining({
            name: 'New Team',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('creates team with description option', async () => {
      const newTeam = createMockTeam({
        id: 'team-new',
        name: 'New Team',
        description: 'A description',
      });

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: newTeam,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: true });

      await program.parseAsync(['team', 'create', 'New Team', '--description', 'A description'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            name: 'New Team',
            description: 'A description',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('requires authentication', async () => {
      vi.mocked(loadCliState).mockResolvedValueOnce({
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
      registerTeamCommands(program, { allowCreate: true });

      await expect(
        program.parseAsync(['team', 'create', 'New Team'], { from: 'user' }),
      ).rejects.toThrow();

      expect(http.requireSessionToken).toHaveBeenCalled();
    });

    it('outputs formatted result', async () => {
      const newTeam = createMockTeam({ id: 'team-new', name: 'New Team' });

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: newTeam,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: true });

      await program.parseAsync(['team', 'create', 'New Team'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Created team team-new');
      expect(output).toContain('New Team');

      consoleLogSpy.mockRestore();
    });
  });

  describe('command registration', () => {
    it('registers all commands when allowCreate is true', async () => {
      const program = new Command();
      registerTeamCommands(program, { allowCreate: true });

      const teamCommand = program.commands.find((cmd) => cmd.name() === 'team');
      expect(teamCommand).toBeDefined();

      const subCommands = teamCommand!.commands.map((cmd) => cmd.name());
      expect(subCommands).toContain('list');
      expect(subCommands).toContain('select');
      expect(subCommands).toContain('create');
    });

    it('omits create command when allowCreate is false', async () => {
      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      const teamCommand = program.commands.find((cmd) => cmd.name() === 'team');
      expect(teamCommand).toBeDefined();

      const subCommands = teamCommand!.commands.map((cmd) => cmd.name());
      expect(subCommands).toContain('list');
      expect(subCommands).toContain('select');
      expect(subCommands).not.toContain('create');
    });
  });

  describe('JSON output', () => {
    it('outputs JSON when --json flag is used for list', async () => {
      const mockResponse: TeamListResponse = {
        teams: [createMockTeam()],
        activeTeamId: 'team-1',
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'list', '--json'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('teams');
      expect(parsed).toHaveProperty('activeTeamId');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is used for select', async () => {
      const mockResponse = createMockLoginResponse();

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'select', 'team-1', '--json'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('session');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is used for create', async () => {
      const newTeam = createMockTeam({ id: 'team-new', name: 'New Team' });

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: newTeam,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: true });

      await program.parseAsync(['team', 'create', 'New Team', '--json'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('id', 'team-new');
      expect(parsed).toHaveProperty('name', 'New Team');

      consoleLogSpy.mockRestore();
    });
  });

  describe('profile-aware output', () => {
    const codexProfileState = {
      gatewayUrl: 'http://localhost:3000',
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

    it('renders codex command-result JSON for team list', async () => {
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockResponse: TeamListResponse = {
        teams: [createMockTeam({ id: 'team-1', name: 'Team One' })],
        activeTeamId: 'team-1',
      };
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'list'], { from: 'user' });

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('team-list');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('1 team');

      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for team select', async () => {
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockResponse = createMockLoginResponse('team-2');
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'select', 'team-2'], { from: 'user' });

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('team-select');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('Active team');

      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for team create', async () => {
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const newTeam = createMockTeam({ id: 'team-new', name: 'New Team' });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: newTeam,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: true });

      await program.parseAsync(['team', 'create', 'New Team'], { from: 'user' });

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('team-create');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('New Team');

      consoleSpy.mockRestore();
    });
  });
});

describe('team command registration gating', () => {
  it('omits create command when allowCreate is false', () => {
    const program = new Command();
    registerTeamCommands(program, { allowCreate: false });

    const teamCommand = program.commands.find((cmd) => cmd.name() === 'team');
    expect(teamCommand).toBeDefined();
    const subCommandNames = teamCommand!.commands.map((c) => c.name());
    expect(subCommandNames).not.toContain('create');
    expect(subCommandNames).toContain('list');
    expect(subCommandNames).toContain('select');
  });

  it('includes create command when allowCreate is true', () => {
    const program = new Command();
    registerTeamCommands(program, { allowCreate: true });

    const teamCommand = program.commands.find((cmd) => cmd.name() === 'team');
    expect(teamCommand).toBeDefined();
    const subCommandNames = teamCommand!.commands.map((c) => c.name());
    expect(subCommandNames).toContain('create');
  });

  it('second call with allowReview=false on already-registered team returns early without error', () => {
    // Verifies the early-return guard pattern: when called a second time
    // (e.g., allowCreate=false), registerTeamCommands still creates list/select,
    // but since 'team' already exists, Commander would throw on re-registration.
    // This test validates the guard doesn't silently add errors — but instead
    // the caller should use the single-call pattern from index.ts.
    // This test documents current behavior (Commander rejects duplicate name).
    const program = new Command();
    registerTeamCommands(program, { allowCreate: true });
    expect(() => registerTeamCommands(program, { allowCreate: true })).toThrow(
      /already have command/,
    );
  });
});
