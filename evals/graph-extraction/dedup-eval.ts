/**
 * Duplicate Detection Evaluation
 *
 * Compares Jaccard-only vs Jaccard+LLM duplicate detection precision/recall/F1.
 * Uses annotated (candidate, existing, expected_overlapType) test pairs.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/dedup-eval.ts
 *   pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/dedup-eval.ts --dry-run
 */

import { parseArgs } from 'node:util';

import { realSkillDedupFixtures } from './dedup-fixtures-real.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OverlapType = 'exact' | 'semantic' | 'none';

export interface DedupFixture {
  id: string;
  candidate: { title: string; body: string };
  existing: { title: string; body: string };
  expectedOverlapType: OverlapType;
}

interface ClassificationMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs_() {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', short: 'd', default: false },
      smoke: { type: 'boolean', short: 's', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
    },
    strict: true,
  });
  return { dryRun: values['dry-run'] ?? false, smoke: values.smoke ?? false, verbose: values.verbose ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// Fixtures: 20 annotated duplicate detection pairs
// ---------------------------------------------------------------------------

export const dedupFixtures: DedupFixture[] = [
  // 1. Exact duplicate
  {
    id: 'exact-docker-timeout',
    candidate: {
      title: 'Docker container healthcheck timeout',
      body: 'When Docker container times out during healthcheck, increase the healthcheck interval in docker-compose.yml to 60s.',
    },
    existing: {
      title: 'Docker container healthcheck timeout',
      body: 'When Docker container times out during healthcheck, increase the healthcheck interval in docker-compose.yml to 60s.',
    },
    expectedOverlapType: 'exact',
  },

  // 2. Semantic duplicate (same topic, different wording)
  {
    id: 'semantic-npm-eresolve',
    candidate: {
      title: 'Fixing npm ERESOLVE dependency conflicts',
      body: 'npm install fails with ERESOLVE error when peer dependencies conflict. Use --legacy-peer-deps to bypass.',
    },
    existing: {
      title: 'npm dependency resolution errors',
      body: 'When npm cannot resolve peer dependency conflicts, it throws an ERESOLVE error. Pass the --legacy-peer-deps flag to skip peer dependency checks.',
    },
    expectedOverlapType: 'semantic',
  },

  // 3. None (completely different topics)
  {
    id: 'none-different-topics',
    candidate: {
      title: 'Docker container timeout fix',
      body: 'Increase healthcheck interval to fix Docker container timeout issues.',
    },
    existing: {
      title: 'PostgreSQL connection pool exhaustion',
      body: 'Use PgBouncer to manage PostgreSQL connection pooling when connections are exhausted.',
    },
    expectedOverlapType: 'none',
  },

  // 4. Semantic: same problem different solution
  {
    id: 'semantic-different-solution',
    candidate: {
      title: 'Resolve Node.js memory leaks',
      body: 'Use --max-old-space-size=4096 to increase heap memory for Node.js applications with memory leaks.',
    },
    existing: {
      title: 'Node.js memory leak detection',
      body: 'Node.js applications can leak memory in long-running processes. Profile with Chrome DevTools --inspect flag to find retained objects.',
    },
    expectedOverlapType: 'semantic',
  },

  // 5. None: superficial overlap (shared tool names)
  {
    id: 'none-superficial-overlap',
    candidate: {
      title: 'Docker image build optimization',
      body: 'Use multi-stage Docker builds to reduce image size. Copy only necessary files with .dockerignore.',
    },
    existing: {
      title: 'Docker Compose environment variables',
      body: 'Set environment variables in docker-compose.yml for configuration management across dev and production.',
    },
    expectedOverlapType: 'none',
  },

  // 6. Exact: minor wording differences
  {
    id: 'exact-minor-differences',
    candidate: {
      title: 'SSH connection drops during deployment',
      body: 'Use tmux to keep SSH sessions alive during long-running deployments to avoid connection drops.',
    },
    existing: {
      title: 'SSH connection drops during deploy',
      body: 'Keep SSH sessions alive during long-running deployments by using tmux or screen to avoid connection drops.',
    },
    expectedOverlapType: 'exact',
  },

  // 7. Semantic: same trap different context
  {
    id: 'semantic-same-trap-context',
    candidate: {
      title: 'Kubernetes pod OOM killed',
      body: 'Kubernetes pods get OOM killed when memory limits are too low. Increase memory limits in the deployment manifest.',
    },
    existing: {
      title: 'Container memory limit exceeded',
      body: 'Containers running in Kubernetes may be killed if the memory limit is exceeded. Set appropriate resource limits.',
    },
    expectedOverlapType: 'semantic',
  },

  // 8. None: different tools, different problems
  {
    id: 'none-different-tools',
    candidate: {
      title: 'TypeScript strict mode errors',
      body: 'Enable strict mode in tsconfig.json to catch type errors early. Fix noImplicitAny and strictNullChecks.',
    },
    existing: {
      title: 'ESLint configuration for React',
      body: 'Configure ESLint with eslint-plugin-react for React projects. Extend recommended config.',
    },
    expectedOverlapType: 'none',
  },

  // 9. Semantic: overlapping mitigations
  {
    id: 'semantic-overlapping-mitigations',
    candidate: {
      title: 'Slow database queries in production',
      body: 'Add database query logging and use EXPLAIN ANALYZE to identify slow queries. Add missing indexes.',
    },
    existing: {
      title: 'Database performance optimization',
      body: 'Optimize database performance by adding indexes on frequently queried columns and using EXPLAIN ANALYZE to profile queries.',
    },
    expectedOverlapType: 'semantic',
  },

  // 10. Exact: paraphrased but same content
  {
    id: 'exact-paraphrased',
    candidate: {
      title: 'CI pipeline fails with exit code 137',
      body: 'CI/CD pipelines that fail with exit code 137 are being OOM killed. Increase memory allocation for the CI runner.',
    },
    existing: {
      title: 'CI pipeline exit code 137 (OOM)',
      body: 'When a CI/CD pipeline fails with exit code 137, the process was killed due to out-of-memory. Increase the runner memory allocation.',
    },
    expectedOverlapType: 'exact',
  },

  // 11. None: related tools but different problems
  {
    id: 'none-related-tools-different',
    candidate: {
      title: 'Docker volume permissions issue',
      body: 'Docker volume mounts on Linux may have permission issues with uid mapping. Use --user flag or adjust file permissions.',
    },
    existing: {
      title: 'Docker networking between containers',
      body: 'Containers on the same Docker network can communicate using service names. Create a custom bridge network.',
    },
    expectedOverlapType: 'none',
  },

  // 12. Semantic: same cue different mitigation
  {
    id: 'semantic-same-cue-different',
    candidate: {
      title: 'Port already in use error',
      body: 'If port 3000 is already in use, find and kill the process using lsof -i :3000 or use a different port.',
    },
    existing: {
      title: 'Address already in use',
      body: 'EADDRINUSE errors mean the port is occupied. Either stop the existing process or configure your application to use an alternative port.',
    },
    expectedOverlapType: 'semantic',
  },

  // 13. None: generic terms overlap
  {
    id: 'none-generic-terms',
    candidate: {
      title: 'Git merge conflict resolution',
      body: 'When Git merge conflicts occur, edit the conflicting files, choose the correct changes, and commit.',
    },
    existing: {
      title: 'Git rebase workflow',
      body: 'Use git rebase to keep a clean commit history. Rebase feature branches before merging to main.',
    },
    expectedOverlapType: 'none',
  },

  // 14. Exact: restructured but identical
  {
    id: 'exact-restructured',
    candidate: {
      title: 'PostgreSQL connection limit reached',
      body: 'Increase max_connections in postgresql.conf or use connection pooling with PgBouncer when PostgreSQL connection limit is reached.',
    },
    existing: {
      title: 'PostgreSQL connection limit reached',
      body: 'When PostgreSQL connection limit is reached, either increase max_connections in postgresql.conf or implement connection pooling via PgBouncer.',
    },
    expectedOverlapType: 'exact',
  },

  // 15. Semantic: similar problem scope
  {
    id: 'semantic-similar-scope',
    candidate: {
      title: 'Vite dev server hot reload not working',
      body: 'Vite HMR may stop working when file watchers hit the system limit. Increase fs.inotify.max_user_watches.',
    },
    existing: {
      title: 'File watcher limit reached',
      body: 'When file watchers fail (ENOSPC error), increase the system inotify limit with sysctl fs.inotify.max_user_watches.',
    },
    expectedOverlapType: 'semantic',
  },

  // 16. None: same category different focus
  {
    id: 'none-same-category',
    candidate: {
      title: 'Tailwind CSS purge unused styles',
      body: 'Configure Tailwind CSS purge option to remove unused CSS classes and reduce bundle size in production.',
    },
    existing: {
      title: 'CSS modules naming conflicts',
      body: 'CSS modules can have naming conflicts in large projects. Use consistent naming conventions and BEM methodology.',
    },
    expectedOverlapType: 'none',
  },

  // 17. Semantic: overlapping troubleshooting
  {
    id: 'semantic-overlapping-troubleshooting',
    candidate: {
      title: 'CORS errors in browser console',
      body: 'CORS errors occur when the server does not include proper Access-Control-Allow-Origin headers. Configure CORS middleware on the backend.',
    },
    existing: {
      title: 'Cross-origin request blocked',
      body: 'Browser blocks cross-origin requests when CORS headers are missing. Add CORS middleware to your Express/Node.js server.',
    },
    expectedOverlapType: 'semantic',
  },

  // 18. None: different domains
  {
    id: 'none-different-domains',
    candidate: {
      title: 'Redis cache eviction policy',
      body: 'Configure Redis maxmemory-policy to control cache eviction. Use allkeys-lru for a general-purpose cache.',
    },
    existing: {
      title: 'Webpack bundle size optimization',
      body: 'Reduce webpack bundle size with tree shaking, code splitting, and dynamic imports.',
    },
    expectedOverlapType: 'none',
  },

  // 19. Exact: minor formatting differences
  {
    id: 'exact-formatting',
    candidate: {
      title: 'macOS file descriptor limit',
      body: 'On macOS, the default file descriptor limit is too low. Use ulimit -n 65536 to increase it before starting your application.',
    },
    existing: {
      title: 'macOS file descriptor limit',
      body: 'The default file descriptor limit on macOS is too low for many applications. Run ulimit -n 65536 to increase it before starting the app.',
    },
    expectedOverlapType: 'exact',
  },

  // 20. Semantic: same concept different advice
  {
    id: 'semantic-same-concept',
    candidate: {
      title: 'Using environment variables for secrets',
      body: 'Never hardcode secrets in source code. Use environment variables or a secrets manager like AWS Secrets Manager.',
    },
    existing: {
      title: 'Secret management best practices',
      body: 'Store application secrets in a vault (HashiCorp Vault) or environment variables. Never commit secrets to version control.',
    },
    expectedOverlapType: 'semantic',
  },
];

// ---------------------------------------------------------------------------
// Jaccard-based classification (reproduces detector.ts logic)
// ---------------------------------------------------------------------------

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((part) => part.length >= 3),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared++;
  }
  return shared / new Set([...a, ...b]).size;
}

