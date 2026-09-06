import { loadCliState } from '@trapmap/cli/lib/config.js';
import * as http from '@trapmap/cli/lib/http.js';
import {
  createMockLoginResponse,
  createMockSessionResponse,
  executeCommandForResult,
} from '@trapmap/cli/testing/cli-test-utils.js';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../src/lib/http.js', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('../../src/lib/config.js', () => ({
  loadCliState: vi.fn(),
  updateCliState: vi.fn(),
  clearSession: vi.fn(),
  resolveCliGatewayUrl: vi.fn(
    (state) => state.gatewayUrl ?? state.serverUrl ?? 'http://localhost:3000',
  ),
}));

import { clearSession, updateCliState } from '@trapmap/cli/lib/config.js';
import { registerAuthCommands } from '../../src/commands/auth.js';

const mockBaseState = {
  gatewayUrl: 'http://localhost:3000',
  sessionToken: 'mock-token',
  session: {
    member: { handle: 'testuser', securityLevel: 5 },
    effectivePermissions: ['session:read'],
  },
};

describe('auth commands', () => {
  beforeEach(() => {
    vi.mocked(loadCliState).mockResolvedValue(mockBaseState);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('login command', () => {
    it('calls API with access key', async () => {
      const mockResponse = createMockLoginResponse({ securityLevel: 5 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'new-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['login', '--access-key', 'ak_test-key-12345678'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/auth/login',
          body: expect.objectContaining({
            accessKey: 'ak_test-key-12345678',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('calls API with system admin key', async () => {
      const mockResponse = createMockLoginResponse({ securityLevel: 5 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'new-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['login', '--system-admin-key', 'admin-key-12345678'], {
        from: 'user',
      });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/auth/login',
          body: expect.objectContaining({
            systemAdminKey: 'admin-key-12345678',
          }),
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('outputs formatted result with handle and level', async () => {
      const mockResponse = createMockLoginResponse({ securityLevel: 5 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'new-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['login', '--access-key', 'ak_test-key-12345678'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('testuser');
      expect(output).toContain('5');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is used', async () => {
      const mockResponse = createMockLoginResponse({ securityLevel: 5 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'new-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['login', '--access-key', 'ak_test-key-12345678', '--json'], {
        from: 'user',
      });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('session');

      consoleLogSpy.mockRestore();
    });

    it('throws when neither access key nor system admin key provided', async () => {
      const program = new Command();
      program.exitOverride(() => {
        throw new Error('Command failed');
      });
      registerAuthCommands(program);

      await expect(program.parseAsync(['login'], { from: 'user' })).rejects.toThrow();
    });

    it('persists only one gateway URL when login overrides remote address', async () => {
      const mockResponse = createMockLoginResponse({ securityLevel: 5 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'new-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(
        ['login', '--access-key', 'ak_test-key-12345678', '--server', 'http://gateway:4100'],
        { from: 'user' },
      );

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          gatewayUrl: 'http://gateway:4100',
        }),
      );
      expect(vi.mocked(updateCliState)).toHaveBeenCalledWith(
        expect.objectContaining({
          gatewayUrl: 'http://gateway:4100',
        }),
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('logout command', () => {
    it('calls logout API when session token exists', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: {},
        sessionToken: null,
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['logout'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/auth/logout',
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('outputs formatted result', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: {},
        sessionToken: null,
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['logout'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Logged out');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is used', async () => {
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: {},
        sessionToken: null,
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['logout', '--json'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('ok', true);

      consoleLogSpy.mockRestore();
    });

    it('clears the local session even when the logout API fails', async () => {
      vi.mocked(http.apiRequest).mockRejectedValueOnce(new Error('server unavailable'));
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await expect(program.parseAsync(['logout'], { from: 'user' })).rejects.toThrow(
        'server unavailable',
      );
      expect(clearSession).toHaveBeenCalledTimes(1);

      consoleLogSpy.mockRestore();
    });
  });

  describe('session command', () => {
    it('calls API to fetch session status', async () => {
      const mockSession = createMockLoginResponse({ securityLevel: 5 }).session;
      const mockResponse = createMockSessionResponse(mockSession);
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['session'], { from: 'user' });

      expect(http.apiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: '/v1/auth/session',
        }),
      );

      consoleLogSpy.mockRestore();
    });

    it('outputs formatted result with user handle', async () => {
      const mockSession = createMockLoginResponse({ securityLevel: 5 }).session;
      const mockResponse = createMockSessionResponse(mockSession);
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['session'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('testuser');

      consoleLogSpy.mockRestore();
    });

    it('outputs not authenticated when session is null', async () => {
      const mockResponse = createMockSessionResponse(null);
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['session'], { from: 'user' });

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(output).toContain('Authenticated: no');

      consoleLogSpy.mockRestore();
    });

    it('outputs JSON when --json flag is used', async () => {
      const mockSession = createMockLoginResponse({ securityLevel: 5 }).session;
      const mockResponse = createMockSessionResponse(mockSession);
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'mock-token',
      });

      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      await program.parseAsync(['session', '--json'], { from: 'user' });

      const output = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty('authenticated', true);
      expect(parsed).toHaveProperty('session');

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

    it('renders codex command-result JSON for login', async () => {
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockResponse = createMockLoginResponse({ securityLevel: 5 });
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      const parsed = await executeCommandForResult(
        program,
        ['login', '--access-key', 'ak_test-key-12345678'],
        consoleSpy,
      );
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('login');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('testuser');

      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for logout', async () => {
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      vi.mocked(http.apiRequest).mockResolvedValue({
        data: {},
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      const parsed = await executeCommandForResult(program, ['logout'], consoleSpy);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('logout');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('Logged out');

      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for session', async () => {
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const mockSession = createMockLoginResponse({ securityLevel: 5 }).session;
      const mockResponse = createMockSessionResponse(mockSession);
      vi.mocked(http.apiRequest).mockResolvedValue({
        data: mockResponse,
        sessionToken: 'test-token',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const program = new Command();
      registerAuthCommands(program);

      const parsed = await executeCommandForResult(program, ['session'], consoleSpy);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('session');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('testuser');

      consoleSpy.mockRestore();
    });
  });
});
