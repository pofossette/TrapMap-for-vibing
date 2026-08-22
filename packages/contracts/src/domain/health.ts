import { z } from 'zod';

export const dependencyStatusSchema = z
  .object({
    name: z.string().min(1),
    status: z.enum(['healthy', 'degraded', 'unhealthy', 'unknown']),
    critical: z.boolean().optional(),
    latencyMs: z.number().nonnegative().optional(),
    message: z.string().optional(),
    lastChecked: z.string().datetime().optional(),
  })
  .strict();

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

export const healthStatusSchema = z
  .object({
    status: z.enum(['ok', 'degraded', 'unhealthy']),
    timestamp: z.string().datetime(),
    startedAt: z.string().datetime(),
    uptime: z.number().nonnegative(),
    version: z.string().optional(),
    readiness: z.enum(['ready', 'not-ready', 'degraded']),
    liveness: z.enum(['alive', 'dead']),
    dependencies: z.array(dependencyStatusSchema),
    deployment: z
      .object({
        profile: z.string().min(1),
        preset: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type HealthStatus = z.infer<typeof healthStatusSchema>;

/**
 * Task C5: aggregate dependency summary for readiness decisions.
 * Optional and additive — existing producers remain valid.
 */
export const dependencySummarySchema = z
  .object({
    /** DB connection pool saturation, 0 (idle) … 1 (exhausted). */
    dbPoolSaturation: z.number().min(0).max(1),
    /** Outstanding tasks in the job-runtime queue. */
    queueDepth: z.number().int().nonnegative(),
    /** Circuit breaker states per service key (Task C2). */
    breakerStates: z.record(z.string(), z.enum(['closed', 'open', 'half-open'])),
  })
  .strict();

export type DependencySummary = z.infer<typeof dependencySummarySchema>;

/** Readiness payload: liveness facts plus the optional dependency summary. */
export const readinessStatusSchema = healthStatusSchema.extend({
  dependencySummary: dependencySummarySchema.optional(),
});

export type ReadinessStatus = z.infer<typeof readinessStatusSchema>;
