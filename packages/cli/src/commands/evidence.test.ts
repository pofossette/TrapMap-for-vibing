import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(),
}));

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest } from '@trapmap/cli/lib/http.js';
// Import after mocking
import { Command } from 'commander';
import { registerEvidenceCommands } from './evidence.js';

const mockedApiRequest = vi.mocked(apiRequest);
const mockedLoadCliState = vi.mocked(loadCliState);

// Mock response data
const mockKnowledgeListResponse = {
  items: [
    {
      id: 'k_1',
      scope: 'global',
      labels: ['api'],
      shortcut: 'Test entry',
      lifecycleState: 'approved',
      requiredLevel: 5,
      updatedAt: '2026-01-01T00:00:00Z',
      evidenceMeta: {
        evidenceLevel: 'documented',
        sourceType: 'doc',
        sourceRef: 'https://docs.example.com',
        verifiedAt: '2026-01-01T00:00:00Z',
        verifiedBy: { id: 'user_1', handle: 'reviewer', securityLevel: 5 },
      },
    },
    {
      id: 'k_2',
      scope: 'project',
      labels: ['deprecated'],
      shortcut: 'No evidence entry',
      lifecycleState: 'approved',
      requiredLevel: 3,
      updatedAt: '2025-06-01T00:00:00Z',
      evidenceMeta: null,
    },
  ],
  nextCursor: null,
  total: 2,
};

const mockEmptyListResponse = {
  items: [],
  nextCursor: null,
  total: 0,
};

describe('CLI evidence commands', () => {
  let program: Command;
  const mockState = {
    serverUrl: 'http://localhost:3000',
    sessionToken: 'test-token',
    session: null,
  };

  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedLoadCliState.mockReset();

    mockedLoadCliState.mockResolvedValue(mockState);
    mockedApiRequest.mockResolvedValue({ data: mockKnowledgeListResponse, sessionToken: null });

    program = new Command();
    registerEvidenceCommands(program, { allowReview: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('admin:evidence', () => {
    it('should call API with evidence level filter', async () => {
      await program.parseAsync(['node', 'test', 'admin:evidence', '--level', 'documented']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          path: expect.stringContaining('evidenceLevel'),
        }),
      );

      const callArgs = mockedApiRequest.mock.calls[0];
      const path = callArgs?.[1]?.path as string;
      expect(path).toContain('evidenceLevel%5B%5D=documented');
    });

    it('should call API with missing evidence filter', async () => {
      await program.parseAsync(['node', 'test', 'admin:evidence', '--missing']);

      const callArgs = mockedApiRequest.mock.calls[0];
      const path = callArgs?.[1]?.path as string;
      expect(path).toContain('missingEvidence=true');
    });

    it('should output JSON with --json flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'admin:evidence', '--json']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.total).toBe(2);
      expect(parsed.items).toHaveLength(2);

      consoleSpy.mockRestore();
    });

    it('should output human-readable format by default', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'admin:evidence']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('k_1');
      expect(output).toContain('documented');
      expect(output).toContain('k_2');
      expect(output).toContain('(none)');

      consoleSpy.mockRestore();
    });

    it('should handle empty results', async () => {
      mockedApiRequest.mockResolvedValue({
        data: mockEmptyListResponse,
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'admin:evidence']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('No entries found');

      consoleSpy.mockRestore();
    });

    it('should require session token', async () => {
      await program.parseAsync(['node', 'test', 'admin:evidence']);

      const { requireSessionToken } = await import('@trapmap/cli/lib/http.js');
      expect(requireSessionToken).toHaveBeenCalledWith(mockState);
    });
  });

  describe('evidence:update', () => {
    it('should call PATCH API with evidence level', async () => {
      mockedApiRequest.mockResolvedValue({ data: {}, sessionToken: null });

      await program.parseAsync([
        'node',
        'test',
        'evidence:update',
        'k_1',
        '--level',
        'verified-in-prod',
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'PATCH',
          path: '/v1/knowledge/k_1/evidence',
        }),
      );

      const callArgs = mockedApiRequest.mock.calls[0];
      const body = callArgs?.[1]?.body as Record<string, unknown>;
      expect(body.evidenceLevel).toBe('verified-in-prod');
    });

    it('should call PATCH API with source type', async () => {
      mockedApiRequest.mockResolvedValue({ data: {}, sessionToken: null });

      await program.parseAsync([
        'node',
        'test',
        'evidence:update',
        'k_1',
        '--level',
        'documented',
        '--type',
        'incident',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      const body = callArgs?.[1]?.body as Record<string, unknown>;
      expect(body.sourceType).toBe('incident');
    });

    it('should call PATCH API with source ref', async () => {
      mockedApiRequest.mockResolvedValue({ data: {}, sessionToken: null });

      await program.parseAsync([
        'node',
        'test',
        'evidence:update',
        'k_1',
        '--level',
        'documented',
        '--ref',
        'https://example.com',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      const body = callArgs?.[1]?.body as Record<string, unknown>;
      expect(body.sourceRef).toBe('https://example.com');
    });

    it('should output success message', async () => {
      mockedApiRequest.mockResolvedValue({ data: {}, sessionToken: null });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'evidence:update', 'k_1', '--level', 'documented']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('Evidence updated');
      expect(output).toContain('documented');

      consoleSpy.mockRestore();
    });

    it('should validate evidence level', async () => {
      await expect(
        program.parseAsync(['node', 'test', 'evidence:update', 'k_1', '--level', 'invalid']),
      ).rejects.toThrow('Invalid evidence level');
    });

    it('should validate source type', async () => {
      await expect(
        program.parseAsync(['node', 'test', 'evidence:update', 'k_1', '--type', 'invalid']),
      ).rejects.toThrow('Invalid source type');
    });

    it('should require session token', async () => {
      mockedApiRequest.mockResolvedValue({ data: {}, sessionToken: null });
      await program.parseAsync(['node', 'test', 'evidence:update', 'k_1', '--level', 'documented']);

      const { requireSessionToken } = await import('@trapmap/cli/lib/http.js');
      expect(requireSessionToken).toHaveBeenCalledWith(mockState);
    });
  });

  describe('command registration', () => {
    it('should not register commands when allowReview is false', () => {
      const restrictedProgram = new Command();
      registerEvidenceCommands(restrictedProgram, { allowReview: false });

      const commands = restrictedProgram.commands.map((cmd) => cmd.name());
      expect(commands).not.toContain('admin:evidence');
      expect(commands).not.toContain('evidence:update');
    });

    it('should register commands when allowReview is true', () => {
      const fullProgram = new Command();
      registerEvidenceCommands(fullProgram, { allowReview: true });

      const commands = fullProgram.commands.map((cmd) => cmd.name());
      expect(commands).toContain('admin:evidence');
      expect(commands).toContain('evidence:update');
    });
  });

  describe('profile-aware output', () => {
    const codexProfileState = {
      serverUrl: 'http://localhost:3000',
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

    it('renders codex command-result JSON for admin:evidence', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      mockedApiRequest.mockResolvedValue({
        data: mockKnowledgeListResponse,
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'admin:evidence']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('admin-evidence');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('2');
      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for evidence:update', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      mockedApiRequest.mockResolvedValue({ data: {}, sessionToken: null });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'evidence:update', 'k_1', '--level', 'documented']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('evidence-update');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('k_1');
      consoleSpy.mockRestore();
    });
  });
});
