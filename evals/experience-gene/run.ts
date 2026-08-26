import { coreCases } from './datasets/core.js';
import { smokeCases } from './datasets/smoke.js';
import { evaluateExperienceGeneSuite } from './lib/runner.js';
import type { ExperienceGeneEvalMode, ExperienceGeneEvalTier } from './types.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const tier = (argument('--tier') ?? 'smoke') as ExperienceGeneEvalTier;
const mode = (argument('--mode') ?? 'shadow') as ExperienceGeneEvalMode;
if (tier !== 'smoke' && tier !== 'core') throw new Error('tier must be smoke or core');
if (mode !== 'baseline' && mode !== 'shadow' && mode !== 'serve') {
  throw new Error('mode must be baseline, shadow, or serve');
}

const report = evaluateExperienceGeneSuite(tier === 'core' ? coreCases : smokeCases, mode);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.promotionEligible && tier === 'core' && mode === 'serve') process.exitCode = 1;
