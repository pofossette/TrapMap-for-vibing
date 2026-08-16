/**
 * CLI cron job management commands (Task 4).
 *
 * Both the monolith (host-local Nest) and the distributed gateway expose the
 * same session-guarded surface under `/v1/cron/*`; these commands target that
 * single URL surface through the shared CLI http client.
 */

import type { CronJob, CronJobStatusSnapshot } from '@trapmap/contracts';
import {
  cronJobCreateInputSchema,
  cronJobSchema,
  cronJobStatusSnapshotSchema,
  cronJobUpdateInputSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';
import type { ZodType } from 'zod';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';
import type { JsonFlag } from '@trapmap/cli/lib/output.js';

/**
 * Renders an ISO timestamp as a human-readable UTC date-time.
 * Falls back to the raw value when the input is not parseable.
 */
function formatCronTimestamp(value: string | null): string {
  if (value === null) return 'none';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())} ${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())} UTC`;
}

function formatSingleJob(job: CronJob): string {
  const lines = [
    `${job.id} [${job.enabled ? 'enabled' : 'paused'}] ${job.name}`,
    `Schedule: ${job.schedule} (${job.timezone})`,
    `Task: ${job.taskType}`,
    `Next run: ${formatCronTimestamp(job.nextRunAt)}`,
    `Last run: ${formatCronTimestamp(job.lastRunAt)} (${job.lastStatus ?? 'never'})`,
    `Run count: ${job.runCount}`,
  ];
  if (job.lastError !== null) {
    lines.push(`Last error: ${job.lastError}`);
  }
  return lines.join('\n');
}

function formatJobList(jobs: CronJob[]): string {
  if (jobs.length === 0) {
    return 'No cron jobs registered';
  }
  return jobs
    .map((job) => {
      const status = job.enabled ? 'enabled' : 'paused';
      const next = formatCronTimestamp(job.nextRunAt);
      return `${job.id}  [${status}]  ${job.name}  ${job.schedule} (${job.timezone})  next=${next}`;
    })
    .join('\n');
}

function formatStatus(snapshots: CronJobStatusSnapshot[]): string {
  if (snapshots.length === 0) {
    return 'No cron jobs registered';
  }
  return snapshots
    .map((snapshot) => {
      const status = snapshot.enabled ? 'enabled' : 'paused';
      const next = formatCronTimestamp(snapshot.nextRunAt);
      const last = snapshot.lastStatus ?? 'never';
      const error = snapshot.lastError !== null ? `  error=${snapshot.lastError}` : '';
      return `${snapshot.id}  [${status}]  runCount=${snapshot.runCount}  next=${next}  last=${last}${error}`;
    })
    .join('\n');
}

interface JobInputFlags {
  name?: string;
  schedule?: string;
  timezone?: string;
  taskType?: string;
  payloadJson?: string;
  enabled?: string;
}

function parseBooleanFlag(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid --enabled value: ${value}. Use true or false.`);
}

function parsePayloadJson(raw: string | undefined): Record<string, unknown> | undefined {
  if (raw === undefined) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Invalid --payload-json: not valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid --payload-json: expected a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function buildJobBody(flags: JobInputFlags): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (flags.name !== undefined) body.name = flags.name;
  if (flags.schedule !== undefined) body.schedule = flags.schedule;
  if (flags.timezone !== undefined) body.timezone = flags.timezone;
  if (flags.taskType !== undefined) body.taskType = flags.taskType;
  if (flags.payloadJson !== undefined) body.payload = parsePayloadJson(flags.payloadJson);
  const enabled = parseBooleanFlag(flags.enabled);
  if (enabled !== undefined) body.enabled = enabled;
  return body;
}

function validateJobBody(body: Record<string, unknown>, schema: ZodType): void {
  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.issues.map((issue) => {
      const path = issue.path.join('.');
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    });
    throw new Error(`Invalid cron job input: ${messages.join('; ')}`);
  }
}

function formatJobArtifact(job: CronJob): Record<string, unknown> {
  return { id: job.id, title: job.name, newState: job.enabled ? 'enabled' : 'paused' };
}

