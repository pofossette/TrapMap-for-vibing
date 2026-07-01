/**
 * Pipeline timing utilities for RAG retrieval.
 *
 * Captures detailed per-step latency for RAG logging.
 */

import type { PipelineStep } from '@trapmap/server/lib/rag-log.js';

/**
 * Options for timedStep to record input/output sizes.
 */
interface TimedStepOptions {
  inputSize?: number;
  outputSize?: number | ((result: unknown) => number);
}

/**
 * Time a pipeline step and record its latency.
 * Used to capture detailed timing for RAG logging.
 */
export async function timedStep<T>(
  name: string,
  fn: () => Promise<T>,
  steps: PipelineStep[],
  options?: TimedStepOptions,
): Promise<T> {
  const start = Date.now();
  const result = await fn();
  const latencyMs = Date.now() - start;
  const step: PipelineStep = { name, latencyMs };
  if (options?.inputSize !== undefined) {
    step.inputSize = options.inputSize;
  }
  if (options?.outputSize !== undefined) {
    step.outputSize =
      typeof options.outputSize === 'function' ? options.outputSize(result) : options.outputSize;
  }
  steps.push(step);
  return result;
}
