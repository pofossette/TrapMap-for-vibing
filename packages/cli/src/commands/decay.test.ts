/**
 * Tests for CLI decay commands (Phase 50: DECAY-03).
 *
 * This module covers:
 * - decay-stale command for listing entries by decay state
 * - decay-batch command for batch operations
 * - decay-search command for pattern search with decay facets
 */

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
import { registerDecayCommands } from './decay.js';

const mockedApiRequest = vi.mocked(apiRequest);
const mockedLoadCliState = vi.mocked(loadCliState);

// Mock response data
const mockDecayListResponse = {
  items: [
    {
      id: 'k_1',
      scope: 'global',
      labels: ['api'],
      shortcut: 'Test entry with some longer text',
      lifecycleState: 'approved',
      requiredLevel: 5,
      updatedAt: '2026-01-01T00:00:00Z',
      decayState: 'stale',
      freshnessType: 'evergreen',
      ageDays: 120,
      lastVerifiedAt: '2025-12-01T00:00:00Z',
      supersededById: null,
    },
    {
      id: 'k_2',
      scope: 'project',
      labels: ['deprecated', 'migration'],
      shortcut: 'Deprecated API endpoint',
      lifecycleState: 'approved',
      requiredLevel: 3,
      updatedAt: '2025-06-01T00:00:00Z',
      decayState: 'expired',
      freshnessType: 'volatile',
      ageDays: 365,
      lastVerifiedAt: '2025-06-01T00:00:00Z',
      supersededById: null,
    },
  ],
  total: 2,
};

const mockBatchResponse = {
  action: 'extend',
  dryRun: false,
  items: [
    {
      entryId: 'k_1',
      shortcut: 'Test entry',
      currentDecayState: 'stale',
      proposedDecayState: 'active',
      changeDescription: 'Reset verification clock',
      eligible: true,
      ineligibilityReason: null,
    },
    {
      entryId: 'k_2',
      shortcut: 'Already active',
      currentDecayState: 'active',
      proposedDecayState: 'active',
      changeDescription: 'No change needed',
      eligible: false,
      ineligibilityReason: 'Entry is already active',
    },
  ],
  totalEligible: 1,
  totalIneligible: 1,
  appliedAt: '2026-05-02T10:00:00Z',
};

const mockBatchDryRunResponse = {
  action: 'extend',
  dryRun: true,
  items: [
    {
      entryId: 'k_1',
      shortcut: 'Test entry',
      currentDecayState: 'stale',
      proposedDecayState: 'active',
      changeDescription: 'Reset verification clock',
      eligible: true,
      ineligibilityReason: null,
    },
  ],
  totalEligible: 1,
  totalIneligible: 0,
  appliedAt: null,
};

const mockSearchResponse = {
  items: [
    {
      id: 'k_3',
      scope: 'global',
      labels: ['legacy'],
      shortcut: 'Legacy authentication flow',
      lifecycleState: 'approved',
      requiredLevel: 5,
      updatedAt: '2025-01-01T00:00:00Z',
      decayState: 'review-due',
      freshnessType: 'versioned',
      ageDays: 180,
      lastVerifiedAt: '2025-01-01T00:00:00Z',
      supersededById: null,
    },
  ],
  total: 1,
};

