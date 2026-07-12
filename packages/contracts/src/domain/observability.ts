import { z } from 'zod';

import { entityIdSchema } from './common.js';

export const OBSERVABILITY_CORRELATION_KEYS = [
  'requestId',
  'traceId',
  'operationId',
  'causationId',
  'queryId',
  'feedbackId',
  'asyncJobId',
  'workflowRunId',
  'candidateId',
  'entryId',
  'artifactId',
] as const;

export const observabilityCorrelationKeySchema = z.enum(OBSERVABILITY_CORRELATION_KEYS);

export type ObservabilityCorrelationKey = z.infer<typeof observabilityCorrelationKeySchema>;

export const TRACEPARENT_HEADER = 'traceparent';
export const OPERATION_ID_HEADER = 'x-trapmap-operation-id';
export const CAUSATION_ID_HEADER = 'x-trapmap-causation-id';

const nonZeroTraceIdPattern = '(?!0{32})[0-9a-f]{32}';
const nonZeroSpanIdPattern = '(?!0{16})[0-9a-f]{16}';

export const traceparentSchema = z
  .string()
  .regex(
    new RegExp(`^00-(${nonZeroTraceIdPattern})-(${nonZeroSpanIdPattern})-[0-9a-f]{2}$`),
    'traceparent must use the W3C version 00 format',
  );

export function extractTraceIdFromTraceparent(traceparent: string): string | null {
  const parsed = traceparentSchema.safeParse(traceparent.trim());
  return parsed.success ? parsed.data.slice(3, 35) : null;
}

export const observabilityEventCategorySchema = z.enum([
  'request',
  'retrieval',
  'feedback',
  'async-job',
  'workflow',
  'operator',
  'badcase-export',
]);

export type ObservabilityEventCategory = z.infer<typeof observabilityEventCategorySchema>;

export const observabilityMetricNamespaceSchema = z.enum([
  'trapmap.runtime',
  'trapmap.async',
  'trapmap.retrieval',
  'trapmap.cache',
  'trapmap.feedback',
  'trapmap.operator',
]);

export type ObservabilityMetricNamespace = z.infer<typeof observabilityMetricNamespaceSchema>;

export const observabilityRouteFamilySchema = z.enum(['runtime', 'operator', 'gateway']);

export type ObservabilityRouteFamily = z.infer<typeof observabilityRouteFamilySchema>;

export function normalizeObservabilityRouteFamily(route: string): ObservabilityRouteFamily {
  if (
    route === 'runtime' ||
    route.startsWith('/health') ||
    route.startsWith('/ready') ||
    route === '/metrics'
  ) {
    return 'runtime';
  }
  if (route === 'operator' || route.startsWith('/v1/operations')) {
    return 'operator';
  }
  if (route === 'gateway' || route.startsWith('/v1/')) {
    return 'gateway';
  }
  return 'runtime';
}

export const observabilityFieldVisibilitySchema = z.enum(['public-additive', 'internal-only']);

export type ObservabilityFieldVisibility = z.infer<typeof observabilityFieldVisibilitySchema>;

export const observabilitySurfaceOwnerSchema = z.enum([
  'contracts',
  'backend-core-port',
  'runtime-seam',
  'server-compatibility-seam',
  'client-surface',
  'operator-surface',
  'durable-trace',
]);

export type ObservabilitySurfaceOwner = z.infer<typeof observabilitySurfaceOwnerSchema>;

export const correlationContextSchema = z
  .object({
    requestId: entityIdSchema,
    traceparent: traceparentSchema,
    traceId: z.string().regex(/^[0-9a-f]{32}$/),
    operationId: entityIdSchema.optional(),
    causationId: entityIdSchema.optional(),
    service: z.string().min(1).max(256),
    ownerSurface: observabilitySurfaceOwnerSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (extractTraceIdFromTraceparent(value.traceparent) !== value.traceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['traceId'],
        message: 'traceId must match the trace ID encoded in traceparent',
      });
    }
  });

export type CorrelationContext = z.infer<typeof correlationContextSchema>;

export const OBSERVABILITY_FAILURE_CLASSIFICATIONS = [
  'user-error',
  'auth-policy-error',
  'dependency-error',
  'timeout',
  'stale-projection',
  'retryable-async-failure',
  'permanent-failure',
] as const;

export const observabilityFailureClassificationSchema = z.enum(
  OBSERVABILITY_FAILURE_CLASSIFICATIONS,
);

export type ObservabilityFailureClassification = z.infer<
  typeof observabilityFailureClassificationSchema
>;

export const observabilityLogFieldSchema = z.enum([
  'eventCategory',
  'eventName',
  'requestId',
  'traceId',
  'operationId',
  'causationId',
  'queryId',
  'feedbackId',
  'asyncJobId',
  'workflowRunId',
  'candidateId',
  'entryId',
  'artifactId',
  'routeFamily',
  'failureClassification',
  'runtimeMode',
  'serviceUnit',
  'ownerSurface',
]);

