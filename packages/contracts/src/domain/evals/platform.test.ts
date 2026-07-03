import { describe, expect, it } from 'vitest';

import {
  evalPlatformEventSchema,
  evalPlatformRunSchema,
  evalScorePayloadSchema,
} from './platform.js';

describe('platform eval contracts', () => {
  it('accepts a suite-backed retrieval run start event with frozen payload fields', () => {
    const event = evalPlatformEventSchema.parse({
      family: 'EvalRunStarted',
      suite: 'retrieval',
      tier: 'smoke',
      runId: 'run-123',
      caseId: null,
      scenarioId: null,
      timestamp: '2026-07-03T00:00:00.000Z',
      tags: ['dry-run'],
      payload: {
        reportMeta: {
          schemaVersion: 1,
          timestamp: '2026-07-03T00:00:00.000Z',
          options: {
            tier: 'smoke',
            dryRun: true,
            allowEmpty: false,
            verbose: 0,
          },
        },
        runScope: {
          tier: 'smoke',
          dryRun: true,
          allowEmpty: false,
          endpoint: '/v1/retrieval/search',
          verbose: false,
          caseCount: 4,
          scenarioIds: ['scenario-1'],
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

  it('accepts retrieval assertion payloads that trace shape checks back to the frozen case result', () => {
    const event = evalPlatformEventSchema.parse({
      family: 'EvalAssertionRecorded',
      suite: 'retrieval',
      tier: 'smoke',
      runId: 'run-123:retrieval',
      caseId: 'v2-capsule-positive-smoke',
      scenarioId: 'retrieval-capsule-positive',
      timestamp: '2026-07-03T00:00:01.000Z',
      tags: ['capsule', 'smoke'],
      payload: {
        assertionId: 'shape',
        passed: true,
        source: 'case.passed',
      },
    });

    expect(event.payload.assertionId).toBe('shape');
  });

  it('rejects mismatched payloads for the declared event family', () => {
    expect(() =>
      evalPlatformEventSchema.parse({
        family: 'EvalRunFinished',
        suite: 'retrieval',
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

  it('rejects aggregate suite names that are not in the frozen event model', () => {
    expect(() =>
      evalPlatformEventSchema.parse({
        family: 'EvalRunStarted',
        suite: 'all',
        tier: 'smoke',
        runId: 'run-123',
        caseId: null,
        scenarioId: null,
        timestamp: '2026-07-03T00:00:00.000Z',
        tags: [],
        payload: {
          reportMeta: {
            schemaVersion: 1,
            timestamp: '2026-07-03T00:00:00.000Z',
            options: {
              tier: 'smoke',
              dryRun: true,
              allowEmpty: false,
              verbose: 0,
            },
          },
          runScope: {
            tier: 'smoke',
            dryRun: true,
            allowEmpty: false,
            endpoint: '/v1/retrieval/search',
            verbose: false,
            caseCount: 1,
            scenarioIds: ['scenario-1'],
          },
        },
      }),
    ).toThrow(/suite/i);
  });

  it('rejects extra run start payload fields outside the frozen retrieval contract', () => {
    expect(() =>
      evalPlatformEventSchema.parse({
        family: 'EvalRunStarted',
        suite: 'retrieval',
        tier: 'smoke',
        runId: 'run-123',
        caseId: null,
        scenarioId: null,
        timestamp: '2026-07-03T00:00:00.000Z',
        tags: [],
        payload: {
          reportMeta: {
            schemaVersion: 1,
            timestamp: '2026-07-03T00:00:00.000Z',
            durationMs: 10,
            options: {
              tier: 'smoke',
              dryRun: true,
              allowEmpty: false,
              verbose: 0,
            },
          },
          runScope: {
            tier: 'smoke',
            dryRun: true,
            allowEmpty: false,
            endpoint: '/v1/retrieval/search',
            verbose: false,
            caseCount: 1,
            scenarioIds: ['scenario-1'],
            platform: 'json-archive',
          },
        },
      }),
    ).toThrow(/durationMs|platform/i);
  });

  it('accepts a run envelope with retrieval event history', () => {
    const run = evalPlatformRunSchema.parse({
      runId: 'run-123',
      suite: 'retrieval',
      tier: 'smoke',
      startedAt: '2026-07-03T00:00:00.000Z',
      finishedAt: '2026-07-03T00:00:01.000Z',
      tags: ['dry-run'],
      events: [
        {
          family: 'EvalRunStarted',
          suite: 'retrieval',
          tier: 'smoke',
          runId: 'run-123',
          caseId: null,
          scenarioId: null,
          timestamp: '2026-07-03T00:00:00.000Z',
          tags: ['dry-run'],
          payload: {
            reportMeta: {
              schemaVersion: 1,
              timestamp: '2026-07-03T00:00:00.000Z',
              options: {
                tier: 'smoke',
                dryRun: true,
                allowEmpty: false,
                verbose: 0,
              },
            },
            runScope: {
              tier: 'smoke',
              dryRun: true,
              allowEmpty: false,
              endpoint: '/v1/retrieval/search',
              verbose: false,
              caseCount: 1,
              scenarioIds: ['scenario-1'],
            },
          },
        },
      ],
    });

    expect(run.events).toHaveLength(1);
    expect(run.finishedAt).toBe('2026-07-03T00:00:01.000Z');
  });
});
