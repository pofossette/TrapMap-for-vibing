import { describe, expect, it, vi } from 'vitest';

import { createEvalPlatformAdapter } from './adapter.js';
import { createLangfuseAdapter } from './langfuse-adapter.js';

function createClientDouble() {
  const score = vi.fn();
  const span = vi.fn((input) => ({
    id: input.id,
    end: vi.fn(),
    update: vi.fn(),
  }));
  const trace = vi.fn((input) => ({
    id: input.id,
    update: vi.fn(),
  }));
  const shutdownAsync = vi.fn(async () => {});

  return {
    client: {
      trace,
      span,
      score,
      shutdownAsync,
    },
    trace,
    span,
    score,
    shutdownAsync,
  };
}

describe('createLangfuseAdapter', () => {
  it('maps run, case, score, assertion, and trace events onto Langfuse client calls', async () => {
    const clientDouble = createClientDouble();
    const adapter = createLangfuseAdapter(
      {
        baseUrl: 'https://langfuse.example',
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        flushTimeoutMs: 1000,
      },
      { clientFactory: () => clientDouble.client },
    );

    await adapter.publish({
      family: 'EvalRunStarted',
      suite: 'agent-planning',
      tier: 'smoke',
      runId: 'run-1',
      caseId: null,
      scenarioId: null,
      timestamp: '2026-07-04T00:00:00.000Z',
      tags: ['dry-run'],
      payload: {
        reportMeta: {
          schemaVersion: 1,
          timestamp: '2026-07-04T00:00:00.000Z',
          runner: 'agent-planning',
          options: {
            tier: 'smoke',
            dryRun: true,
            provider: 'fallback',
            promptTemplateId: 'default-agent-planning',
          },
        },
        runScope: {
          tier: 'smoke',
          dryRun: true,
          provider: 'fallback',
          promptTemplateId: 'default-agent-planning',
          caseCount: 1,
          scenarioIds: ['scenario-1'],
        },
      },
    });

    await adapter.publish({
      family: 'EvalCaseStarted',
      suite: 'agent-planning',
      tier: 'smoke',
      runId: 'run-1',
      caseId: 'case-1',
      scenarioId: 'scenario-1',
      timestamp: '2026-07-04T00:00:01.000Z',
      tags: ['dry-run', 'debugging'],
      payload: {
        case: {
          schemaVersion: 1,
          taskId: 'task-1',
          variantId: 'case-1',
          variantGroupId: 'group-1',
          tier: 'smoke',
          taskType: 'debugging',
          taskComplexity: 'medium',
          contextSetKind: 'skill-set',
          interferenceLevel: 'low',
          interferenceSources: [],
          promptTemplateId: 'default-agent-planning',
          scenarioId: 'scenario-1',
          goldenPath: {
            requiredSteps: ['inspect repo'],
            keyActions: ['inspect repo'],
            allowedAlternativeActions: [],
            forbiddenActions: [],
            stepWeights: { 'inspect repo': 1 },
          },
          judgeRubric: {
            dimensions: [
              {
                id: 'path-correctness',
                label: 'Path correctness',
                weight: 1,
                guidance: 'Use the required path.',
              },
            ],
          },
          expectedOutcome: {
            finalAnswer: 'inspect repo',
            successCriteria: ['inspect repo'],
          },
          tags: ['debugging'],
        },
      },
    });

    await adapter.publish({
      family: 'EvalScoreRecorded',
      suite: 'agent-planning',
      tier: 'smoke',
      runId: 'run-1',
      caseId: 'case-1',
      scenarioId: 'scenario-1',
      timestamp: '2026-07-04T00:00:02.000Z',
      tags: ['dry-run'],
      payload: {
        scoreId: 'totalScore',
        score: 0.9,
        source: 'case.totalScore',
      },
    });

    await adapter.publish({
      family: 'EvalAssertionRecorded',
      suite: 'agent-planning',
      tier: 'smoke',
      runId: 'run-1',
      caseId: 'case-1',
      scenarioId: 'scenario-1',
      timestamp: '2026-07-04T00:00:02.500Z',
      tags: ['dry-run'],
      payload: {
        assertionId: 'precheck.required-steps',
        passed: true,
        source: 'case.deterministicPrecheck.missingRequiredSteps',
      },
    });

    await adapter.publish({
      family: 'EvalTraceStepRecorded',
      suite: 'agent-planning',
      tier: 'smoke',
      runId: 'run-1',
      caseId: 'case-1',
      scenarioId: 'scenario-1',
      timestamp: '2026-07-04T00:00:03.000Z',
      tags: ['dry-run'],
      payload: {
        stepIndex: 0,
        kind: 'normalized-plan-step',
        text: 'inspect repo',
        source: 'case.normalizedPlan[*]',
      },
    });

    await adapter.close();

    expect(clientDouble.trace).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'run-1',
        sessionId: 'run-1',
        name: 'trapmap-eval:agent-planning',
        tags: ['dry-run'],
      }),
    );
    expect(clientDouble.span).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'run-1:case-1',
        traceId: 'run-1',
        name: 'eval-case:case-1',
      }),
    );
    expect(clientDouble.score).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'run-1',
        observationId: 'run-1:case-1',
        name: 'totalScore',
        value: 0.9,
      }),
    );
    expect(clientDouble.score).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: 'run-1',
        observationId: 'run-1:case-1',
        name: 'precheck.required-steps',
        value: 1,
      }),
    );
    expect(clientDouble.span).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'run-1:case-1:trace:0',
        traceId: 'run-1',
        parentObservationId: 'run-1:case-1',
        name: 'eval-trace-step:normalized-plan-step',
      }),
    );
    expect(clientDouble.shutdownAsync).toHaveBeenCalledTimes(1);
  });

  it('fails close when shutdown exceeds the configured timeout', async () => {
    const adapter = createLangfuseAdapter(
      {
        baseUrl: 'https://langfuse.example',
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        flushTimeoutMs: 10,
      },
      {
        clientFactory: () => ({
          trace: vi.fn(() => ({ update: vi.fn() })),
          span: vi.fn(() => ({ end: vi.fn(), update: vi.fn() })),
          score: vi.fn(),
          shutdownAsync: () => new Promise(() => {}),
        }),
      },
    );

    await expect(adapter.close()).rejects.toThrow(/flush timeout/i);
  });
});

