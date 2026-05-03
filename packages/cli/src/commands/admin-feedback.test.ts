import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';

import {
  registerAdminFeedbackCommands,
  type AdminFeedbackCommandOptions,
} from './admin-feedback.js';

// Mock dependencies
vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn().mockResolvedValue({
    session: {
      token: 'test-token',
      member: { securityLevel: 5 },
      effectivePermissions: ['knowledge:update'],
    },
    serverUrl: 'http://localhost:3000',
  }),
}));

vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn().mockResolvedValue({
    data: {
      items: [],
      total: 0,
      nextCursor: null,
    },
  }),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/output.js', () => ({
  printResult: vi.fn(),
}));

import { apiRequest } from '../lib/http.js';

describe('admin-feedback commands', () => {
  let program: Command;
  let mockApiRequest: ReturnType<typeof vi.mocked<typeof apiRequest>>;

  beforeEach(() => {
    program = new Command();
    mockApiRequest = vi.mocked(apiRequest);
    // Restore default mock return value after clearing call tracking
    mockApiRequest.mockResolvedValue({
      data: {
        items: [],
        total: 0,
        nextCursor: null,
        action: 'resolve' as const,
        dryRun: false,
        totalEligible: 0,
        totalIneligible: 0,
        appliedAt: null,
      },
    });
  });

  describe('registerAdminFeedbackCommands', () => {
    it('does not register commands when allowManage is false', () => {
      const options: AdminFeedbackCommandOptions = {
        allowManage: false,
      };

      registerAdminFeedbackCommands(program, options);

      const commands = program.commands.map((c) => c.name());
      expect(commands).not.toContain('feedback-list');
      expect(commands).not.toContain('feedback-batch');
    });

    it('registers feedback-list and feedback-batch when allowManage is true', () => {
      const options: AdminFeedbackCommandOptions = {
        allowManage: true,
      };

      registerAdminFeedbackCommands(program, options);

      const commands = program.commands.map((c) => c.name());
      expect(commands).toContain('feedback-list');
      expect(commands).toContain('feedback-batch');
    });
  });

  describe('feedback-list command', () => {
    it('builds correct query parameters for status filter', async () => {
      const options: AdminFeedbackCommandOptions = {
        allowManage: true,
      };

      registerAdminFeedbackCommands(program, options);

      await program.parseAsync([
        'node',
        'test',
        'feedback-list',
        '--status',
        'new,triaged',
      ]);

      expect(mockApiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: expect.stringContaining('status=new'),
        }),
      );
      expect(mockApiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: expect.stringContaining('status=triaged'),
        }),
      );
    });

    it('builds correct query parameters for entry filter', async () => {
      const options: AdminFeedbackCommandOptions = {
        allowManage: true,
      };

      registerAdminFeedbackCommands(program, options);

      await program.parseAsync([
        'node',
        'test',
        'feedback-list',
        '--entry',
        'entry_1',
      ]);

      expect(mockApiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: expect.stringContaining('entryId=entry_1'),
        }),
      );
    });
  });

  describe('feedback-batch command', () => {
    it('sends correct request body for resolve action', async () => {
      const options: AdminFeedbackCommandOptions = {
        allowManage: true,
      };

      registerAdminFeedbackCommands(program, options);

      await program.parseAsync([
        'node',
        'test',
        'feedback-batch',
        '--action',
        'resolve',
        '--feedback-ids',
        'feedback_1,feedback_2',
      ]);

      expect(mockApiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/admin/feedback/batch',
          body: {
            action: 'resolve',
            feedbackIds: ['feedback_1', 'feedback_2'],
            dryRun: false,
          },
        }),
      );
    });

    it('sends correct request body for transition action with target state', async () => {
      const options: AdminFeedbackCommandOptions = {
        allowManage: true,
      };

      registerAdminFeedbackCommands(program, options);

      await program.parseAsync([
        'node',
        'test',
        'feedback-batch',
        '--action',
        'transition',
        '--feedback-ids',
        'feedback_1',
        '--target-state',
        'stale',
      ]);

      expect(mockApiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          path: '/v1/admin/feedback/batch',
          body: {
            action: 'transition',
            feedbackIds: ['feedback_1'],
            dryRun: false,
            targetDecayState: 'stale',
          },
        }),
      );
    });

    it('sets dryRun flag when --dry-run is passed', async () => {
      const options: AdminFeedbackCommandOptions = {
        allowManage: true,
      };

      registerAdminFeedbackCommands(program, options);

      await program.parseAsync([
        'node',
        'test',
        'feedback-batch',
        '--action',
        'resolve',
        '--feedback-ids',
        'feedback_1',
        '--dry-run',
      ]);

      expect(mockApiRequest).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          body: expect.objectContaining({
            dryRun: true,
          }),
        }),
      );
    });
  });
});
