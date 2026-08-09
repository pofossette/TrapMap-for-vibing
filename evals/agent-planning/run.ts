import type { AgentPlanningEvalReport, AgentPlanningEvalTier } from '@trapmap/contracts/evals';

import type { AgentPlanningResolvedOptions } from './lib/case-execution.js';
import { formatReport } from './lib/format.js';

// Re-export the case evaluation surface so the runner entrypoint keeps its
// public API without owning the evaluation logic.
export {
  executeCase,
  loadScenario,
  type AgentPlanningResolvedOptions,
} from './lib/case-execution.js';

export interface AgentPlanningRunOptions {
  tier: AgentPlanningEvalTier;
  dryRun: boolean;
  provider: 'fallback' | 'openai';
  promptTemplateId?: string;
  promptTemplatePath?: string;
  runner?: 'native' | 'promptfoo';
}

export function resolveAgentPlanningOptions(
  rawOptions: AgentPlanningRunOptions,
): AgentPlanningResolvedOptions {
  return {
    tier: rawOptions.tier,
    dryRun: rawOptions.dryRun,
    provider: rawOptions.provider,
    promptTemplateId: rawOptions.promptTemplateId ?? 'default-agent-planning',
    runner: rawOptions.runner ?? 'promptfoo',
    ...(rawOptions.promptTemplatePath !== undefined
      ? { promptTemplatePath: rawOptions.promptTemplatePath }
      : {}),
  };
}

export async function runAgentPlanningEval(
  rawOptions: AgentPlanningRunOptions,
): Promise<AgentPlanningEvalReport> {
  const options = resolveAgentPlanningOptions(rawOptions);

  // The promptfoo bridge is the only engine; it executes the same native
  // per-case pipeline (actor → normalize → deterministic precheck → judge)
  // under the hood via its provider executor.
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

function parseCliArgs(argv: string[]): AgentPlanningResolvedOptions {
  const args = new Set(argv);
  const tier = args.has('--tier')
    ? (argv[argv.indexOf('--tier') + 1] as AgentPlanningEvalTier)
    : 'smoke';
  const provider = args.has('--provider')
    ? (argv[argv.indexOf('--provider') + 1] as 'fallback' | 'openai')
    : 'fallback';
  const runnerValue = args.has('--runner') ? argv[argv.indexOf('--runner') + 1] : 'promptfoo';
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