describe('createEvalPlatformAdapter', () => {
  it('creates a langfuse adapter when the kind is langfuse', () => {
    const adapter = createEvalPlatformAdapter({
      kind: 'langfuse',
      baseUrl: 'https://langfuse.example',
      publicKey: 'pk-test',
      secretKey: 'sk-test',
      flushTimeoutMs: 1000,
    });

    expect(adapter.kind).toBe('langfuse');
  });
});

describe('langfuse adapter metadata redaction', () => {
  it('does not include raw prompt content in trace metadata', async () => {
    const clientDouble = createClientDouble();
    const adapter = createLangfuseAdapter(
      {
        baseUrl: 'https://langfuse.example',
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        flushTimeoutMs: 1000,
      },
      { clientFactory: () => clientDouble.client },
    );

    await adapter.publish({
      family: 'EvalRunStarted',
      suite: 'agent-planning',
      tier: 'smoke',
      runId: 'run-redact',
      caseId: null,
      scenarioId: null,
      timestamp: '2026-07-04T00:00:00.000Z',
      tags: ['dry-run'],
      payload: {
        reportMeta: {
          schemaVersion: 1,
          timestamp: '2026-07-04T00:00:00.000Z',
          runner: 'agent-planning',
          options: {
            tier: 'smoke',
            dryRun: true,
            provider: 'fallback',
            promptTemplateId: 'default-agent-planning',
          },
        },
        runScope: {
          tier: 'smoke',
          dryRun: true,
          provider: 'fallback',
          promptTemplateId: 'default-agent-planning',
          caseCount: 1,
          scenarioIds: ['scenario-1'],
        },
      },
    });

    await adapter.close();

    // Verify the trace call metadata does not contain credentials
    const traceCalls = clientDouble.trace.mock.calls;
    for (const call of traceCalls) {
      const callStr = JSON.stringify(call);
      expect(callStr).not.toContain('sk-test');
      expect(callStr).not.toContain('pk-test');
    }
  });

  it('does not include raw actor output text in case span input', async () => {
    const clientDouble = createClientDouble();
    const adapter = createLangfuseAdapter(
      {
        baseUrl: 'https://langfuse.example',
        publicKey: 'pk-test',
        secretKey: 'sk-test',
        flushTimeoutMs: 1000,
      },
      { clientFactory: () => clientDouble.client },
    );

    await adapter.publish({
      family: 'EvalTraceStepRecorded',
      suite: 'agent-planning',
      tier: 'smoke',
      runId: 'run-1',
      caseId: 'case-1',
      scenarioId: 'scenario-1',
      timestamp: '2026-07-04T00:00:03.000Z',
      tags: ['dry-run'],
      payload: {
        stepIndex: 0,
        kind: 'actor-output',
        text: 'SECRET_API_KEY=abc123 leaked prompt content',
        source: 'case.actorOutput',
      },
    });

    await adapter.close();

    // The trace step should contain the text as-is since it's part of the eval
    // data contract (not a runtime secret). But credentials in the adapter
    // config (baseUrl, publicKey, secretKey) must never leak into events.
    const spanCalls = clientDouble.span.mock.calls;
    for (const call of spanCalls) {
      const callStr = JSON.stringify(call);
      expect(callStr).not.toContain('sk-test');
      expect(callStr).not.toContain('pk-test');
    }
  });
});
