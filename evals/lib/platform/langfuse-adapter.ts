import { Langfuse, type LangfuseCore, type CreateLangfuseScoreBody } from 'langfuse';

import { evalPlatformEventSchema, type EvalPlatformEvent } from '@trapmap/contracts/evals';

import type { EvalPlatformAdapter, EvalPlatformAdapterConfig } from './types.js';

interface LangfuseClientLike {
  trace(body?: {
    id?: string | null;
    timestamp?: string | null;
    name?: string | null;
    sessionId?: string | null;
    metadata?: unknown;
    tags?: string[] | null;
    input?: unknown;
    output?: unknown;
  }): { id: string; update(body: Record<string, unknown>): unknown };
  span(body: {
    id?: string | null;
    traceId?: string | null;
    name?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    parentObservationId?: string | null;
    metadata?: unknown;
    input?: unknown;
    output?: unknown;
  }): {
    id: string;
    end(body?: Record<string, unknown>): unknown;
    update(body: Record<string, unknown>): unknown;
  };
  score(body: CreateLangfuseScoreBody): unknown;
  shutdownAsync(): Promise<void>;
}

interface CreateLangfuseAdapterDeps {
  clientFactory(
    config: Required<Pick<EvalPlatformAdapterConfig, 'baseUrl' | 'publicKey' | 'secretKey'>>,
  ): LangfuseClientLike;
  setTimeout: typeof globalThis.setTimeout;
  clearTimeout: typeof globalThis.clearTimeout;
}

const defaultDeps: CreateLangfuseAdapterDeps = {
  clientFactory(config) {
    return new Langfuse({
      baseUrl: config.baseUrl,
      publicKey: config.publicKey,
      secretKey: config.secretKey,
    }) as LangfuseCore as LangfuseClientLike;
  },
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
};

function requireConfig(
  config: EvalPlatformAdapterConfig,
): Required<
  Pick<EvalPlatformAdapterConfig, 'baseUrl' | 'publicKey' | 'secretKey' | 'flushTimeoutMs'>
> {
  if (!config.baseUrl || !config.publicKey || !config.secretKey) {
    throw new Error(
      'Langfuse adapter requires baseUrl, publicKey, and secretKey to be provided explicitly.',
    );
  }

  return {
    baseUrl: config.baseUrl,
    publicKey: config.publicKey,
    secretKey: config.secretKey,
    flushTimeoutMs: config.flushTimeoutMs ?? 5000,
  };
}

function getTraceName(event: EvalPlatformEvent): string {
  return `trapmap-eval:${event.suite}`;
}

function getCaseObservationId(event: EvalPlatformEvent): string {
  return `${event.runId}:${event.caseId}`;
}

function getTraceStepObservationId(event: EvalPlatformEvent): string {
  return `${event.runId}:${event.caseId}:trace:${event.payload.stepIndex}`;
}

function toScoreValue(passed: boolean): 0 | 1 {
  return passed ? 1 : 0;
}

function createScoreBody(event: EvalPlatformEvent): CreateLangfuseScoreBody | null {
  if (!event.caseId) {
    return null;
  }

  if (event.family === 'EvalScoreRecorded') {
    return {
      traceId: event.runId,
      observationId: getCaseObservationId(event),
      name: event.payload.scoreId,
      value: event.payload.score,
      comment: event.payload.rationale,
      metadata: {
        suite: event.suite,
        tier: event.tier,
        source: event.payload.source,
        tags: event.tags,
        scenarioId: event.scenarioId,
      },
    };
  }

  if (event.family === 'EvalAssertionRecorded') {
    return {
      traceId: event.runId,
      observationId: getCaseObservationId(event),
      name: event.payload.assertionId,
      value: toScoreValue(event.payload.passed),
      dataType: 'BOOLEAN',
      comment:
        typeof event.payload.reason === 'string'
          ? event.payload.reason
          : `source=${event.payload.source}`,
      metadata: {
        suite: event.suite,
        tier: event.tier,
        source: event.payload.source,
        expected: event.payload.expected,
        actual: event.payload.actual,
        severity: event.payload.severity,
        tags: event.tags,
        scenarioId: event.scenarioId,
      },
    };
  }

  return null;
}

