import { describe, expect, it } from 'vitest';

import {
  OBSERVABILITY_FAILURE_CLASSIFICATIONS,
  OBSERVABILITY_INTERNAL_ONLY_CORRELATION_KEYS,
  OBSERVABILITY_PUBLIC_ADDITIVE_FIELDS,
  defaultObservabilityContract,
  observabilityContractSchema,
  observabilityFailureClassificationSchema,
  observabilityFailureTaxonomyItems,
  observabilityMetricNamespaceSchema,
  pickWorkflowCorrelation,
  workflowCorrelationSchema,
} from './observability.js';

describe('observability contract', () => {
  it('freezes the default additive and internal boundaries', () => {
    expect(defaultObservabilityContract.publicAdditiveFields).toEqual([
      ...OBSERVABILITY_PUBLIC_ADDITIVE_FIELDS,
    ]);
    expect(defaultObservabilityContract.internalOnlyFields).toContain('workflowRunId');
    expect(defaultObservabilityContract.internalOnlyFields).toContain('ownerSurface');
    expect(defaultObservabilityContract.internalOnlyKeys).toEqual([
      ...OBSERVABILITY_INTERNAL_ONLY_CORRELATION_KEYS,
    ]);
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
