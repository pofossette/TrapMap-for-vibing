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
