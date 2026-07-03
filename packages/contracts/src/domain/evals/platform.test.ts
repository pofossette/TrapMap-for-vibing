import { describe, expect, it } from 'vitest';

import {
  evalPlatformEventSchema,
  evalPlatformRunSchema,
  evalScorePayloadSchema,
} from './platform.js';

describe('platform eval contracts', () => {
  it('accepts a run-level start event with null case and scenario ids', () => {
    const event = evalPlatformEventSchema.parse({
      family: 'EvalRunStarted',
      suite: 'all',
      tier: 'smoke',
      runId: 'run-123',
      caseId: null,
      scenarioId: null,
      timestamp: '2026-07-03T00:00:00.000Z',
      tags: ['aggregate', 'dry-run'],
      payload: {
        reportMeta: {
          schemaVersion: 1,
          timestamp: '2026-07-03T00:00:00.000Z',
          runner: 'eval-all',
        },
        runScope: {
          tier: 'smoke',
          dryRun: true,
          caseCount: 4,
        },
      },
    });

    expect(event.caseId).toBeNull();
    expect(event.payload.runScope).toMatchObject({ dryRun: true });
  });

  it('accepts score payloads with optional evaluation metadata', () => {
    const payload = evalScorePayloadSchema.parse({
      scoreId: 'hitAt1',
      score: 1,
      source: 'case.hitAt1',
      threshold: 0.8,
      rationale: 'Top hit matched expected artifact',
      weight: 0.5,
    });

    expect(payload.threshold).toBe(0.8);
    expect(payload.weight).toBe(0.5);
  });

  it('rejects mismatched payloads for the declared event family', () => {
    expect(() =>
      evalPlatformEventSchema.parse({
        family: 'EvalRunFinished',
        suite: 'all',
        tier: 'core',
        runId: 'run-123',
        caseId: null,
        scenarioId: null,
        timestamp: '2026-07-03T00:00:00.000Z',
        tags: [],
        payload: {
          scoreId: 'hitAt1',
          score: 1,
          source: 'case.hitAt1',
        },
      }),
    ).toThrow(/reportMeta/i);
  });

  it('accepts a run envelope with event history', () => {
    const run = evalPlatformRunSchema.parse({
      runId: 'run-123',
      suite: 'all',
      tier: 'smoke',
      startedAt: '2026-07-03T00:00:00.000Z',
      finishedAt: '2026-07-03T00:00:01.000Z',
      tags: ['aggregate'],
      events: [
        {
          family: 'EvalRunStarted',
          suite: 'all',
          tier: 'smoke',
          runId: 'run-123',
          caseId: null,
          scenarioId: null,
          timestamp: '2026-07-03T00:00:00.000Z',
          tags: ['aggregate'],
          payload: {
            reportMeta: {
              schemaVersion: 1,
              timestamp: '2026-07-03T00:00:00.000Z',
            },
            runScope: {
              tier: 'smoke',
              dryRun: true,
            },
          },
        },
      ],
    });

    expect(run.events).toHaveLength(1);
    expect(run.finishedAt).toBe('2026-07-03T00:00:01.000Z');
  });
});
