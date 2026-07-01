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
import { runActor } from './lib/actor-runner.js';
import { renderScenarioContext } from './lib/context-renderer.js';
import { formatReport } from './lib/format.js';
import { runJudge } from './lib/judge-runner.js';
import { normalizeActorOutput } from './lib/normalizer.js';
import { loadPromptTemplate, renderPromptTemplate } from './lib/prompt-loader.js';
import { buildAgentPlanningReport } from './lib/report.js';
import { evaluateDeterministicPrecheck } from './lib/scoring.js';
import { smokeCases, smokeScenariosMap } from './smoke.js';
import { skillIdentificationCoreCases } from './datasets/core/skill-identification-core.js';
import { skillIdentificationCoreScenarios } from './scenarios/core/skill-identification-core-scenarios.js';
import { skillIdentificationSmokeCases } from './datasets/smoke/skill-identification-smoke.js';
import { skillIdentificationSmokeScenarios } from './scenarios/smoke/skill-identification-smoke-scenarios.js';

export interface AgentPlanningRunOptions {
  tier: AgentPlanningEvalTier;
  dryRun: boolean;
  provider: 'fallback' | 'openai';
  promptTemplateId?: string;
  promptTemplatePath?: string;
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
  const base = tier === 'smoke' ? smokeCases : coreCases;
  const sidCases = tier === 'smoke' ? skillIdentificationSmokeCases : skillIdentificationCoreCases;
  const cases = [...base, ...sidCases];
  return cases.map((caseDefinition) => agentPlanningEvalCaseSchema.parse(caseDefinition));
}

function loadScenario(tier: AgentPlanningEvalTier, scenarioId: string): AgentPlanningEvalScenario {
  const baseMap = tier === 'smoke' ? smokeScenariosMap : coreScenariosMap;
  const sidMap = tier === 'smoke' ? smokeSidScenariosMap : coreSidScenariosMap;
  const scenario = baseMap[scenarioId] ?? sidMap[scenarioId];

  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  return agentPlanningEvalScenarioSchema.parse(scenario);
}

async function executeCase(
  caseDefinition: AgentPlanningEvalCase,
  scenario: AgentPlanningEvalScenario,
  options: Required<AgentPlanningRunOptions>,
): Promise<AgentPlanningCaseResult> {
  const start = Date.now();
  const context = renderScenarioContext(caseDefinition, scenario);
  const promptTemplate = loadPromptTemplate({
    promptTemplateId: options.promptTemplateId,
    promptTemplatePath: options.promptTemplatePath,
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
  const options: Required<AgentPlanningRunOptions> = {
    promptTemplateId: rawOptions.promptTemplateId ?? 'default-agent-planning',
    promptTemplatePath: rawOptions.promptTemplatePath,
    tier: rawOptions.tier,
    dryRun: rawOptions.dryRun,
    provider: rawOptions.provider,
  };
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

function parseCliArgs(argv: string[]): Required<AgentPlanningRunOptions> {
  const args = new Set(argv);
  const tier = args.has('--tier')
    ? (argv[argv.indexOf('--tier') + 1] as AgentPlanningEvalTier)
    : 'smoke';
  const provider = args.has('--provider')
    ? (argv[argv.indexOf('--provider') + 1] as 'fallback' | 'openai')
    : 'fallback';
  const promptTemplatePath = args.has('--prompt-template-path')
    ? argv[argv.indexOf('--prompt-template-path') + 1]
    : undefined;

  return {
    tier,
    dryRun: args.has('--dry-run'),
    provider,
    promptTemplateId: args.has('--prompt-template-id')
      ? argv[argv.indexOf('--prompt-template-id') + 1]
      : 'default-agent-planning',
    promptTemplatePath,
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
