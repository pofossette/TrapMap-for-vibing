import { describe, expect, it, vi } from 'vitest';

import { runUnifiedEvaluation } from '../eval-all.js';

describe('runUnifiedEvaluation', () => {
  const baseOptions = {
    tier: 'smoke' as const,
    json: false,
    verbose: false,
    dryRun: true,
    allowEmpty: false,
  };

  it('keeps behavior unchanged when no platform adapter is enabled', async () => {
    const createAdapter = vi.fn(() => ({
      kind: 'noop',
      publish: vi.fn(),
      close: vi.fn(),
    }));

    const result = await runUnifiedEvaluation(baseOptions, {
      createPlatformAdapter: createAdapter,
      publishPlatformEvent: vi.fn(),
      closePlatformAdapter: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
      runRetrievalEval: vi.fn(async () => null),
      runSummaryEval: vi.fn(async () => null),
      runGraphExtractionEval: vi.fn(async () => null),
      runIngestionEval: vi.fn(async () => null),
      runAgentPlanningEval: vi.fn(async () => null),
      runLabelAlignmentEval: vi.fn(async () => null),
    });

    expect(result.exitCode).toBe(0);
    expect(createAdapter).not.toHaveBeenCalled();
  });

  it('keeps aggregate exit semantics unchanged when platform publish and close warn/fail', async () => {
    const publishPlatformEvent = vi.fn();
    const closePlatformAdapter = vi.fn().mockRejectedValue(new Error('close failed'));
    const warn = vi.fn();

    const result = await runUnifiedEvaluation(
      {
        ...baseOptions,
        platform: 'json-archive' as const,
        platformOutputDir: './reports/platform-events',
      },
      {
        createPlatformAdapter: vi.fn(() => ({
          kind: 'json-archive',
          publish: vi.fn(),
          close: vi.fn(),
        })),
        publishPlatformEvent,
        closePlatformAdapter,
        warn,
        log: vi.fn(),
        error: vi.fn(),
        runRetrievalEval: vi.fn(async () => ({
          passed: false,
          report: {
            meta: {
              schemaVersion: 1,
              timestamp: '2026-07-03T00:00:00.000Z',
              durationMs: 1,
              options: {
                tier: 'smoke',
                dryRun: true,
                allowEmpty: false,
                verbose: 0,
              },
            },
            summary: {
              totalCases: 1,
              passedCases: 0,
              failedCases: 1,
              passRate: 0,
              passed: false,
            },
            slices: [],
            cases: [],
            failures: [],
            warnings: [],
          },
          durationMs: 1,
          summary: {
            totalCases: 1,
            passedCases: 0,
            failedCases: 1,
            passRate: 0,
            slices: [],
          },
        })),
        runSummaryEval: vi.fn(async () => null),
        runGraphExtractionEval: vi.fn(async () => null),
        runIngestionEval: vi.fn(async () => null),
        runAgentPlanningEval: vi.fn(async () => null),
        runLabelAlignmentEval: vi.fn(async () => null),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(publishPlatformEvent).not.toHaveBeenCalled();
    expect(closePlatformAdapter).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/aggregate runner does not emit platform events/i),
    );
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('json-archive'),
      expect.objectContaining({ message: 'close failed' }),
    );
  });
});