async function shutdownWithTimeout(
  client: LangfuseClientLike,
  flushTimeoutMs: number,
  deps: Pick<CreateLangfuseAdapterDeps, 'setTimeout' | 'clearTimeout'>,
): Promise<void> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  try {
    await Promise.race([
      client.shutdownAsync(),
      new Promise<never>((_, reject) => {
        timeoutId = deps.setTimeout(() => {
          reject(
            new Error(
              `Langfuse adapter flush timeout exceeded ${flushTimeoutMs}ms while shutting down.`,
            ),
          );
        }, flushTimeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) {
      deps.clearTimeout(timeoutId);
    }
  }
}

export function createLangfuseAdapter(
  config: EvalPlatformAdapterConfig,
  deps: Partial<CreateLangfuseAdapterDeps> = {},
): EvalPlatformAdapter {
  const resolvedConfig = requireConfig(config);
  const resolvedDeps = { ...defaultDeps, ...deps };
  const client = resolvedDeps.clientFactory(resolvedConfig);
  const traceIds = new Set<string>();
  const caseIds = new Set<string>();

  return {
    kind: 'langfuse',
    async publish(eventInput) {
      const event = evalPlatformEventSchema.parse(eventInput);

      if (!traceIds.has(event.runId)) {
        client.trace({
          id: event.runId,
          timestamp: event.timestamp,
          sessionId: event.runId,
          name: getTraceName(event),
          metadata: {
            suite: event.suite,
            tier: event.tier,
            scenarioId: event.scenarioId,
          },
          tags: event.tags,
        });
        traceIds.add(event.runId);
      }

      if (event.family === 'EvalRunStarted') {
        client.trace({
          id: event.runId,
          timestamp: event.timestamp,
          sessionId: event.runId,
          name: getTraceName(event),
          input: event.payload.runScope,
          metadata: {
            suite: event.suite,
            tier: event.tier,
            reportMeta: event.payload.reportMeta,
            tags: event.tags,
          },
          tags: event.tags,
        });
        return;
      }

      if (event.family === 'EvalRunFinished') {
        client.trace({
          id: event.runId,
          timestamp: event.timestamp,
          sessionId: event.runId,
          name: getTraceName(event),
          output: event.payload.reportSummary,
          metadata: {
            suite: event.suite,
            tier: event.tier,
            reportMeta: event.payload.reportMeta,
            reportCollections: event.payload.reportCollections,
            tags: event.tags,
          },
          tags: event.tags,
        });
        return;
      }

      if (
        event.caseId &&
        event.family === 'EvalCaseStarted' &&
        !caseIds.has(getCaseObservationId(event))
      ) {
        client.span({
          id: getCaseObservationId(event),
          traceId: event.runId,
          name: `eval-case:${event.caseId}`,
          startTime: event.timestamp,
          input: event.payload.case,
          metadata: {
            suite: event.suite,
            tier: event.tier,
            scenarioId: event.scenarioId,
            tags: event.tags,
          },
        });
        caseIds.add(getCaseObservationId(event));
        return;
      }

      if (event.caseId && event.family === 'EvalCaseFinished') {
        client.span({
          id: getCaseObservationId(event),
          traceId: event.runId,
          name: `eval-case:${event.caseId}`,
          endTime: event.timestamp,
          output: event.payload.result,
          metadata: {
            suite: event.suite,
            tier: event.tier,
            scenarioId: event.scenarioId,
            execution: event.payload.execution,
            tags: event.tags,
          },
        });
        caseIds.add(getCaseObservationId(event));
        return;
      }

      const scoreBody = createScoreBody(event);
      if (scoreBody) {
        client.score(scoreBody);
        return;
      }

      if (event.caseId && event.family === 'EvalTraceStepRecorded') {
        client.span({
          id: getTraceStepObservationId(event),
          traceId: event.runId,
          parentObservationId: getCaseObservationId(event),
          name: `eval-trace-step:${event.payload.kind}`,
          startTime: event.timestamp,
          endTime: event.timestamp,
          input: {
            text: event.payload.text,
          },
          metadata: {
            suite: event.suite,
            tier: event.tier,
            scenarioId: event.scenarioId,
            source: event.payload.source,
            stepIndex: event.payload.stepIndex,
            tags: event.tags,
          },
        });
      }
    },
    async close() {
      await shutdownWithTimeout(client, resolvedConfig.flushTimeoutMs, resolvedDeps);
    },
  };
}
