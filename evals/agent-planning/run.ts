import {
  type AgentPlanningCaseResult,
  type AgentPlanningEvalCase,
  type AgentPlanningEvalReport,
  type AgentPlanningEvalScenario,
  type AgentPlanningEvalTier,
  agentPlanningEvalCaseSchema,
  agentPlanningEvalScenarioSchema,
} from '@trapmap/contracts/evals';

import { coreCases, coreScenariosMap } from './core.js';
import { skillIdentificationCoreCases } from './datasets/core/skill-identification-core.js';
import { skillIdentificationSmokeCases } from './datasets/smoke/skill-identification-smoke.js';
import { runActor } from './lib/actor-runner.js';
import { renderScenarioContext } from './lib/context-renderer.js';
import { formatReport } from './lib/format.js';
import { runJudge } from './lib/judge-runner.js';
import { normalizeActorOutput } from './lib/normalizer.js';
import { loadPromptTemplate, renderPromptTemplate } from './lib/prompt-loader.js';
import { buildAgentPlanningReport } from './lib/report.js';
import { getAgentPlanningEvaluationCases } from './lib/runner-api.js';
import { evaluateDeterministicPrecheck } from './lib/scoring.js';
import { skillIdentificationCoreScenarios } from './scenarios/core/skill-identification-core-scenarios.js';
import { skillIdentificationSmokeScenarios } from './scenarios/smoke/skill-identification-smoke-scenarios.js';
import { smokeCases, smokeScenariosMap } from './smoke.js';

export interface AgentPlanningRunOptions {
  tier: AgentPlanningEvalTier;
  dryRun: boolean;
  provider: 'fallback' | 'openai';
  promptTemplateId?: string;
  promptTemplatePath?: string;
  runner?: 'native' | 'promptfoo';
}

export interface AgentPlanningResolvedOptions {
  tier: AgentPlanningEvalTier;
  dryRun: boolean;
  provider: 'fallback' | 'openai';
  promptTemplateId: string;
  promptTemplatePath?: string;
  runner: 'native' | 'promptfoo';
}

export function resolveAgentPlanningOptions(
  rawOptions: AgentPlanningRunOptions,
): AgentPlanningResolvedOptions {
  return {
    tier: rawOptions.tier,
    dryRun: rawOptions.dryRun,
    provider: rawOptions.provider,
    promptTemplateId: rawOptions.promptTemplateId ?? 'default-agent-planning',
    runner: rawOptions.runner ?? 'native',
    ...(rawOptions.promptTemplatePath !== undefined
      ? { promptTemplatePath: rawOptions.promptTemplatePath }
      : {}),
  };
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

function loadCases(tier: AgentPlanningEvalTier): AgentPlanningEvalCase[] {
  return getAgentPlanningEvaluationCases(tier).map((caseDefinition) =>
    agentPlanningEvalCaseSchema.parse(caseDefinition),
  );
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

export async function runAgentPlanningEval(
  rawOptions: AgentPlanningRunOptions,
): Promise<AgentPlanningEvalReport> {
  const options = resolveAgentPlanningOptions(rawOptions);

  if (options.runner === 'promptfoo') {
    const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
    const { agentPlanningBridge } = await import('./bridge.js');
    const { report } = await runSuiteWithPromptfoo(agentPlanningBridge, {
      tier: options.tier,
      dryRun: options.dryRun,
      allowEmpty: false,
      runner: 'promptfoo',
      provider: options.provider,
      promptTemplateId: options.promptTemplateId,
      ...(options.promptTemplatePath !== undefined
        ? { promptTemplatePath: options.promptTemplatePath }
        : {}),
    });
    return report;
  }

  const startedAt = Date.now();
  const cases = loadCases(options.tier);
  const caseResults: AgentPlanningCaseResult[] = [];

  for (const caseDefinition of cases) {
    const scenario = loadScenario(options.tier, caseDefinition.scenarioId);
    caseResults.push(await executeCase(caseDefinition, scenario, options));
  }

  return buildAgentPlanningReport(
    caseResults,
    {
      tier: options.tier,
      dryRun: options.dryRun,
      provider: options.provider,
      promptTemplateId: options.promptTemplateId,
    },
    Date.now() - startedAt,
  );
}

function parseCliArgs(argv: string[]): AgentPlanningResolvedOptions {
  const args = new Set(argv);
  const tier = args.has('--tier')
    ? (argv[argv.indexOf('--tier') + 1] as AgentPlanningEvalTier)
    : 'smoke';
  const provider = args.has('--provider')
    ? (argv[argv.indexOf('--provider') + 1] as 'fallback' | 'openai')
    : 'fallback';
  const runnerValue = args.has('--runner') ? argv[argv.indexOf('--runner') + 1] : 'native';
  if (runnerValue !== 'native' && runnerValue !== 'promptfoo') {
    throw new Error(`Invalid --runner value: ${runnerValue}`);
  }
  const runner = runnerValue as 'native' | 'promptfoo';
  const promptTemplatePath = args.has('--prompt-template-path')
    ? argv[argv.indexOf('--prompt-template-path') + 1]
    : undefined;

  return {
    tier,
    dryRun: args.has('--dry-run'),
    provider,
    runner,
    promptTemplateId: args.has('--prompt-template-id')
      ? argv[argv.indexOf('--prompt-template-id') + 1]
      : 'default-agent-planning',
    ...(promptTemplatePath !== undefined ? { promptTemplatePath } : {}),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseCliArgs(process.argv.slice(2));

  runAgentPlanningEval(options)
    .then((report) => {
      console.log(formatReport(report));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