export function registerCronCommands(program: Command): void {
  const cron = program.command('cron').description('Manage scheduled cron jobs');

  cron
    .command('list')
    .description('List all cron jobs')
    .option('--json', 'Output JSON')
    .action(async (flags: JsonFlag) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const response = await apiRequest<CronJob[]>(state, { path: '/v1/cron/jobs' });
      const parsed = cronJobSchema.array().parse(response.data);

      printCommandResult(
        {
          action: 'cron-list',
          success: true,
          summary: `${parsed.length} cron job(s).`,
          artifacts: parsed.map(formatJobArtifact),
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        formatJobList,
      );
    });

  cron
    .command('add')
    .description('Create a new cron job')
    .requiredOption('--name <name>', 'Job name')
    .requiredOption('--schedule <expr>', 'Cron schedule expression (e.g. "0 9 * * *")')
    .option('--timezone <tz>', 'Timezone for the schedule (default: UTC)')
    .requiredOption('--task-type <type>', 'Task type enqueued when the job fires')
    .option('--payload-json <json>', 'Task payload as a JSON object')
    .option('--enabled <true|false>', 'Whether the job starts enabled (default: true)')
    .option('--json', 'Output JSON')
    .action(async (flags: JobInputFlags & JsonFlag) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const body = buildJobBody(flags);
      validateJobBody(body, cronJobCreateInputSchema);

      const response = await apiRequest<CronJob>(state, {
        method: 'POST',
        path: '/v1/cron/jobs',
        body,
      });
      const parsed = cronJobSchema.parse(response.data);

      printCommandResult(
        {
          action: 'cron-add',
          success: true,
          summary: `Created cron job ${parsed.id}. Next run: ${formatCronTimestamp(parsed.nextRunAt)}`,
          artifacts: [formatJobArtifact(parsed)],
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        formatSingleJob,
      );
    });

  cron
    .command('edit <jobId>')
    .description('Update an existing cron job (any subset of fields)')
    .option('--name <name>', 'Job name')
    .option('--schedule <expr>', 'Cron schedule expression (e.g. "0 9 * * *")')
    .option('--timezone <tz>', 'Timezone for the schedule')
    .option('--task-type <type>', 'Task type enqueued when the job fires')
    .option('--payload-json <json>', 'Task payload as a JSON object')
    .option('--enabled <true|false>', 'Whether the job is enabled')
    .option('--json', 'Output JSON')
    .action(async (jobId: string, flags: JobInputFlags & JsonFlag) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const body = buildJobBody(flags);
      if (Object.keys(body).length === 0) {
        throw new Error(
          'No fields to update. Provide at least one of --name, --schedule, --timezone, --task-type, --payload-json, --enabled.',
        );
      }
      validateJobBody(body, cronJobUpdateInputSchema);

      const response = await apiRequest<CronJob>(state, {
        method: 'PATCH',
        path: `/v1/cron/jobs/${jobId}`,
        body,
      });
      const parsed = cronJobSchema.parse(response.data);

      printCommandResult(
        {
          action: 'cron-edit',
          success: true,
          summary: `Updated cron job ${parsed.id}. Next run: ${formatCronTimestamp(parsed.nextRunAt)}`,
          artifacts: [formatJobArtifact(parsed)],
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        formatSingleJob,
      );
    });

  for (const [name, description, enabled] of [
    ['pause', 'Pause a cron job (disable scheduling)', false],
    ['resume', 'Resume a paused cron job (enable scheduling)', true],
  ] as const) {
    cron
      .command(`${name} <jobId>`)
      .description(description)
      .option('--json', 'Output JSON')
      .action(async (jobId: string, flags: JsonFlag) => {
        const state = await loadCliState();
        requireSessionToken(state);
        const response = await apiRequest<CronJob>(state, {
          method: 'PATCH',
          path: `/v1/cron/jobs/${jobId}`,
          body: { enabled },
        });
        const parsed = cronJobSchema.parse(response.data);

        printCommandResult(
          {
            action: `cron-${name}`,
            success: true,
            summary: `${name === 'pause' ? 'Paused' : 'Resumed'} cron job ${parsed.id}.`,
            artifacts: [formatJobArtifact(parsed)],
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatSingleJob,
        );
      });
  }

  cron
    .command('trigger <jobId>')
    .description('Manually trigger a cron job now (does not advance its schedule)')
    .option('--json', 'Output JSON')
    .action(async (jobId: string, flags: JsonFlag) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const response = await apiRequest<CronJob>(state, {
        method: 'POST',
        path: `/v1/cron/jobs/${jobId}/trigger`,
      });
      const parsed = cronJobSchema.parse(response.data);

      printCommandResult(
        {
          action: 'cron-trigger',
          success: true,
          summary: `Triggered cron job ${parsed.id}.`,
          artifacts: [formatJobArtifact(parsed)],
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        formatSingleJob,
      );
    });

  cron
    .command('status')
    .description('Show status snapshots for all cron jobs')
    .option('--json', 'Output JSON')
    .action(async (flags: JsonFlag) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const response = await apiRequest<CronJobStatusSnapshot[]>(state, {
        path: '/v1/cron/status',
      });
      const parsed = cronJobStatusSnapshotSchema.array().parse(response.data);

      printCommandResult(
        {
          action: 'cron-status',
          success: true,
          summary: `${parsed.length} cron job(s) in registry.`,
          artifacts: parsed.map((snapshot) => ({
            id: snapshot.id,
            newState: snapshot.enabled ? 'enabled' : 'paused',
          })),
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        formatStatus,
      );
    });
}
