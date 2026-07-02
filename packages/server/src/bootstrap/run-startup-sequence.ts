/**
 * Startup sequence orchestrator.
 *
 * Replaces the scattered onReady hooks in app.ts with a single, ordered
 * startup sequence. Each step is in its own module and has clear
 * prerequisites:
 *
 *   0. OTel SDK bootstrap (tracing, before anything that emits spans)
 *   1. Repositories (migrations, repos, vector index)
 *   2. Candidate recovery (re-enqueue interrupted candidates)
 *   3. Workers (task worker for candidate processing)
 *   4. Graph reconciliation (reconcile graph indexes)
 *   5. Lifecycle (event subscribers + outbox worker)
 */

import type { FastifyInstance } from 'fastify';

import { bootstrapCandidateRecovery } from './bootstrap-candidate-recovery.js';
import { bootstrapGraphReconciliation } from './bootstrap-graph-reconciliation.js';
import { bootstrapOtel } from './bootstrap-otel.js';
import { bootstrapRepositories } from './bootstrap-repositories.js';
import { runWorkerSequence } from './run-worker-sequence.js';
import { type RuntimeMode, shouldBootApiRuntime } from './runtime-mode.js';

/** Stored reference to the OTel SDK for graceful shutdown. */
let otelSdkRef: any = null;

/** Retrieve the OTel SDK instance (for shutdown in onClose hook). */
export function getOtelSdk(): any {
  return otelSdkRef;
}

export async function runStartupSequence(
  app: FastifyInstance,
  mode: RuntimeMode = 'combined',
): Promise<void> {
  // Step 0: Bootstrap OTel SDK (fail-open, non-blocking).
  const otelDisabled = process.env.OTEL_DISABLED === 'true';
  if (!otelDisabled) {
    const profile = app.skillShareer.config.deployment.resolved.deploymentProfile ?? 'local-agent';
    const sampleRate = parseFloat(process.env.OTEL_SAMPLE_RATE ?? '0.1');
    const otelResult = await bootstrapOtel({
      profile,
      otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318',
      serviceName: 'trapmap',
      serviceVersion: process.env.npm_package_version ?? '0.1.0',
      sampleRate,
    });
    if (otelResult.success) {
      otelSdkRef = otelResult.sdk;
      app.log.info(`OpenTelemetry SDK started (profile: ${profile}, sampleRate: ${sampleRate})`);
    } else {
      app.log.warn(
        { error: otelResult.error },
        'OpenTelemetry SDK failed to start -- tracing degraded to no-op',
      );
    }
  } else {
    app.log.info('OpenTelemetry disabled by OTEL_DISABLED=true');
  }

  await bootstrapRepositories(app);

  if (shouldBootApiRuntime(mode)) {
    await bootstrapCandidateRecovery(app);
    await bootstrapGraphReconciliation(app);
  }

  await runWorkerSequence(app, mode);
  Object.freeze(app.skillShareer);
}
