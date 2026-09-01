import type { IssueAccessKeyResponse, Member } from '@trapmap/contracts';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import * as http from '@trapmap/cli/lib/http.js';

// Mock dependencies
vi.mock('../../src/lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../../src/lib/config.js', () => ({
  loadCliState: vi.fn(),
}));

import { registerMemberCommands } from '../../src/commands/member.js';

const mockBaseState = {
  gatewayUrl: 'http://localhost:3000',
  sessionToken: 'mock-token',
  session: {
    member: { handle: 'testuser', securityLevel: 5 },
    effectivePermissions: ['member:create', 'member:update', 'member:key:create'],
  },
};

function createMockMember(overrides: Partial<Member> = {}): Member {
  return {
    id: 'member-1',
    teamId: 'team-1',
    handle: 'testuser',
    roleTemplate: 'user',
    securityLevel: 0,
    permissions: [],
    notes: null,
    isSystem: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function createMockAccessKeyResponse(): IssueAccessKeyResponse {
  return {
    accessKey: 'ak_abcdefghijklmnopqrstuvwxyz',
    record: {
      id: 'ak-1',
      memberId: 'member-1',
      tokenPreview: 'ak_abc...xyz',
      issuedBy: { id: 'admin-1', handle: 'admin', securityLevel: 10 },
      teamId: 'team-1',
      level: 3,
      notes: null,
      revokedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  };
}

describe('member commands', () => {
  beforeEach(() => {
    vi.mocked(loadCliState).mockResolvedValue(mockBaseState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('member create', () => {
    it('calls API with correct body', async () => {
      const mockMember = createMockMember();
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockMember,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: true,
        allowMemberUpdate: false,
        allowAccessKeyCreate: false,
      });

      await program.parseAsync(['member', 'create', 'alice', '--team', 'team-1'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/members',
          body: expect.objectContaining({
            teamId: 'team-1',
            handle: 'alice',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('outputs formatted result with member id and handle', async () => {
      const mockMember = createMockMember({ id: 'member-new', handle: 'alice', securityLevel: 0 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockMember,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: true,
        allowMemberUpdate: false,
        allowAccessKeyCreate: false,
      });

      await program.parseAsync(['member', 'create', 'alice', '--team', 'team-1'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('member-new');
      expect(output).toContain('alice');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is used', async () => {
      const mockMember = createMockMember({ id: 'member-new', handle: 'alice' });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockMember,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: true,
        allowMemberUpdate: false,
        allowAccessKeyCreate: false,
      });

      await program.parseAsync(['member', 'create', 'alice', '--team', 'team-1', '--json'], {
        from: 'user',
      });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('id', 'member-new');
      expect(parsed).toHaveProperty('handle', 'alice');

      consoleLogSpy.mockRestore();
    });

    it('requires authentication', async () => {
      vi.mocked(loadCliState).mockResolvedValue({
        ...mockBaseState,
        sessionToken: null,
        session: null,
      });
      vi.mocked(http.requireSessionToken).mockImplementationOnce(() => {
        throw new Error('Not authenticated.');
      });

      const program = new Command();
      program.exitOverride(() => {
        throw new Error('Command failed');
      });
      registerMemberCommands(program, {
        allowMemberCreate: true,
        allowMemberUpdate: false,
        allowAccessKeyCreate: false,
      });

      await expect(
        program.parseAsync(['member', 'create', 'alice', '--team', 'team-1'], { from: 'user' }),
      ).rejects.toThrow();

      expect(http.requireSessionToken).toHaveBeenCalled();
    });
  });

  describe('member update', () => {
    it('calls API with correct body', async () => {
      const mockMember = createMockMember({ id: 'member-1', securityLevel: 3 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockMember,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: true,
        allowAccessKeyCreate: false,
      });

      await program.parseAsync(['member', 'update', 'member-1', '--level', '3'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'PATCH',
          path: '/v1/members/member-1',
          body: expect.objectContaining({
            securityLevel: 3,
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('outputs formatted result with updated level', async () => {
      const mockMember = createMockMember({ id: 'member-1', securityLevel: 5 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockMember,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: true,
        allowAccessKeyCreate: false,
      });

      await program.parseAsync(['member', 'update', 'member-1', '--level', '5'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('member-1');
      expect(output).toContain('5');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is used', async () => {
      const mockMember = createMockMember({ id: 'member-1', securityLevel: 5 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockMember,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: true,
        allowAccessKeyCreate: false,
      });

      await program.parseAsync(['member', 'update', 'member-1', '--level', '5', '--json'], {
        from: 'user',
      });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('id', 'member-1');
      expect(parsed).toHaveProperty('securityLevel', 5);

      consoleLogSpy.mockRestore();
    });
  });

  describe('access-key:create', () => {
    it('calls API with correct body', async () => {
      const mockResponse = createMockAccessKeyResponse();
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: false,
        allowAccessKeyCreate: true,
      });

      await program.parseAsync(['access-key:create', 'member-1', '--team', 'team-1'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/access-keys',
          body: expect.objectContaining({
            teamId: 'team-1',
            memberId: 'member-1',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('outputs formatted result with access key preview', async () => {
      const mockResponse = createMockAccessKeyResponse();
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: false,
        allowAccessKeyCreate: true,
      });

      await program.parseAsync(['access-key:create', 'member-1', '--team', 'team-1'], {
        from: 'user',
      });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('member-1');
      expect(output).toContain('ak_abc...xyz');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is used', async () => {
      const mockResponse = createMockAccessKeyResponse();
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: false,
        allowAccessKeyCreate: true,
      });

      await program.parseAsync(['access-key:create', 'member-1', '--team', 'team-1', '--json'], {
        from: 'user',
      });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('accessKey');
      expect(parsed).toHaveProperty('record');

      consoleLogSpy.mockRestore();
    });
  });

  describe('command registration', () => {
    it('registers member create when allowMemberCreate is true', () => {
      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: true,
        allowMemberUpdate: false,
        allowAccessKeyCreate: false,
      });

      const memberCmd = program.commands.find((cmd) => cmd.name() === 'member');
      expect(memberCmd).toBeDefined();
      expect(memberCmd!.commands.map((cmd) => cmd.name())).toContain('create');
    });

    it('registers member update when allowMemberUpdate is true', () => {
      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: true,
        allowAccessKeyCreate: false,
      });

      const memberCmd = program.commands.find((cmd) => cmd.name() === 'member');
      expect(memberCmd).toBeDefined();
      expect(memberCmd!.commands.map((cmd) => cmd.name())).toContain('update');
    });

    it('registers access-key:create when allowAccessKeyCreate is true', () => {
      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: false,
        allowAccessKeyCreate: true,
      });

      const accessKeyCmd = program.commands.find((cmd) => cmd.name() === 'access-key:create');
      expect(accessKeyCmd).toBeDefined();
    });

    it('does not register member when both create and update are false', () => {
      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: false,
        allowAccessKeyCreate: false,
      });

      const memberCmd = program.commands.find((cmd) => cmd.name() === 'member');
      expect(memberCmd).toBeUndefined();
      const accessKeyCmd = program.commands.find((cmd) => cmd.name() === 'access-key:create');
      expect(accessKeyCmd).toBeUndefined();
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

    it('renders codex command-result JSON for member create', async () => {
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockMember = createMockMember({ id: 'member-new', handle: 'alice' });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockMember,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: true,
        allowMemberUpdate: false,
        allowAccessKeyCreate: false,
      });

      await program.parseAsync(['member', 'create', 'alice', '--team', 'team-1'], { from: 'user' });

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('member-create');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('alice');

      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for member update', async () => {
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockMember = createMockMember({ id: 'member-1', securityLevel: 5 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockMember,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: true,
        allowAccessKeyCreate: false,
      });

      await program.parseAsync(['member', 'update', 'member-1', '--level', '5'], { from: 'user' });

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('member-update');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('member-1');

      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for access-key:create', async () => {
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockResponse = createMockAccessKeyResponse();
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerMemberCommands(program, {
        allowMemberCreate: false,
        allowMemberUpdate: false,
        allowAccessKeyCreate: true,
      });

      await program.parseAsync(['access-key:create', 'member-1', '--team', 'team-1'], {
        from: 'user',
      });

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('access-key-create');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('member-1');

      consoleSpy.mockRestore();
    });
  });
});