export type ObservabilityLogField = z.infer<typeof observabilityLogFieldSchema>;

export const OBSERVABILITY_PUBLIC_ADDITIVE_FIELDS = [
  'requestId',
  'traceId',
  'queryId',
  'feedbackId',
  'asyncJobId',
] as const satisfies ReadonlyArray<ObservabilityCorrelationKey>;

export const OBSERVABILITY_INTERNAL_ONLY_CORRELATION_KEYS = [
  'operationId',
  'causationId',
  'workflowRunId',
  'candidateId',
  'entryId',
  'artifactId',
] as const satisfies ReadonlyArray<ObservabilityCorrelationKey>;

export const workflowCorrelationSchema = z
  .object({
    requestId: entityIdSchema.optional(),
    traceId: z.string().min(1).max(256).optional(),
    queryId: entityIdSchema.optional(),
    feedbackId: entityIdSchema.optional(),
    asyncJobId: entityIdSchema.optional(),
  })
  .strict();

export type WorkflowCorrelation = z.infer<typeof workflowCorrelationSchema>;

export function pickWorkflowCorrelation(
  source: Record<string, unknown> | null | undefined,
): WorkflowCorrelation | null {
  if (!source) {
    return null;
  }

  const candidate: WorkflowCorrelation = {};

  if (typeof source.requestId === 'string' && source.requestId.length > 0) {
    candidate.requestId = source.requestId;
  }
  if (typeof source.traceId === 'string' && source.traceId.length > 0) {
    candidate.traceId = source.traceId;
  }
  if (typeof source.queryId === 'string' && source.queryId.length > 0) {
    candidate.queryId = source.queryId;
  }
  if (typeof source.feedbackId === 'string' && source.feedbackId.length > 0) {
    candidate.feedbackId = source.feedbackId;
  }
  if (typeof source.asyncJobId === 'string' && source.asyncJobId.length > 0) {
    candidate.asyncJobId = source.asyncJobId;
  }

  const parsed = workflowCorrelationSchema.safeParse(candidate);
  if (!parsed.success) {
    return null;
  }

  return Object.values(parsed.data).some((value) => value !== undefined) ? parsed.data : null;
}

export const observabilityFailureTaxonomyItemSchema = z
  .object({
    category: observabilityFailureClassificationSchema,
    meaning: z.string().min(1).max(500),
    operatorAction: z.string().min(1).max(1000),
  })
  .strict();

export type ObservabilityFailureTaxonomyItem = z.infer<
  typeof observabilityFailureTaxonomyItemSchema
>;

export const observabilityFailureTaxonomyItems = z
  .array(observabilityFailureTaxonomyItemSchema)
  .length(OBSERVABILITY_FAILURE_CLASSIFICATIONS.length)
  .parse([
    {
      category: 'user-error',
      meaning:
        'The request or operator input is invalid and retrying without correction will not succeed.',
      operatorAction:
        'Fix the request payload, command parameters, or target state before retrying.',
    },
    {
      category: 'auth-policy-error',
      meaning: 'Authorization, membership, or policy checks rejected the action.',
      operatorAction:
        'Adjust actor permissions, team context, or policy state before replaying the action.',
    },
    {
      category: 'dependency-error',
      meaning:
        'A required dependency such as PostgreSQL, graph/indexing, or storage integration is unavailable or unhealthy.',
      operatorAction: 'Restore the dependency, then replay or requeue the blocked work item.',
    },
    {
      category: 'timeout',
      meaning: 'The action exceeded its runtime budget and may require retry or decomposition.',
      operatorAction:
        'Check handler latency, reduce batch size if relevant, and retry after the timeout source is addressed.',
    },
    {
      category: 'stale-projection',
      meaning:
        'Authoritative writes committed, but read-side projections or caches have not converged yet.',
      operatorAction:
        'Inspect queue/outbox backlog, workflow runs, and cache invalidation status; replay refresh work only after the updater is healthy.',
    },
    {
      category: 'retryable-async-failure',
      meaning:
        'The async substrate captured a transient failure and will retry automatically until limits are exhausted.',
      operatorAction:
        'Monitor retry progress; intervene only if backlog, stale leases, or repeated failures indicate the worker cannot self-recover.',
    },
    {
      category: 'permanent-failure',
      meaning:
        'Retry limits were exhausted and the work item is now dead-lettered or failed for manual intervention.',
      operatorAction:
        'Inspect the failed task or outbox record, repair the underlying cause, then requeue or replay the item if it is still canonical.',
    },
  ]);

