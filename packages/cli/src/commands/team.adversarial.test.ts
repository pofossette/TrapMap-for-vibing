/**
 * Adversarial tests for CLI team commands operations.
 * Phase 71 Gap 3: Verifies team command handling of CRUD paths,
 * edge cases in output formatting, and conditional registration.
 */
import type { TeamListResponse } from '@trapmap/contracts';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as config from '@trapmap/cli/lib/config.js';
import * as http from '@trapmap/cli/lib/http.js';
import { createMockLoginResponse, createMockTeam } from '@trapmap/cli/testing/cli-test-utils.js';

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
      effectivePermissions: ['team:list', 'team:select'],
    },
  })),
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

describe('team commands adversarial tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('list command edge cases', () => {
    it('correctly marks only the active team with asterisk and pads others', async () => {
      const mockResponse: TeamListResponse = {
        teams: [
          createMockTeam({ id: 'team-1', name: 'Alpha' }),
          createMockTeam({ id: 'team-2', name: 'Beta' }),
          createMockTeam({ id: 'team-3', name: 'Gamma' }),
        ],
        activeTeamId: 'team-2',
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
      // team-2 is active, should have asterisk
      expect(output).toContain('* team-2 Beta');
      // team-1 and team-3 are not active, should have space prefix
      expect(output).toContain('  team-1 Alpha');
      expect(output).toContain('  team-3 Gamma');

      consoleLogSpy.mockRestore();
    });

    it('calls /v1/teams endpoint with no method (defaults to GET)', async () => {
      const mockResponse: TeamListResponse = {
        teams: [],
        activeTeamId: null,
      };

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'list'], { from: 'user' });

      // The implementation does not pass method for GET; it defaults in http.ts
      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/v1/teams',
        }),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('select command edge cases', () => {
    it('sends correct teamId in POST body', async () => {
      const mockResponse = createMockLoginResponse('team-new');

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'select', 'team-new'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/teams/select',
          body: { teamId: 'team-new' },
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('calls updateCliState after successful selection', async () => {
      const mockResponse = createMockLoginResponse('team-new');

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'new-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'select', 'team-new'], { from: 'user' });

      expect(config.updateCliState).toHaveBeenCalled();
      // Verify the state updater function was passed
      const updateCall = vi.mocked(config.updateCliState).mock.calls[0][0];
      expect(typeof updateCall).toBe('function');

      consoleLogSpy.mockRestore();
    });

    it('shows team name from activeTeam in output', async () => {
      const mockResponse = createMockLoginResponse('team-42');
      mockResponse.session.activeTeam = createMockTeam({ id: 'team-42', name: 'Engineering' });

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'select', 'team-42'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Active team: Engineering');

      consoleLogSpy.mockRestore();
    });
  });

  describe('create command edge cases', () => {
    it('sends name and optional description in POST body', async () => {
      const newTeam = createMockTeam({
        id: 'team-new',
        name: 'New Team',
        description: 'Team desc',
      });

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: newTeam,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: true });

      await program.parseAsync(['team', 'create', 'New Team', '--description', 'Team desc'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/teams',
          body: { name: 'New Team', description: 'Team desc' },
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('sends undefined description when not provided', async () => {
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
          body: { name: 'New Team', description: undefined },
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('outputs team id and name in formatted output', async () => {
      const newTeam = createMockTeam({ id: 'team-99', name: 'Special Team' });

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: newTeam,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: true });

      await program.parseAsync(['team', 'create', 'Special Team'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Created team team-99');
      expect(output).toContain('Special Team');

      consoleLogSpy.mockRestore();
    });
  });

  describe('authentication enforcement across all commands', () => {
    it('requireSessionToken is called before API request in list', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: { teams: [], activeTeamId: null } as TeamListResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'list'], { from: 'user' });

      expect(http.requireSessionToken).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('requireSessionToken is called before API request in select', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: createMockLoginResponse(),
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: false });

      await program.parseAsync(['team', 'select', 'team-1'], { from: 'user' });

      expect(http.requireSessionToken).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('requireSessionToken is called before API request in create', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: createMockTeam(),
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerTeamCommands(program, { allowCreate: true });

      await program.parseAsync(['team', 'create', 'Test'], { from: 'user' });

      expect(http.requireSessionToken).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });
});