describe('CLI decay commands (Phase 50)', () => {
  let program: Command;
  const mockState = {
    serverUrl: 'http://localhost:3000',
    sessionToken: 'test-token',
    session: null,
  };

  beforeEach(async () => {
    // Setup mocks - reset and set implementation
    mockedApiRequest.mockReset();
    mockedLoadCliState.mockReset();

    mockedLoadCliState.mockResolvedValue(mockState);
    mockedApiRequest.mockResolvedValue({ data: mockDecayListResponse, sessionToken: null });

    // Create program and register commands
    program = new Command();
    registerDecayCommands(program, { allowManage: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('decay-stale', () => {
    it('should call API with state filter', async () => {
      await program.parseAsync(['node', 'test', 'decay-stale', '--state', 'stale,expired']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          path: expect.stringContaining('/v1/operations/decay/entries'),
        }),
      );

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const path = callArgs?.[1]?.path as string;
      expect(path).toContain('decayStates=stale');
      expect(path).toContain('decayStates=expired');
    });

    it('should call API with age filters', async () => {
      await program.parseAsync([
        'node',
        'test',
        'decay-stale',
        '--age-min',
        '90',
        '--age-max',
        '365',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const path = callArgs?.[1]?.path as string;
      expect(path).toContain('ageMinDays=90');
      expect(path).toContain('ageMaxDays=365');
    });

    it('should call API with label filter', async () => {
      await program.parseAsync(['node', 'test', 'decay-stale', '--label', 'api,deprecated']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const path = callArgs?.[1]?.path as string;
      expect(path).toContain('labels=api');
      expect(path).toContain('labels=deprecated');
    });

    it('should call API with scope filter', async () => {
      await program.parseAsync(['node', 'test', 'decay-stale', '--scope', 'global']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const path = callArgs?.[1]?.path as string;
      expect(path).toContain('scope=global');
    });

    it('should call API with limit', async () => {
      await program.parseAsync(['node', 'test', 'decay-stale', '--limit', '50']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const path = callArgs?.[1]?.path as string;
      expect(path).toContain('limit=50');
    });

    it('should output JSON with --json flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'decay-stale', '--json']);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.total).toBe(2);
      expect(parsed.items).toHaveLength(2);

      consoleSpy.mockRestore();
    });

    it('should output human-readable format by default', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'decay-stale']);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      expect(output).toContain('Found 2 entries');
      expect(output).toContain('k_1');
      expect(output).toContain('[stale]');

      consoleSpy.mockRestore();
    });

    it('should show "unknown" for null decayState', async () => {
      mockedApiRequest.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'k_null',
              scope: 'global',
              labels: [],
              shortcut: 'Null state entry',
              lifecycleState: 'approved',
              requiredLevel: 1,
              updatedAt: '2026-01-01T00:00:00Z',
              decayState: null,
              freshnessType: 'evergreen',
              ageDays: 10,
              lastVerifiedAt: null,
              supersededById: null,
            },
          ],
          total: 1,
        },
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await program.parseAsync(['node', 'test', 'decay-stale']);

      const calls = consoleSpy.mock.calls;
      const output = calls[0]?.[0] as string;
      expect(output).toContain('[unknown]');

      consoleSpy.mockRestore();
    });

    it('should require session token', async () => {
      await program.parseAsync(['node', 'test', 'decay-stale']);

      const { requireSessionToken } = await import('@trapmap/cli/lib/http.js');
      expect(requireSessionToken).toHaveBeenCalledWith(mockState);
    });
  });

  describe('decay-batch', () => {
    beforeEach(() => {
      mockedApiRequest.mockResolvedValue({ data: mockBatchResponse, sessionToken: null });
    });

    it('should call API with extend action', async () => {
      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'extend',
        '--entries',
        'k_1,k_2',
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/decay/batch',
        }),
      );

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { action: string; entryIds: string[] };
      expect(body.action).toBe('extend');
      expect(body.entryIds).toEqual(['k_1', 'k_2']);
    });

    it('should call API with mark-review action', async () => {
      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'mark-review',
        '--entries',
        'k_1',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { action: string };
      expect(body.action).toBe('mark-review');
    });

    it('should call API with deactivate action', async () => {
      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'deactivate',
        '--entries',
        'k_1',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { action: string };
      expect(body.action).toBe('deactivate');
    });

    it('should call API with dry-run flag', async () => {
      mockedApiRequest.mockResolvedValue({
        data: mockBatchDryRunResponse,
        sessionToken: null,
      });

      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'extend',
        '--entries',
        'k_1',
        '--dry-run',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { dryRun: boolean };
      expect(body.dryRun).toBe(true);
    });

    it('should include extendDays for extend action', async () => {
      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'extend',
        '--entries',
        'k_1',
        '--extend-days',
        '30',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { extendDays: number };
      expect(body.extendDays).toBe(30);
    });

    it('should include replacementId for supersede action', async () => {
      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'supersede',
        '--entries',
        'k_1',
        '--replacement',
        'k_2',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { replacementId: string };
      expect(body.replacementId).toBe('k_2');
    });

    it('should format eligible/ineligible items in output', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'extend',
        '--entries',
        'k_1,k_2',
      ]);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      expect(output).toContain('Action: extend');
      expect(output).toContain('Eligible: 1');
      expect(output).toContain('Ineligible: 1');
      expect(output).toContain('✓ k_1');
      expect(output).toContain('✗ k_2');
      expect(output).toContain('already active');

      consoleSpy.mockRestore();
    });

    it('should show dry-run prefix in output', async () => {
      mockedApiRequest.mockResolvedValue({
        data: mockBatchDryRunResponse,
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'extend',
        '--entries',
        'k_1',
        '--dry-run',
      ]);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      expect(output).toContain('DRY RUN');

      consoleSpy.mockRestore();
    });

    it('should output JSON with --json flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'extend',
        '--entries',
        'k_1',
        '--json',
      ]);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.action).toBe('extend');
      expect(parsed.items).toHaveLength(2);

      consoleSpy.mockRestore();
    });

    it('should require session token', async () => {
      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'extend',
        '--entries',
        'k_1',
      ]);

      const { requireSessionToken } = await import('@trapmap/cli/lib/http.js');
      expect(requireSessionToken).toHaveBeenCalledWith(mockState);
    });
  });

  describe('decay-search', () => {
    beforeEach(() => {
      mockedApiRequest.mockResolvedValue({ data: mockSearchResponse, sessionToken: null });
    });

    it('should call POST /v1/operations/decay/search with pattern', async () => {
      await program.parseAsync(['node', 'test', 'decay-search', 'deprecated API']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/decay/search',
        }),
      );

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { pattern: string };
      expect(body.pattern).toBe('deprecated API');
    });

    it('should work without pattern argument', async () => {
      await program.parseAsync(['node', 'test', 'decay-search']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { pattern: string };
      expect(body.pattern).toBe('');
    });

    it('should include decay state filters in body', async () => {
      await program.parseAsync([
        'node',
        'test',
        'decay-search',
        'test',
        '--state',
        'stale,expired',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { decayStates: string[] };
      expect(body.decayStates).toEqual(['stale', 'expired']);
    });

    it('should include label filters in body', async () => {
      await program.parseAsync(['node', 'test', 'decay-search', 'test', '--label', 'api,legacy']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { labels: string[] };
      expect(body.labels).toEqual(['api', 'legacy']);
    });

    it('should include scope filter in body', async () => {
      await program.parseAsync(['node', 'test', 'decay-search', 'test', '--scope', 'global']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { scope: string };
      expect(body.scope).toBe('global');
    });

    it('should include limit in body', async () => {
      await program.parseAsync(['node', 'test', 'decay-search', 'test', '--limit', '50']);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { limit: number };
      expect(body.limit).toBe(50);
    });

    it('should output JSON with --json flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'decay-search', 'test', '--json']);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.total).toBe(1);
      expect(parsed.items).toHaveLength(1);

      consoleSpy.mockRestore();
    });

    it('should output human-readable format by default', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'decay-search', 'legacy']);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      expect(output).toContain('Found 1 entries');
      expect(output).toContain('k_3');
      expect(output).toContain('[review-due]');

      consoleSpy.mockRestore();
    });

    it('should require session token', async () => {
      await program.parseAsync(['node', 'test', 'decay-search', 'test']);

      const { requireSessionToken } = await import('@trapmap/cli/lib/http.js');
      expect(requireSessionToken).toHaveBeenCalledWith(mockState);
    });
  });

  describe('command registration', () => {
    it('should not register commands when allowManage is false', () => {
      const restrictedProgram = new Command();
      registerDecayCommands(restrictedProgram, { allowManage: false });

      const commands = restrictedProgram.commands.map((cmd) => cmd.name());
      expect(commands).not.toContain('decay-stale');
      expect(commands).not.toContain('decay-batch');
      expect(commands).not.toContain('decay-search');
    });

    it('should register all three commands when allowManage is true', () => {
      const fullProgram = new Command();
      registerDecayCommands(fullProgram, { allowManage: true });

      const commands = fullProgram.commands.map((cmd) => cmd.name());
      expect(commands).toContain('decay-stale');
      expect(commands).toContain('decay-batch');
      expect(commands).toContain('decay-search');
    });
  });

  describe('edge cases', () => {
    it('should handle empty results gracefully', async () => {
      mockedApiRequest.mockResolvedValue({
        data: { items: [], total: 0 },
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'decay-stale']);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      expect(output).toContain('No entries found');

      consoleSpy.mockRestore();
    });

    it('should handle entries without decay state', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          items: [
            {
              id: 'k_no_decay',
              scope: 'global',
              labels: [],
              shortcut: 'Entry without decay',
              lifecycleState: 'approved',
              requiredLevel: 5,
              updatedAt: '2026-01-01T00:00:00Z',
              decayState: null,
              freshnessType: null,
              ageDays: null,
              lastVerifiedAt: null,
              supersededById: null,
            },
          ],
          total: 1,
        },
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'decay-stale']);

      const calls = consoleSpy.mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      const output = calls[0]?.[0] as string;
      expect(output).toContain('[unknown]');
      expect(output).toContain('n/a');

      consoleSpy.mockRestore();
    });

    it('should trim whitespace from entry IDs', async () => {
      mockedApiRequest.mockResolvedValue({
        data: mockBatchResponse,
        sessionToken: null,
      });

      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'extend',
        '--entries',
        ' k_1 , k_2 ',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      expect(callArgs).toBeDefined();
      const body = callArgs?.[1]?.body as { entryIds: string[] };
      expect(body.entryIds).toEqual(['k_1', 'k_2']);
    });
  });

  describe('fm-agent freeze: live gaps', () => {
    it('formatBatchResult: renders explicit empty ineligibilityReason instead of dropping it', async () => {
      mockedApiRequest.mockResolvedValue({
        data: {
          action: 'extend',
          dryRun: false,
          items: [
            {
              entryId: 'entry-1',
              shortcut: 'test',
              currentDecayState: 'stale',
              proposedDecayState: 'active',
              changeDescription: 'extend by 30 days',
              eligible: false,
              ineligibilityReason: '',
            },
          ],
          totalEligible: 0,
          totalIneligible: 1,
          appliedAt: '2026-05-02T10:00:00Z',
        },
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node', 'test', 'decay-batch',
        '--action', 'extend',
        '--entries', 'entry-1',
      ]);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('\u2717 entry-1: extend by 30 days ()');

      consoleSpy.mockRestore();
    });

    it('formatDecayList: renders undefined decayState as "undefined" instead of empty', async () => {
      mockedApiRequest.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'k_undef',
              scope: 'global',
              labels: [],
              shortcut: 'Entry with undefined decay state',
              lifecycleState: 'approved',
              requiredLevel: 1,
              updatedAt: '2026-01-01T00:00:00Z',
              decayState: undefined,
              freshnessType: 'evergreen',
              ageDays: 10,
              lastVerifiedAt: null,
              supersededById: null,
            },
          ],
          total: 1,
        },
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      // Re-register commands to get fresh program state
      program = new Command();
      registerDecayCommands(program, { allowManage: true });

      await program.parseAsync(['node', 'test', 'decay-stale']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('[undefined]');
      expect(output).not.toContain('[]');

      consoleSpy.mockRestore();
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

    it('renders codex command-result JSON for decay-stale', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      mockedApiRequest.mockResolvedValue({ data: mockDecayListResponse, sessionToken: null });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'decay-stale']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('decay-stale');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('2');
      expect(parsed.artifacts).toHaveLength(2);
      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for decay-batch', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      mockedApiRequest.mockResolvedValue({ data: mockBatchResponse, sessionToken: null });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'decay-batch',
        '--action',
        'extend',
        '--entries',
        'k_1,k_2',
      ]);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('decay-batch');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('extend');
      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for decay-search', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      mockedApiRequest.mockResolvedValue({ data: mockSearchResponse, sessionToken: null });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'decay-search', 'legacy']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('decay-search');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('1');
      consoleSpy.mockRestore();
    });
  });
});
