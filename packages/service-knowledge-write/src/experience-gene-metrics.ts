import { performance } from 'node:perf_hooks';

import type { ExperienceGeneMetricsPort } from '@trapmap/backend-core';
import type { ExperienceGeneDerivationTaskPayload, ExperienceGeneMode } from '@trapmap/contracts';

import type { deriveExperienceGeneFromRule } from './experience-gene-derivation.js';

export function withExperienceGeneDerivationMetrics(
  operation: (
    request: ExperienceGeneDerivationTaskPayload,
  ) => ReturnType<typeof deriveExperienceGeneFromRule>,
  params: { metrics: ExperienceGeneMetricsPort; mode: ExperienceGeneMode },
) {
  // fallow-ignore-next-line complexity -- outcome/rejection/solidification branches keep metric semantics explicit.
  return async (request: Parameters<typeof deriveExperienceGeneFromRule>[0]) => {
    const startedAt = performance.now();
    try {
      const result = await operation(request);
      const durationMs = performance.now() - startedAt;
      const generator =
        'gene' in result
          ? result.gene.generator.kind
          : result.status === 'rejected' && result.reasonClass === 'generator-unavailable'
            ? 'llm'
            : request.generatorKind;
      const reasonClass = result.status === 'rejected' ? result.reasonClass : undefined;
      params.metrics.recordDerivation({
        mode: params.mode,
        sourceKind: request.source.kind,
        generator,
        outcome: result.status === 'solidified' ? 'solidified' : result.status,
        durationMs,
        ...(reasonClass ? { reasonClass } : {}),
        retryCount: 0,
      });
      if (result.status === 'rejected') {
        params.metrics.recordValidationRejection({
          mode: params.mode,
          gate: result.reasonClass,
        });
      }
      if (result.status === 'solidified') {
        params.metrics.recordSolidified({
          mode: params.mode,
          sourceKind: request.source.kind,
        });
      }
      return result;
    } catch (error) {
      params.metrics.recordDerivation({
        mode: params.mode,
        sourceKind: request.source.kind,
        generator: request.generatorKind,
        outcome: 'error',
        durationMs: performance.now() - startedAt,
        reasonClass: 'infrastructure-error',
        retryCount: 0,
      });
      throw error;
    }
  };
}
