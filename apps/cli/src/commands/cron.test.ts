/**
 * Tests for CLI cron commands (Task 4).
 *
 * Covers success + error paths for cron list/add/edit/pause/resume/trigger/
 * status, using the mocked CLI http client (same pattern as review.test.ts).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/http.js', () => ({
  apiRequest: vi.fn(),
  requireSessionToken: vi.fn(),
}));

vi.mock('../lib/config.js', () => ({
  loadCliState: vi.fn(),
}));

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest } from '@trapmap/cli/lib/http.js';
import { Command } from 'commander';
import { registerCronCommands } from './cron.js';

const mockedApiRequest = vi.mocked(apiRequest);
const mockedLoadCliState = vi.mocked(loadCliState);

const NOW = '2026-08-16T03:00:00.000Z';

function makeJob(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cron_1',
    name: 'daily-digest',
    schedule: '0 9 * * *',
    timezone: 'UTC',
    taskType: 'digest',
    payload: {},
    enabled: true,
    nextRunAt: NOW,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    runCount: 0,
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

function makeSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cron_1',
    enabled: true,
    nextRunAt: NOW,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    runCount: 0,
    ...overrides,
  };
}

describe('CLI cron commands', () => {
  let program: Command;
  const mockState = {
    gatewayUrl: 'http://localhost:3000',
    sessionToken: 'test-token',
    session: null,
  };

  beforeEach(() => {
    mockedApiRequest.mockReset();
    mockedLoadCliState.mockReset();
    mockedLoadCliState.mockResolvedValue(mockState);

    program = new Command();
    registerCronCommands(program);
  });

  describe('cron list', () => {
    it('lists jobs via GET /v1/cron/jobs and renders text output', async () => {
      mockedApiRequest.mockResolvedValue({
        data: [makeJob(), makeJob({ id: 'cron_2', name: 'nightly-cleanup', enabled: false })],
        sessionToken: 'test-token',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'cron', 'list']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({ path: '/v1/cron/jobs' }),
      );
      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('daily-digest');
      expect(output).toContain('[paused]');
      expect(output).toContain('next=2026-08-16 03:00 UTC');
      consoleSpy.mockRestore();
    });

    it('renders an empty message when no jobs exist', async () => {
      mockedApiRequest.mockResolvedValue({ data: [], sessionToken: 'test-token' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'cron', 'list']);

      expect(String(consoleSpy.mock.calls[0]?.[0])).toBe('No cron jobs registered');
      consoleSpy.mockRestore();
    });

    it('prints raw JSON with --json', async () => {
      const jobs = [makeJob()];
      mockedApiRequest.mockResolvedValue({ data: jobs, sessionToken: 'test-token' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'cron', 'list', '--json']);

      const parsed = JSON.parse(String(consoleSpy.mock.calls[0]?.[0]));
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({ id: 'cron_1', name: 'daily-digest' });
      consoleSpy.mockRestore();
    });
  });

  describe('cron add', () => {
    it('creates a job with the required flags and prints a next-run preview', async () => {
      mockedApiRequest.mockResolvedValue({ data: makeJob(), sessionToken: 'test-token' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'cron',
        'add',
        '--name',
        'daily-digest',
        '--schedule',
        '0 9 * * *',
        '--task-type',
        'digest',
      ]);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'POST',
          path: '/v1/cron/jobs',
          body: expect.objectContaining({
            name: 'daily-digest',
            schedule: '0 9 * * *',
            taskType: 'digest',
          }),
        }),
      );
      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('Next run: 2026-08-16 03:00 UTC');
      consoleSpy.mockRestore();
    });

    it('includes payload and explicit enabled=false when provided', async () => {
      mockedApiRequest.mockResolvedValue({ data: makeJob(), sessionToken: 'test-token' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'cron',
        'add',
        '--name',
        'digest',
        '--schedule',
        '0 9 * * *',
        '--task-type',
        'digest',
        '--timezone',
        'Asia/Shanghai',
        '--payload-json',
        '{"channel":"slack"}',
        '--enabled',
        'false',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      const args = callArgs?.[1] as { body: Record<string, unknown> };
      expect(args.body).toMatchObject({
        timezone: 'Asia/Shanghai',
        payload: { channel: 'slack' },
        enabled: false,
      });
      consoleSpy.mockRestore();
    });

    it('rejects an invalid --enabled value', async () => {
      await expect(
        program.parseAsync([
          'node',
          'test',
          'cron',
          'add',
          '--name',
          'digest',
          '--schedule',
          '0 9 * * *',
          '--task-type',
          'digest',
          '--enabled',
          'maybe',
        ]),
      ).rejects.toThrow('Invalid --enabled value: maybe');
    });

    it('rejects malformed --payload-json', async () => {
      await expect(
        program.parseAsync([
          'node',
          'test',
          'cron',
          'add',
          '--name',
          'digest',
          '--schedule',
          '0 9 * * *',
          '--task-type',
          'digest',
          '--payload-json',
          '{not-json',
        ]),
      ).rejects.toThrow('Invalid --payload-json');
    });

    it('rejects a non-object --payload-json', async () => {
      await expect(
        program.parseAsync([
          'node',
          'test',
          'cron',
          'add',
          '--name',
          'digest',
          '--schedule',
          '0 9 * * *',
          '--task-type',
          'digest',
          '--payload-json',
          '[1,2]',
        ]),
      ).rejects.toThrow('expected a JSON object');
    });

    it('requires the mandatory flags', async () => {
      const strictProgram = new Command();
      strictProgram.exitOverride((err) => {
        throw err;
      });
      registerCronCommands(strictProgram);
      await expect(
        strictProgram.parseAsync(['node', 'test', 'cron', 'add', '--name', 'digest']),
      ).rejects.toMatchObject({ code: 'commander.missingMandatoryOptionValue' });
    });

    it('propagates http errors from the server', async () => {
      mockedApiRequest.mockRejectedValue(new Error('Cron job not found'));
      await expect(
        program.parseAsync([
          'node',
          'test',
          'cron',
          'add',
          '--name',
          'digest',
          '--schedule',
          '0 9 * * *',
          '--task-type',
          'digest',
        ]),
      ).rejects.toThrow('Cron job not found');
    });
  });

  describe('cron edit', () => {
    it('patches only the provided fields', async () => {
      mockedApiRequest.mockResolvedValue({
        data: makeJob({ name: 'renamed' }),
        sessionToken: 'test-token',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'cron', 'edit', 'cron_1', '--name', 'renamed']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'PATCH',
          path: '/v1/cron/jobs/cron_1',
          body: { name: 'renamed' },
        }),
      );
      expect(String(consoleSpy.mock.calls[0]?.[0])).toContain('renamed');
      consoleSpy.mockRestore();
    });

    it('rejects a schedule change without a timezone', async () => {
      await expect(
        program.parseAsync(['node', 'test', 'cron', 'edit', 'cron_1', '--schedule', '0 10 * * *']),
      ).rejects.toThrow('timezone is required when schedule is updated');
    });

    it('accepts a schedule change when timezone moves with it', async () => {
      mockedApiRequest.mockResolvedValue({ data: makeJob(), sessionToken: 'test-token' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync([
        'node',
        'test',
        'cron',
        'edit',
        'cron_1',
        '--schedule',
        '0 10 * * *',
        '--timezone',
        'UTC',
      ]);

      const callArgs = mockedApiRequest.mock.calls[0];
      const args = callArgs?.[1] as { body: Record<string, unknown> };
      expect(args.body).toEqual({ schedule: '0 10 * * *', timezone: 'UTC' });
      consoleSpy.mockRestore();
    });

    it('rejects an empty edit with no fields', async () => {
      await expect(program.parseAsync(['node', 'test', 'cron', 'edit', 'cron_1'])).rejects.toThrow(
        'No fields to update',
      );
    });
  });

  describe('cron pause / resume', () => {
    it('pauses a job via PATCH with enabled=false', async () => {
      mockedApiRequest.mockResolvedValue({
        data: makeJob({ enabled: false }),
        sessionToken: 'test-token',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'cron', 'pause', 'cron_1']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'PATCH',
          path: '/v1/cron/jobs/cron_1',
          body: { enabled: false },
        }),
      );
      expect(String(consoleSpy.mock.calls[0]?.[0])).toContain('[paused]');
      consoleSpy.mockRestore();
    });

    it('resumes a job via PATCH with enabled=true', async () => {
      mockedApiRequest.mockResolvedValue({ data: makeJob(), sessionToken: 'test-token' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'cron', 'resume', 'cron_1']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({
          method: 'PATCH',
          path: '/v1/cron/jobs/cron_1',
          body: { enabled: true },
        }),
      );
      expect(String(consoleSpy.mock.calls[0]?.[0])).toContain('Next run: 2026-08-16 03:00 UTC');
      consoleSpy.mockRestore();
    });
  });

  describe('cron trigger', () => {
    it('triggers a job via POST /v1/cron/jobs/:id/trigger', async () => {
      mockedApiRequest.mockResolvedValue({
        data: makeJob({
          lastRunAt: NOW,
          lastStatus: 'succeeded',
          runCount: 1,
          nextRunAt: null,
        }),
        sessionToken: 'test-token',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'cron', 'trigger', 'cron_1']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({ method: 'POST', path: '/v1/cron/jobs/cron_1/trigger' }),
      );
      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('Last run: 2026-08-16 03:00 UTC (succeeded)');
      consoleSpy.mockRestore();
    });
  });

  describe('cron status', () => {
    it('shows status snapshots via GET /v1/cron/status', async () => {
      mockedApiRequest.mockResolvedValue({
        data: [makeSnapshot(), makeSnapshot({ id: 'cron_2', enabled: false, lastError: 'boom' })],
        sessionToken: 'test-token',
      });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'cron', 'status']);

      expect(mockedApiRequest).toHaveBeenCalledWith(
        mockState,
        expect.objectContaining({ path: '/v1/cron/status' }),
      );
      const output = String(consoleSpy.mock.calls[0]?.[0]);
      expect(output).toContain('runCount=0');
      expect(output).toContain('last=never');
      expect(output).toContain('error=boom');
      consoleSpy.mockRestore();
    });

    it('prints raw JSON with --json', async () => {
      mockedApiRequest.mockResolvedValue({ data: [makeSnapshot()], sessionToken: 'test-token' });
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await program.parseAsync(['node', 'test', 'cron', 'status', '--json']);

      const parsed = JSON.parse(String(consoleSpy.mock.calls[0]?.[0]));
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({ id: 'cron_1', runCount: 0 });
      consoleSpy.mockRestore();
    });
  });

  describe('registration', () => {
    it('registers the full cron command family', () => {
      const cronCommand = program.commands.find((c) => c.name() === 'cron');
      expect(cronCommand).toBeDefined();
      const names = cronCommand?.commands.map((c) => c.name()) ?? [];
      expect(names).toEqual(
        expect.arrayContaining(['list', 'add', 'edit', 'pause', 'resume', 'trigger', 'status']),
      );
    });
  });
});
