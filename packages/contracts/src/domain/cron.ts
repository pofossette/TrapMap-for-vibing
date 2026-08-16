import { z } from 'zod';

export const cronRunOutcomeSchema = z.enum(['succeeded', 'failed', 'skipped']);

const cronPayloadSchema = z.record(z.string(), z.unknown());

export const cronJobSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    schedule: z.string().min(1),
    timezone: z.string().min(1),
    taskType: z.string().min(1),
    payload: cronPayloadSchema,
    enabled: z.boolean(),
    nextRunAt: z.string().datetime().nullable(),
    lastRunAt: z.string().datetime().nullable(),
    lastStatus: cronRunOutcomeSchema.nullable(),
    lastError: z.string().nullable(),
    runCount: z.number().int().nonnegative(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type CronJob = z.infer<typeof cronJobSchema>;

export const cronJobCreateInputSchema = z
  .object({
    name: z.string().min(1),
    schedule: z.string().min(1),
    timezone: z.string().min(1).default('UTC'),
    taskType: z.string().min(1),
    payload: cronPayloadSchema.default({}),
    enabled: z.boolean().default(true),
  })
  .strict();

export type CronJobCreateInput = z.infer<typeof cronJobCreateInputSchema>;

export const cronJobUpdateInputSchema = z
  .object({
    name: z.string().min(1).optional(),
    schedule: z.string().min(1).optional(),
    timezone: z.string().min(1).optional(),
    taskType: z.string().min(1).optional(),
    payload: cronPayloadSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.schedule !== undefined && input.timezone === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'timezone is required when schedule is updated',
        path: ['timezone'],
      });
    }
  });

export type CronJobUpdateInput = z.infer<typeof cronJobUpdateInputSchema>;

export const cronJobStatusSnapshotSchema = z
  .object({
    id: z.string().min(1),
    enabled: z.boolean(),
    nextRunAt: z.string().datetime().nullable(),
    lastRunAt: z.string().datetime().nullable(),
    lastStatus: cronRunOutcomeSchema.nullable(),
    lastError: z.string().nullable(),
    runCount: z.number().int().nonnegative(),
  })
  .strict();

export type CronJobStatusSnapshot = z.infer<typeof cronJobStatusSnapshotSchema>;
