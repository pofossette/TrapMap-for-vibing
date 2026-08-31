import { describe, expect, it } from 'vitest';

import {
  OBSERVABILITY_FAILURE_CLASSIFICATIONS,
  OBSERVABILITY_INTERNAL_ONLY_CORRELATION_KEYS,
  OBSERVABILITY_PUBLIC_ADDITIVE_FIELDS,
  correlationContextSchema,
  defaultObservabilityContract,
  observabilityContractSchema,
  observabilityFailureClassificationSchema,
  observabilityFailureTaxonomyItems,
  observabilityMetricNamespaceSchema,
  pickWorkflowCorrelation,
  workflowCorrelationSchema,
} from '../../src/domain/observability.js';

describe('observability contract', () => {
  it('parses a complete correlation context with a trace ID derived from traceparent', () => {
    const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

    expect(
      correlationContextSchema.safeParse({
        requestId: 'req_1',
        traceparent,
        traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
        operationId: 'operation_1',
        causationId: 'event_1',
        service: 'trapmap-server',
        ownerSurface: 'runtime-seam',
      }),
    ).toMatchObject({ success: true });
  });

  it('rejects a correlation context with a non-W3C traceparent', () => {
    expect(
      correlationContextSchema.safeParse({
        requestId: 'req_1',
        traceparent: 'trace-abc',
        traceId: 'trace-abc',
        service: 'trapmap-server',
        ownerSurface: 'runtime-seam',
      }).success,
    ).toBe(false);
  });

  it('freezes the default additive and internal boundaries', () => {
    expect(defaultObservabilityContract.publicAdditiveFields).toEqual([
      ...OBSERVABILITY_PUBLIC_ADDITIVE_FIELDS,
    ]);
    expect(defaultObservabilityContract.internalOnlyFields).toContain('workflowRunId');
    expect(defaultObservabilityContract.internalOnlyFields).toContain('ownerSurface');
    expect(defaultObservabilityContract.internalOnlyKeys).toEqual([
      ...OBSERVABILITY_INTERNAL_ONLY_CORRELATION_KEYS,
    ]);
    expect(defaultObservabilityContract.publicAdditiveFields).not.toContain('operationId');
    expect(defaultObservabilityContract.publicAdditiveFields).not.toContain('causationId');
  });

  it('rejects keys that are both public and internal-only', () => {
    expect(() =>
      observabilityContractSchema.parse({
        ...defaultObservabilityContract,
        publicCorrelationKeys: ['requestId'],
        internalOnlyKeys: ['requestId'],
      }),
    ).toThrow(/both public and internal-only/);
  });

  it('keeps metric namespaces and failure taxonomy stable', () => {
    expect(observabilityMetricNamespaceSchema.options).toEqual([
      'trapmap.runtime',
      'trapmap.async',
      'trapmap.retrieval',
      'trapmap.cache',
      'trapmap.feedback',
      'trapmap.operator',
      'trapmap.distributed',
    ]);
    expect(observabilityFailureClassificationSchema.options).toEqual([
      ...OBSERVABILITY_FAILURE_CLASSIFICATIONS,
    ]);
    expect(observabilityFailureTaxonomyItems.map((item) => item.category)).toEqual([
      ...OBSERVABILITY_FAILURE_CLASSIFICATIONS,
    ]);
  });

  it('freezes workflow correlation to public additive keys only', () => {
    expect(
      workflowCorrelationSchema.parse({
        requestId: 'req_1',
        traceId: 'trace_1',
        queryId: 'qry_1',
        feedbackId: 'feedback_1',
        asyncJobId: 'wf_1',
      }),
    ).toMatchObject({
      requestId: 'req_1',
      traceId: 'trace_1',
      queryId: 'qry_1',
      feedbackId: 'feedback_1',
      asyncJobId: 'wf_1',
    });

    expect(() =>
      workflowCorrelationSchema.parse({
        requestId: 'req_1',
        workflowRunId: 'wf_internal_1',
      }),
    ).toThrow();
  });

  it('extracts workflow correlation only from the frozen public additive keys', () => {
    expect(
      pickWorkflowCorrelation({
        requestId: 'req_1',
        traceId: 'trace_1',
        queryId: 'qry_1',
        feedbackId: 'feedback_1',
        asyncJobId: 'wf_1',
        workflowRunId: 'wf_internal_1',
      }),
    ).toEqual({
      requestId: 'req_1',
      traceId: 'trace_1',
      queryId: 'qry_1',
      feedbackId: 'feedback_1',
      asyncJobId: 'wf_1',
    });

    expect(
      pickWorkflowCorrelation({
        workflowRunId: 'wf_internal_1',
        artifactId: 'artifact_1',
      }),
    ).toBeNull();
  });
});
