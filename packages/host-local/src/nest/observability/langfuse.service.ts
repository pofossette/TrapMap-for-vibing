/**
 * Optional Langfuse observation sink for host-local.
 *
 * This module is a zero-dependency adapter that:
 * - Only initializes the Langfuse SDK when a valid policy is produced by
 *   {@link validateLangfusePolicy} with `enabled: true`
 * - Dynamically imports `langfuse` to avoid hard dependency
 * - Implements {@link LlmObservationSink} to receive vendor-neutral
 *   observation metadata from the ai-providers wrapper
 * - Strips all sensitive data: raw prompts, outputs, embedding vectors,
 *   request bodies, credentials, and dynamic IDs never reach Langfuse
 * - Treats sink/flush failure as a safe diagnostic, not a host failure
 * - Correlates observations to OTel trace/request/operation IDs
 *
 * The Langfuse SDK is dynamically imported so the module has no hard
 * dependency on `langfuse` at the package level.
 */

import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import type { LangfusePolicyResult } from '@trapmap/contracts';
import { validateLangfusePolicy } from '@trapmap/contracts';
import type {
  ChatObservation,
  EmbeddingObservation,
  LlmObservationSink,
} from '@trapmap/ai-providers';

import { createSinkFromClient, type LangfuseClientLike } from './langfuse-sink.js';

// ---------------------------------------------------------------------------
// LangfuseService
// ---------------------------------------------------------------------------

@Injectable()
export class LangfuseService implements LlmObservationSink, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LangfuseService.name);
  private client: LangfuseClientLike | null = null;
  private sink: LlmObservationSink | null = null;
  private readonly policy: LangfusePolicyResult;

  constructor() {
    this.policy = validateLangfusePolicy({
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
    });
  }

  async onModuleInit(): Promise<void> {
    if (!this.policy.enabled) {
      this.logger.log(`Langfuse observation disabled: ${this.policy.reason}`);
      return;
    }

    try {
      const { Langfuse } = await import('langfuse');

      this.client = new Langfuse({
        baseUrl: this.policy.baseUrl,
        publicKey: this.policy.publicKey,
        secretKey: this.policy.secretKey,
        flushAt: 1,
        persistence: 'memory',
      }) as unknown as LangfuseClientLike;

      this.sink = createSinkFromClient(this.client, this.policy);

      this.logger.log(
        `Langfuse observation initialized: environment=${this.policy.environment}, ` +
          `deploymentProfile=${this.policy.deploymentProfile}, ` +
          `privacyMode=${this.policy.privacyMode}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initialize Langfuse SDK: ${message}`);
      // Transport failure must not affect the host
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.client.shutdownAsync(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new Error(
                `Langfuse flush timeout exceeded ${this.policy.flushTimeoutMs}ms during shutdown`,
              ),
            );
          }, this.policy.flushTimeoutMs);
        }),
      ]);
      this.logger.log('Langfuse SDK shut down');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Langfuse shutdown error: ${message}`);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Emit a chat observation to Langfuse.
   *
   * Only approved metadata is sent. Raw prompts, outputs, credentials,
   * and dynamic IDs are never included.
   */
  onChatObservation(observation: ChatObservation): void {
    this.sink?.onChatObservation(observation);
  }

  /**
   * Emit an embedding observation to Langfuse.
   *
   * Only approved metadata is sent. Raw text, embedding vectors,
   * credentials, and dynamic IDs are never included.
   */
  onEmbeddingObservation(observation: EmbeddingObservation): void {
    this.sink?.onEmbeddingObservation(observation);
  }

  /**
   * Get the current Langfuse policy (for diagnostics).
   */
  getPolicy(): LangfusePolicyResult {
    return this.policy;
  }
}
