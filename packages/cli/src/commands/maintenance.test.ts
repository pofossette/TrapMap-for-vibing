import type {
  MaintenanceBatchOperationResponse,
  MaintenanceEntryListResponse,
} from '@trapmap/contracts';
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
import { registerMaintenanceCommands } from './maintenance.js';

const mockedApiRequest = vi.mocked(apiRequest);
const mockedLoadCliState = vi.mocked(loadCliState);

// Mock response data
const mockMaintenanceListResponse: MaintenanceEntryListResponse = {
  items: [
    {
      id: 'k_1',
      scope: 'global',
      labels: ['api'],
      shortcut: 'Test entry needing maintenance',
      lifecycleState: 'approved',
      requiredLevel: 5,
      updatedAt: '2026-01-01T00:00:00Z',
      decayState: 'active',
      freshnessType: 'evergreen',
      ageDays: 30,
      lastVerifiedAt: '2026-01-01T00:00:00Z',
      supersededById: null,
      maintainer: { id: 'user_1', handle: 'maintainer1', securityLevel: 3 },
      reviewBy: '2026-06-01T00:00:00Z',
    },
    {
      id: 'k_2',
      scope: 'project',
      labels: ['deprecated'],
      shortcut: 'Overdue entry',
      lifecycleState: 'approved',
      requiredLevel: 3,
      updatedAt: '2025-06-01T00:00:00Z',
      decayState: 'stale',
      freshnessType: 'evergreen',
      ageDays: 120,
      lastVerifiedAt: '2025-06-01T00:00:00Z',
      supersededById: null,
      maintainer: null,
      reviewBy: '2025-12-01T00:00:00Z',
    },
  ],
  total: 2,
};

const mockEmptyListResponse: MaintenanceEntryListResponse = {
  items: [],
  total: 0,
};

const mockBatchResponse: MaintenanceBatchOperationResponse = {
  action: 'assign-owner',
  dryRun: false,
  items: [
    {
      entryId: 'k_1',
      shortcut: 'Test entry',
      currentMaintainer: { id: 'user_1', handle: 'maintainer1', securityLevel: 3 },
      currentReviewBy: '2026-06-01T00:00:00Z',
      eligible: true,
      proposedChange: 'Assign maintainer to user_2',
      ineligibilityReason: null,
    },
  ],
  totalEligible: 1,
  totalIneligible: 0,
  appliedAt: '2026-05-03T12:00:00Z',
};