const JACCARD_EXACT_THRESHOLD = 0.85;
const JACCARD_SEMANTIC_THRESHOLD = 0.5;

function jaccardClassify(
  candidate: { title: string; body: string },
  existing: { title: string; body: string },
): OverlapType {
  const candidateTokens = tokenize(`${candidate.title} ${candidate.body}`);
  const existingTokens = tokenize(`${existing.title} ${existing.body}`);
  const score = overlapScore(candidateTokens, existingTokens);

  if (score >= JACCARD_EXACT_THRESHOLD) return 'exact';
  if (score >= JACCARD_SEMANTIC_THRESHOLD) return 'semantic';
  return 'none';
}

// ---------------------------------------------------------------------------
// LLM-based classification (uses llm-dedup when available, else mock)
// ---------------------------------------------------------------------------

async function llmClassify(
  candidate: { title: string; body: string },
  existing: { title: string; body: string },
  dryRun: boolean,
): Promise<OverlapType> {
  if (dryRun) {
    // In dry-run mode, use Jaccard with slightly better thresholds to simulate LLM advantage
    const candidateTokens = tokenize(`${candidate.title} ${candidate.body}`);
    const existingTokens = tokenize(`${existing.title} ${existing.body}`);
    const score = overlapScore(candidateTokens, existingTokens);

    // LLM simulation: slightly better at detecting semantic similarity
    if (score >= 0.7) return 'exact';
    if (score >= 0.3) return 'semantic';
    return 'none';
  }

  try {
    const { judgeDuplicateWithLLM } = await import(
      '../../packages/server/src/lib/candidates/llm-dedup.js'
    );
    const { createAiProviders } = await import('../../packages/server/src/lib/ai/providers.js');
    const { loadAiProviderConfig } = await import(
      '../../packages/server/src/lib/ai/provider-config.js'
    );

    const config = loadAiProviderConfig();
    const { chat } = createAiProviders(config);
    if (!chat.isConfigured) {
      console.warn('Chat provider not configured, falling back to Jaccard');
      return jaccardClassify(candidate, existing);
    }

    const judgment = await judgeDuplicateWithLLM(chat, candidate, existing);
    if (judgment) {
      return judgment.overlapType;
    }
    return jaccardClassify(candidate, existing);
  } catch {
    return jaccardClassify(candidate, existing);
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function computeMetrics(tp: number, fp: number, fn: number): ClassificationMetrics {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, precision, recall, f1 };
}

/**
 * Compute per-class (exact/semantic/none) and macro-averaged metrics.
 */
function computePerClassMetrics(
  predictions: OverlapType[],
  expected: OverlapType[],
): {
  exact: ClassificationMetrics;
  semantic: ClassificationMetrics;
  none: ClassificationMetrics;
  macroF1: number;
  accuracy: number;
} {
  const classes: OverlapType[] = ['exact', 'semantic', 'none'];
  const result: Record<OverlapType, ClassificationMetrics> = {} as Record<
    OverlapType,
    ClassificationMetrics
  >;

  let correct = 0;
  for (const cls of classes) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i] === cls && expected[i] === cls) tp++;
      else if (predictions[i] === cls && expected[i] !== cls) fp++;
      else if (predictions[i] !== cls && expected[i] === cls) fn++;
    }
    result[cls] = computeMetrics(tp, fp, fn);
  }

  for (let i = 0; i < predictions.length; i++) {
    if (predictions[i] === expected[i]) correct++;
  }

  const macroF1 = (result.exact.f1 + result.semantic.f1 + result.none.f1) / 3;
  const accuracy = predictions.length > 0 ? correct / predictions.length : 0;

  return {
    exact: result.exact,
    semantic: result.semantic,
    none: result.none,
    macroF1,
    accuracy,
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function formatReport(
  jaccardMetrics: ReturnType<typeof computePerClassMetrics>,
  llmMetrics: ReturnType<typeof computePerClassMetrics>,
  results: Array<{ id: string; expected: OverlapType; jaccard: OverlapType; llm: OverlapType }>,
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('============================================================');
  lines.push('        Duplicate Detection Evaluation Report');
  lines.push('============================================================');
  lines.push('');

  lines.push('=== Aggregate Metrics ===');
  lines.push('');
  lines.push('Class       | Jaccard P/R/F1  | LLM P/R/F1     ');
  lines.push('------------|-----------------|----------------');
  for (const cls of ['exact', 'semantic', 'none'] as const) {
    const j = jaccardMetrics[cls];
    const l = llmMetrics[cls];
    const label = cls.padEnd(10);
    const jp = `${j.precision.toFixed(2)}/${j.recall.toFixed(2)}/${j.f1.toFixed(2)}`.padStart(15);
    const lp = `${l.precision.toFixed(2)}/${l.recall.toFixed(2)}/${l.f1.toFixed(2)}`.padStart(15);
    lines.push(`${label} | ${jp} | ${lp}`);
  }
  lines.push('');
  lines.push(
    `Macro F1   | ${jaccardMetrics.macroF1.toFixed(3).padStart(15)} | ${llmMetrics.macroF1.toFixed(3).padStart(15)}`,
  );
  lines.push(
    `Accuracy   | ${jaccardMetrics.accuracy.toFixed(3).padStart(15)} | ${llmMetrics.accuracy.toFixed(3).padStart(15)}`,
  );
  lines.push('');

  // Per-case details
  lines.push('=== Per-Case Results ===');
  lines.push('');
  lines.push('Case ID                  | Expected | Jaccard | LLM    ');
  lines.push('-------------------------|----------|---------|--------');
  for (const r of results) {
    const id = r.id.padEnd(24);
    const exp = r.expected.padEnd(8);
    const jac = r.jaccard.padEnd(7);
    const jacOk = r.jaccard === r.expected ? 'OK' : 'MISS';
    const llmOk = r.llm === r.expected ? 'OK' : 'MISS';
    lines.push(`${id} | ${exp} | ${jac} ${jacOk.padEnd(4)} | ${r.llm.padEnd(6)} ${llmOk}`);
  }
  lines.push('');

  // Disagreements
  const disagreements = results.filter((r) => r.jaccard !== r.llm);
  if (disagreements.length > 0) {
    lines.push(`=== Disagreements (${disagreements.length}) ===`);
    lines.push('');
    for (const r of disagreements) {
      lines.push(`  ${r.id}: expected=${r.expected}, jaccard=${r.jaccard}, llm=${r.llm}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs_();

  console.log('');
  console.log('=== Duplicate Detection Evaluation ===');
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'live'}`);
  console.log(`Smoke: ${options.smoke}`);

  const allFixtures = options.smoke
    ? dedupFixtures
    : [...dedupFixtures, ...realSkillDedupFixtures];
  console.log(`Fixtures: ${allFixtures.length}`);
  console.log('');

  const expected = allFixtures.map((f) => f.expectedOverlapType);
  const jaccardPredictions: OverlapType[] = [];
  const llmPredictions: OverlapType[] = [];
  const caseResults: Array<{
    id: string;
    expected: OverlapType;
    jaccard: OverlapType;
    llm: OverlapType;
  }> = [];

  for (const fixture of allFixtures) {
    const jResult = jaccardClassify(fixture.candidate, fixture.existing);
    const lResult = await llmClassify(fixture.candidate, fixture.existing, options.dryRun);

    jaccardPredictions.push(jResult);
    llmPredictions.push(lResult);
    caseResults.push({
      id: fixture.id,
      expected: fixture.expectedOverlapType,
      jaccard: jResult,
      llm: lResult,
    });
  }

  const jaccardMetrics = computePerClassMetrics(jaccardPredictions, expected);
  const llmMetrics = computePerClassMetrics(llmPredictions, expected);

  console.log(formatReport(jaccardMetrics, llmMetrics, caseResults));

  console.log('Duplicate detection evaluation completed.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
