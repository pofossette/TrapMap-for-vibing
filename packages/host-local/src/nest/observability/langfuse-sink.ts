/**
 * Standalone Langfuse observation sink factory.
 *
 * This module creates a Langfuse observation sink that can be used
 * outside of NestJS DI (e.g. in `shared-infra.ts` at the composition
 * boundary). It dynamically imports `langfuse` only when the policy
 * is enabled and credentials are valid.
 *
 * The NestJS LangfuseService delegates to this same logic for the
 * actual SDK interaction.
 */

import type {
  ChatObservation,
  EmbeddingObservation,
  LlmObservationSink,
} from '@trapmap/ai-providers';
import type { LangfusePolicyResult } from '@trapmap/contracts';
import { validateLangfusePolicy } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LangfuseClientLike {
  generation(body: {
    name: string;
    model?: string;
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
    startTime?: Date;
    endTime?: Date;
    level?: string;
    statusMessage?: string;
  }): { id: string };
  shutdownAsync(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a Langfuse observation sink from environment variables.
 *
 * Returns `undefined` when Langfuse is disabled or misconfigured.
 * When a sink is returned, it dynamically imports the `langfuse` SDK
 * on first use and treats all failures as safe diagnostics.
 */
export async function createLangfuseSinkFromEnv(): Promise<LlmObservationSink | undefined> {
  const policy = validateLangfusePolicy(
    Object.fromEntries(
      Object.entries({
        langfuseEnabled: process.env.LANGFUSE_ENABLED,
        baseUrl: process.env.LANGFUSE_BASE_URL,
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        flushTimeoutMs: process.env.LANGFUSE_FLUSH_TIMEOUT_MS,
        serviceName: process.env.TRAPMAP_SERVICE_NAME,
        serviceVersion: process.env.npm_package_version,
        environment: process.env.NODE_ENV,
        deploymentProfile: process.env.TRAPMAP_DEPLOYMENT_PROFILE,
        release: process.env.SENTRY_RELEASE ?? process.env.npm_package_version,
        privacyMode: process.env.LANGFUSE_PRIVACY_MODE,
      }).filter(([, v]) => v !== undefined),
    ),
  );

  if (!policy.enabled) {
    return undefined;
  }

  try {
    const { Langfuse } = await import('langfuse');
    const client = new Langfuse({
      baseUrl: policy.baseUrl,
      publicKey: policy.publicKey,
      secretKey: policy.secretKey,
      flushAt: 1,
      persistence: 'memory',
    }) as unknown as LangfuseClientLike; // lib type gap: the langfuse
    // SDK client type does not structurally match the minimal local client
    // surface used by the sink adapter

    return createSinkFromClient(client, policy);
  } catch {
    // Dynamic import failure is a safe diagnostic
    return undefined;
  }
}

/**
 * Create a Langfuse observation sink from an existing client.
 * Used by LangfuseService to avoid duplicating the SDK interaction logic.
 */
export function createSinkFromClient(
  client: LangfuseClientLike,
  policy: LangfusePolicyResult,
): LlmObservationSink {
  return {
    onChatObservation(observation: ChatObservation): void {
      try {
        const metadata: Record<string, unknown> = {
          provider: observation.provider,
          operation: observation.operation,
          outcome: observation.outcome,
          latencyMs: observation.latencyMs,
          serviceName: policy.serviceName,
          environment: policy.environment,
          deploymentProfile: policy.deploymentProfile,
        };

        if (observation.traceId) metadata.traceId = observation.traceId;
        if (observation.requestId) metadata.requestId = observation.requestId;
        if (observation.operationId) metadata.operationId = observation.operationId;

        client.generation({
          name: `${observation.provider}:${observation.operation}`,
          model: observation.provider,
          metadata,
          startTime: new Date(observation.startTimestamp),
          endTime: new Date(observation.endTimestamp),
          level: observation.outcome === 'error' ? 'ERROR' : 'DEFAULT',
          ...(observation.error && { statusMessage: observation.error }),
        });
      } catch {
        // Sink failure is a safe diagnostic
      }
    },

    onEmbeddingObservation(observation: EmbeddingObservation): void {
      try {
        const metadata: Record<string, unknown> = {
          provider: observation.provider,
          operation: observation.operation,
          outcome: observation.outcome,
          latencyMs: observation.latencyMs,
          inputLength: observation.inputLength,
          outputDimensions: observation.outputDimensions,
          serviceName: policy.serviceName,
          environment: policy.environment,
          deploymentProfile: policy.deploymentProfile,
        };

        if (observation.traceId) metadata.traceId = observation.traceId;
        if (observation.requestId) metadata.requestId = observation.requestId;
        if (observation.operationId) metadata.operationId = observation.operationId;

        client.generation({
          name: `${observation.provider}:embed`,
          model: observation.provider,
          metadata,
          startTime: new Date(observation.startTimestamp),
          endTime: new Date(observation.endTimestamp),
          level: observation.outcome === 'error' ? 'ERROR' : 'DEFAULT',
          ...(observation.error && { statusMessage: observation.error }),
        });
      } catch {
        // Sink failure is a safe diagnostic
      }
    },
  };
}
