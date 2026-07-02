import { z } from 'zod';

export const featureFlagsSchema = z
  .object({
    metricsEnabled: z.boolean().default(true),
    tracingEnabled: z.boolean().default(true),
    loggingEnabled: z.boolean().default(true),
    serviceDiscoveryEnabled: z.boolean().default(false),
  })
  .strict();

export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export const observabilityConfigSchema = z
  .object({
    consulAddress: z.string().optional(),
    consulEnabled: z.boolean().default(false),
    otelEndpoint: z.string().optional(),
    otelDisabled: z.boolean().default(false),
    lokiUrl: z.string().optional(),
    lokiEnabled: z.boolean().default(false),
    prometheusEnabled: z.boolean().default(true),
    metricsPrefix: z.string().default('trapmap_'),
  })
  .strict();

export type ObservabilityConfig = z.infer<typeof observabilityConfigSchema>;