export const observabilityContractSchema = z
  .object({
    correlationKeys: z.array(observabilityCorrelationKeySchema).min(1),
    publicCorrelationKeys: z.array(observabilityCorrelationKeySchema),
    internalOnlyKeys: z.array(observabilityCorrelationKeySchema),
    eventCategories: z.array(observabilityEventCategorySchema).min(1),
    metricNamespaces: z.array(observabilityMetricNamespaceSchema).min(1),
    allowedMetricLabels: z.array(
      z.enum([
        'eventCategory',
        'eventName',
        'failureClassification',
        'runtimeMode',
        'serviceUnit',
        'routeFamily',
        'dependencyName',
        'cacheNamespace',
        'taskType',
        'workflowType',
      ]),
    ),
    highCardinalityEventFields: z.array(observabilityLogFieldSchema),
    publicAdditiveFields: z.array(observabilityCorrelationKeySchema),
    internalOnlyFields: z.array(observabilityLogFieldSchema),
    surfaceOwners: z.array(
      z
        .object({
          surface: observabilitySurfaceOwnerSchema,
          responsibility: z.string().min(1).max(400),
          visibility: observabilityFieldVisibilitySchema,
        })
        .strict(),
    ),
    failureTaxonomy: z.array(observabilityFailureClassificationSchema).min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const key of value.publicCorrelationKeys) {
      if (!value.correlationKeys.includes(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `publicCorrelationKeys must be declared in correlationKeys: ${key}`,
        });
      }
    }

    for (const key of value.internalOnlyKeys) {
      if (!value.correlationKeys.includes(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `internalOnlyKeys must be declared in correlationKeys: ${key}`,
        });
      }
      if (value.publicCorrelationKeys.includes(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `key cannot be both public and internal-only: ${key}`,
        });
      }
    }
  });

export const defaultObservabilityContract = observabilityContractSchema.parse({
  correlationKeys: [
    'requestId',
    'traceId',
    'operationId',
    'causationId',
    'queryId',
    'feedbackId',
    'asyncJobId',
    'workflowRunId',
    'candidateId',
    'entryId',
    'artifactId',
  ],
  publicCorrelationKeys: [...OBSERVABILITY_PUBLIC_ADDITIVE_FIELDS],
  internalOnlyKeys: [...OBSERVABILITY_INTERNAL_ONLY_CORRELATION_KEYS],
  eventCategories: [
    'request',
    'retrieval',
    'feedback',
    'async-job',
    'workflow',
    'operator',
    'badcase-export',
  ],
  metricNamespaces: [
    'trapmap.runtime',
    'trapmap.async',
    'trapmap.retrieval',
    'trapmap.cache',
    'trapmap.feedback',
    'trapmap.operator',
  ],
  allowedMetricLabels: [
    'eventCategory',
    'eventName',
    'failureClassification',
    'runtimeMode',
    'serviceUnit',
    'routeFamily',
    'dependencyName',
    'cacheNamespace',
    'taskType',
    'workflowType',
  ],
  highCardinalityEventFields: [
    'requestId',
    'traceId',
    'operationId',
    'causationId',
    'queryId',
    'feedbackId',
    'asyncJobId',
    'workflowRunId',
    'candidateId',
    'entryId',
    'artifactId',
  ],
  publicAdditiveFields: [...OBSERVABILITY_PUBLIC_ADDITIVE_FIELDS],
  internalOnlyFields: [
    'operationId',
    'causationId',
    'workflowRunId',
    'candidateId',
    'entryId',
    'artifactId',
    'ownerSurface',
  ],
  surfaceOwners: [
    {
      surface: 'contracts',
      responsibility: 'Freeze shared key names, public additive fields, and taxonomy enums.',
      visibility: 'public-additive',
    },
    {
      surface: 'backend-core-port',
      responsibility: 'Declare propagation requirements across service and async boundaries.',
      visibility: 'internal-only',
    },
    {
      surface: 'runtime-seam',
      responsibility:
        'Own request/trace headers, metrics snapshots, and runtime failure semantics.',
      visibility: 'internal-only',
    },
    {
      surface: 'server-compatibility-seam',
      responsibility:
        'Bridge shared runtime/status consumers without creating a second truth source.',
      visibility: 'internal-only',
    },
    {
      surface: 'client-surface',
      responsibility: 'Expose only additive requestId/queryId/asyncJobId style debug handles.',
      visibility: 'public-additive',
    },
    {
      surface: 'operator-surface',
      responsibility:
        'Explain runtime status, backlog, failure taxonomy, and async follow-up state.',
      visibility: 'internal-only',
    },
    {
      surface: 'durable-trace',
      responsibility:
        'Persist reproducibility-grade badcase traces outside ephemeral logs and analytics.',
      visibility: 'internal-only',
    },
  ],
  failureTaxonomy: [...OBSERVABILITY_FAILURE_CLASSIFICATIONS],
});