describe('CLI maintenance commands', () => {
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
    mockedApiRequest.mockResolvedValue({ data: mockMaintenanceListResponse, sessionToken: null });

    program = new Command();
    registerMaintenanceCommands(program, { allowManage: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('maintenance-list', () => {
    it('should call API with correct path', async () => {
      await program.parseAsync(['node', 'test', 'maintenance-list']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          path: expect.stringContaining('/v1/operations/maintenance/entries'),
        }),
      );
    });

    it('should pass missing-owner filter', async () => {
      await program.parseAsync(['node', 'test', 'maintenance-list', '--missing-owner']);

      const callArgs = mockedApiRequest.mock.calls[0];
      const path = callArgs?.[1]?.path as string;
      expect(path).toContain('missingOwner=true');
    });

    it('should pass overdue filter', async () => {
      await program.parseAsync(['node', 'test', 'maintenance-list', '--overdue']);

      const callArgs = mockedApiRequest.mock.calls[0];
      const path = callArgs?.[1]?.path as string;
      expect(path).toContain('reviewOverdue=true');
    });

    it('should output JSON with --json flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'maintenance-list', '--json']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.total).toBe(2);
      expect(parsed.items).toHaveLength(2);

      consoleSpy.mockRestore();
    });

    it('should output human-readable format by default', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'maintenance-list']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('k_1');
      expect(output).toContain('k_2');
      expect(output).toContain('Found 2');

      consoleSpy.mockRestore();
    });

    it('should handle empty results', async () => {
      mockedApiRequest.mockResolvedValue({
        data: mockEmptyListResponse,
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'maintenance-list']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('No entries found');

      consoleSpy.mockRestore();
    });

    it('should require session token', async () => {
      await program.parseAsync(['node', 'test', 'maintenance-list']);

      const { requireSessionToken } = await import('@trapmap/cli/lib/http.js');
      expect(requireSessionToken).toHaveBeenCalledWith(mockState);
    });
  });

  describe('maintenance-assign', () => {
    it('should call API with assign-owner action', async () => {
      mockedApiRequest.mockResolvedValue({ data: mockBatchResponse, sessionToken: null });

      await program.parseAsync([
        'node',
        'test',
        'maintenance-assign',
        '--entries',
        'k_1',
        '--owner',
        'user_2',
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/maintenance/batch',
          body: expect.objectContaining({
            action: 'assign-owner',
            entryIds: ['k_1'],
            newMaintainerId: 'user_2',
          }),
        }),
      );
    });

    it('should output JSON with --json flag', async () => {
      mockedApiRequest.mockResolvedValue({ data: mockBatchResponse, sessionToken: null });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'maintenance-assign',
        '--entries',
        'k_1',
        '--owner',
        'user_2',
        '--json',
      ]);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.action).toBe('assign-owner');
      expect(parsed.totalEligible).toBe(1);

      consoleSpy.mockRestore();
    });

    it('should output human-readable result', async () => {
      mockedApiRequest.mockResolvedValue({ data: mockBatchResponse, sessionToken: null });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'maintenance-assign',
        '--entries',
        'k_1',
        '--owner',
        'user_2',
      ]);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('assign-owner');
      expect(output).toContain('k_1');

      consoleSpy.mockRestore();
    });
  });

  describe('maintenance-verify', () => {
    const verifyBatchResponse: MaintenanceBatchOperationResponse = {
      action: 'mark-verified',
      dryRun: false,
      items: [
        {
          entryId: 'k_1',
          shortcut: 'Test entry',
          currentMaintainer: { id: 'user_1', handle: 'maintainer1', securityLevel: 3 },
          currentReviewBy: '2026-06-01T00:00:00Z',
          eligible: true,
          proposedChange: 'Extend review-by 90 days',
          ineligibilityReason: null,
        },
      ],
      totalEligible: 1,
      totalIneligible: 0,
      appliedAt: '2026-05-03T12:00:00Z',
    };

    it('should call API with mark-verified action', async () => {
      mockedApiRequest.mockResolvedValue({ data: verifyBatchResponse, sessionToken: null });

      await program.parseAsync(['node', 'test', 'maintenance-verify', '--entries', 'k_1']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/operations/maintenance/batch',
          body: expect.objectContaining({
            action: 'mark-verified',
            entryIds: ['k_1'],
            extendDays: 90,
          }),
        }),
      );
    });

    it('should output JSON with --json flag', async () => {
      mockedApiRequest.mockResolvedValue({ data: verifyBatchResponse, sessionToken: null });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'maintenance-verify',
        '--entries',
        'k_1',
        '--json',
      ]);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.action).toBe('mark-verified');

      consoleSpy.mockRestore();
    });

    it('should output human-readable result', async () => {
      mockedApiRequest.mockResolvedValue({ data: verifyBatchResponse, sessionToken: null });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'maintenance-verify', '--entries', 'k_1']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('mark-verified');
      expect(output).toContain('k_1');

      consoleSpy.mockRestore();
    });
  });

  describe('command registration', () => {
    it('should not register commands when allowManage is false', () => {
      const restrictedProgram = new Command();
      registerMaintenanceCommands(restrictedProgram, { allowManage: false });

      const commands = restrictedProgram.commands.map((cmd) => cmd.name());
      expect(commands).not.toContain('maintenance-list');
      expect(commands).not.toContain('maintenance-assign');
      expect(commands).not.toContain('maintenance-verify');
    });

    it('should register commands when allowManage is true', () => {
      const fullProgram = new Command();
      registerMaintenanceCommands(fullProgram, { allowManage: true });

      const commands = fullProgram.commands.map((cmd) => cmd.name());
      expect(commands).toContain('maintenance-list');
      expect(commands).toContain('maintenance-assign');
      expect(commands).toContain('maintenance-verify');
    });
  });

  describe('fm-agent freeze: live gaps', () => {
    it('formatMaintenanceBatch: renders explicit empty ineligibilityReason instead of dropping it', async () => {
      const batchResponseWithEmptyReason: MaintenanceBatchOperationResponse = {
        action: 'assign-owner',
        dryRun: false,
        items: [
          {
            entryId: 'k_1',
            shortcut: 'Test entry',
            currentMaintainer: null as any,
            currentReviewBy: '2026-06-01T00:00:00Z',
            eligible: false,
            proposedChange: 'Assign owner to user_2',
            ineligibilityReason: '',
          },
        ],
        totalEligible: 0,
        totalIneligible: 1,
        appliedAt: '2026-05-03T12:00:00Z',
      };

      mockedApiRequest.mockResolvedValue({
        data: batchResponseWithEmptyReason,
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'maintenance-assign',
        '--entries',
        'k_1',
        '--owner',
        'user_2',
      ]);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('\u2717 k_1: Assign owner to user_2 ()');

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

    it('renders codex command-result JSON for maintenance-list', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      mockedApiRequest.mockResolvedValue({
        data: mockMaintenanceListResponse,
        sessionToken: null,
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'maintenance-list']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('maintenance-list');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('2');
      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for maintenance-assign', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      mockedApiRequest.mockResolvedValue({ data: mockBatchResponse, sessionToken: null });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'maintenance-assign',
        '--entries',
        'k_1',
        '--owner',
        'user_2',
      ]);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('maintenance-assign');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('assign-owner');
      consoleSpy.mockRestore();
    });

    it('renders codex command-result JSON for maintenance-verify', async () => {
      const { loadCliState } = await import('@trapmap/cli/lib/config.js');
      vi.mocked(loadCliState).mockResolvedValue(codexProfileState);

      const verifyBatchResponse: MaintenanceBatchOperationResponse = {
        action: 'mark-verified',
        dryRun: false,
        items: [
          {
            entryId: 'k_1',
            shortcut: 'Test entry',
            currentMaintainer: { id: 'user_1', handle: 'maintainer1', securityLevel: 3 },
            currentReviewBy: '2026-06-01T00:00:00Z',
            eligible: true,
            proposedChange: 'Extend review-by 90 days',
            ineligibilityReason: null,
          },
        ],
        totalEligible: 1,
        totalIneligible: 0,
        appliedAt: '2026-05-03T12:00:00Z',
      };
      mockedApiRequest.mockResolvedValue({ data: verifyBatchResponse, sessionToken: null });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'maintenance-verify', '--entries', 'k_1']);

      const output = String(consoleSpy.mock.calls[0]?.[0]);
      const parsed = JSON.parse(output);
      expect(parsed.type).toBe('command-result');
      expect(parsed.action).toBe('maintenance-verify');
      expect(parsed.success).toBe(true);
      expect(parsed.summary).toContain('mark-verified');
      consoleSpy.mockRestore();
    });
  });
});
