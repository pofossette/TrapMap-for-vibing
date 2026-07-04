import { describe, expect, it } from 'vitest';

import { buildAgentPlanningPlatformEvents } from './platform-events.js';

describe('buildAgentPlanningPlatformEvents', () => {
  it('emits run, case, score, assertion, and trace events from a report-backed case result', async () => {
    const events = await buildAgentPlanningPlatformEvents(
      {
        suiteRunId: 'run-seed:agent-planning',
        baseTags: ['dry-run'],
        report: {
          meta: {
            schemaVersion: 1,
            timestamp: '2026-07-03T00:00:10.000Z',
            durationMs: 2000,
            runner: 'agent-planning',
            options: {
              tier: 'smoke',
              dryRun: true,
              provider: 'fallback',
              promptTemplateId: 'default-agent-planning',
            },
          },
          summary: {
            totalCases: 1,
            passedCases: 1,
            failedCases: 0,
            passRate: 1,
            avgScore: 0.9,
          },
          cases: [
            {
              taskId: 'task-1',
              variantId: 'variant-1',
              variantGroupId: 'group-1',
              tier: 'smoke',
              taskType: 'debugging',
              taskComplexity: 'medium',
              contextSetKind: 'skill-set',
              interferenceLevel: 'low',
              passed: true,
              totalScore: 0.9,
              pathScore: 0.8,
              finalAnswerScore: 1,
              actorOutput: 'inspect repo\nrun tests',
              normalizedPlan: ['inspect repo', 'run tests'],
              deterministicPrecheck: {
                passed: true,
                missingRequiredSteps: [],
                missingKeyActions: [],
                forbiddenActionHits: [],
                emptyOutput: false,
                parseFailed: false,
              },
              judge: {
                totalScore: 0.9,
                pathScore: 0.8,
                finalAnswerScore: 1,
                dimensionScores: [
                  {
                    dimensionId: 'path-correctness',
                    score: 0.8,
                    rationale: 'Matched 2/2 key actions.',
                  },
                ],
                matchedKeyActions: ['inspect repo', 'run tests'],
                missingKeyActions: [],
                forbiddenActionHits: [],
                summary: 'ok',
              },
              durationMs: 333,
            },
          ],
          groups: [],
          slices: [],
        },
      },
      {
        loadCases: () => [
          {
            schemaVersion: 1,
            taskId: 'task-1',
            variantId: 'variant-1',
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
              requiredSteps: ['inspect repo', 'run tests'],
              keyActions: ['inspect repo', 'run tests'],
              allowedAlternativeActions: [],
              forbiddenActions: [],
              stepWeights: {
                'inspect repo': 0.5,
                'run tests': 0.5,
              },
            },
            judgeRubric: {
              dimensions: [
                {
                  id: 'path-correctness',
                  label: 'Path correctness',
                  weight: 1,
                  guidance: 'Use the required sequence.',
                },
              ],
            },
            expectedOutcome: {
              finalAnswer: 'run tests',
              successCriteria: ['run tests'],
            },
            tags: ['smoke', 'debugging'],
          },
        ],
        loadScenarioIds: () => ['scenario-1'],
      },
    );

    expect(events.map((event) => event.family)).toEqual([
      'EvalRunStarted',
      'EvalCaseStarted',
      'EvalCaseFinished',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalScoreRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalAssertionRecorded',
      'EvalTraceStepRecorded',
      'EvalTraceStepRecorded',
      'EvalTraceStepRecorded',
      'EvalRunFinished',
    ]);

    expect(events[0]).toMatchObject({
      family: 'EvalRunStarted',
      suite: 'agent-planning',
      runId: 'run-seed:agent-planning',
      tags: ['dry-run'],
      payload: {
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

    expect(events[2]).toMatchObject({
      family: 'EvalCaseFinished',
      caseId: 'variant-1',
      scenarioId: 'scenario-1',
      payload: {
        execution: {
          actorOutput: 'inspect repo\nrun tests',
          normalizedPlan: ['inspect repo', 'run tests'],
        },
      },
    });

    expect(
      events
        .filter((event) => event.family === 'EvalScoreRecorded')
        .map((event) => event.payload.scoreId),
    ).toEqual(['totalScore', 'pathScore', 'finalAnswerScore', 'dimension:path-correctness']);

    expect(
      events
        .filter((event) => event.family === 'EvalAssertionRecorded')
        .map((event) => event.payload.assertionId),
    ).toEqual([
      'precheck.required-steps',
      'precheck.key-actions',
      'precheck.forbidden-actions',
      'precheck.empty-output',
      'precheck.parse-failed',
      'judge.matched-key-actions',
      'judge.missing-key-actions',
      'judge.forbidden-action-hits',
    ]);

    expect(
      events
        .filter((event) => event.family === 'EvalTraceStepRecorded')
        .map((event) => [event.caseId, event.payload.kind, event.payload.text]),
    ).toEqual([
      ['variant-1', 'actor-output', 'inspect repo\nrun tests'],
      ['variant-1', 'normalized-plan-step', 'inspect repo'],
      ['variant-1', 'normalized-plan-step', 'run tests'],
    ]);
  });
});
