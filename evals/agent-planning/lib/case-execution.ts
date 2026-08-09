/**
 * Agent-planning per-case evaluation pipeline.
 *
 * Extracted from run.ts so the agent-planning SuiteBridge can reuse the
 * scenario loading and case execution pipeline without importing the runner
 * entrypoint, which would create a circular dependency with the bridge.
 */

import {
  type AgentPlanningCaseResult,
  type AgentPlanningEvalCase,
  type AgentPlanningEvalScenario,
  type AgentPlanningEvalTier,
  agentPlanningEvalScenarioSchema,
} from '@trapmap/contracts/evals';

import { coreScenariosMap } from '../core.js';
import { skillIdentificationCoreScenarios } from '../scenarios/core/skill-identification-core-scenarios.js';
import { skillIdentificationSmokeScenarios } from '../scenarios/smoke/skill-identification-smoke-scenarios.js';
import { smokeScenariosMap } from '../smoke.js';
import { runActor } from './actor-runner.js';
import { renderScenarioContext } from './context-renderer.js';
import { runJudge } from './judge-runner.js';
import { normalizeActorOutput } from './normalizer.js';
import { loadPromptTemplate, renderPromptTemplate } from './prompt-loader.js';
import { evaluateDeterministicPrecheck } from './scoring.js';

export interface AgentPlanningResolvedOptions {
  tier: AgentPlanningEvalTier;
  dryRun: boolean;
  provider: 'fallback' | 'openai';
  promptTemplateId: string;
  promptTemplatePath?: string;
  runner: 'native' | 'promptfoo';
}

// Build merged scenario maps for skill identification
const smokeSidScenariosMap: Record<string, AgentPlanningEvalScenario> = {};
for (const s of skillIdentificationSmokeScenarios) {
  smokeSidScenariosMap[s.scenarioId] = s;
}
const coreSidScenariosMap: Record<string, AgentPlanningEvalScenario> = {};
for (const s of skillIdentificationCoreScenarios) {
  coreSidScenariosMap[s.scenarioId] = s;
}

export function loadScenario(
  tier: AgentPlanningEvalTier,
  scenarioId: string,
): AgentPlanningEvalScenario {
  const baseMap = tier === 'smoke' ? smokeScenariosMap : coreScenariosMap;
  const sidMap = tier === 'smoke' ? smokeSidScenariosMap : coreSidScenariosMap;
  const scenario = baseMap[scenarioId] ?? sidMap[scenarioId];

  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  return agentPlanningEvalScenarioSchema.parse(scenario);
}

export async function executeCase(
  caseDefinition: AgentPlanningEvalCase,
  scenario: AgentPlanningEvalScenario,
  options: AgentPlanningResolvedOptions,
): Promise<AgentPlanningCaseResult> {
  const start = Date.now();
  const context = renderScenarioContext(caseDefinition, scenario);
  const promptTemplate = loadPromptTemplate({
    promptTemplateId: options.promptTemplateId,
    ...(options.promptTemplatePath !== undefined
      ? { promptTemplatePath: options.promptTemplatePath }
      : {}),
  });
  const prompt = renderPromptTemplate(promptTemplate, {
    taskPrompt: scenario.taskPrompt,
    context,
  });
  const actorResult = await runActor(caseDefinition, scenario, {
    dryRun: options.dryRun,
    provider: options.provider,
    prompt,
  });
  const normalized = normalizeActorOutput(actorResult.actorOutput);
  const deterministicPrecheck = evaluateDeterministicPrecheck({
    normalizedPlan: normalized.normalizedPlan,
    actorOutput: actorResult.actorOutput,
    caseDefinition,
    parseFailed: normalized.parseFailed,
    emptyOutput: normalized.emptyOutput,
  });
  const judge = runJudge({
    caseDefinition,
    actorOutput: actorResult.actorOutput,
    deterministicPrecheck,
  });

  return {
    taskId: caseDefinition.taskId,
    variantId: caseDefinition.variantId,
    variantGroupId: caseDefinition.variantGroupId,
    tier: caseDefinition.tier,
    taskType: caseDefinition.taskType,
    taskComplexity: caseDefinition.taskComplexity,
    contextSetKind: caseDefinition.contextSetKind,
    interferenceLevel: caseDefinition.interferenceLevel,
    passed: deterministicPrecheck.passed && judge.totalScore >= 0.7,
    totalScore: judge.totalScore,
    pathScore: judge.pathScore,
    finalAnswerScore: judge.finalAnswerScore,
    actorOutput: actorResult.actorOutput,
    normalizedPlan: normalized.normalizedPlan,
    deterministicPrecheck,
    judge,
    durationMs: Date.now() - start,
    matchStrategy: caseDefinition.matchStrategy,
    sourceQualityMix: caseDefinition.sourceQualityMix,
  };
}
