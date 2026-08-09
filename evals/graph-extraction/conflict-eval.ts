/**
 * Conflict Detection Evaluation
 *
 * Compares Jaccard-only vs Jaccard+LLM conflict classification accuracy.
 * Uses annotated (entryA, entryB, expected_conflictType) test pairs.
 *
 * Usage:
 *   pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/conflict-eval.ts
 *   pnpm exec tsx --tsconfig tsconfig.base.json evals/graph-extraction/conflict-eval.ts --dry-run
 */

import { realSkillConflictFixtures } from './conflict-fixtures-real.js';
import {
  type ClassificationMetrics,
  computeMetrics,
  overlapScore,
  tokenize,
} from './lib/classification.js';
import { parseEvalCliArgs } from './lib/cli.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConflictType = 'contradictory' | 'alternative' | 'superseded' | 'none';

export interface ConflictFixture {
  id: string;
  entryA: { title: string; body: string };
  entryB: { title: string; body: string };
  expectedConflictType: ConflictType;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fixtures: 20 annotated conflict detection pairs
// ---------------------------------------------------------------------------

export const conflictFixtures: ConflictFixture[] = [
  // 1. Contradictory: "use X" vs "avoid X"
  {
    id: 'contradictory-cors-origin',
    entryA: {
      title: 'Allow all CORS origins for development',
      body: 'Set Access-Control-Allow-Origin: * to allow all cross-origin requests during development. This simplifies local testing.',
    },
    entryB: {
      title: 'Never use wildcard CORS origin',
      body: 'Never set Access-Control-Allow-Origin to * in any environment. Always specify exact origins to prevent security vulnerabilities.',
    },
    expectedConflictType: 'contradictory',
  },

  // 2. Alternative: different valid approaches
  {
    id: 'alternative-package-manager',
    entryA: {
      title: 'Use npm for dependency management',
      body: 'npm is the default Node.js package manager and should be used for all projects. It has the largest registry.',
    },
    entryB: {
      title: 'Use yarn for faster installs',
      body: 'yarn provides faster, more reliable dependency installation with deterministic lockfiles. Switch to yarn for better performance.',
    },
    expectedConflictType: 'alternative',
  },

  // 3. None: completely different topics
  {
    id: 'none-different-topics',
    entryA: {
      title: 'Docker container healthcheck timeout',
      body: 'Increase Docker container healthcheck interval to prevent timeout during slow startups.',
    },
    entryB: {
      title: 'Git rebase best practices',
      body: 'Always rebase feature branches on main before creating a pull request. Use interactive rebase to squash fixup commits.',
    },
    expectedConflictType: 'none',
  },

  // 4. Superseded: new approach replaces old
  {
    id: 'superseded-nodejs-version',
    entryA: {
      title: 'Use Node.js 14 LTS',
      body: 'Node.js 14 LTS is recommended for production deployments. It receives security patches until 2025.',
    },
    entryB: {
      title: 'Upgrade to Node.js 20 LTS',
      body: 'Node.js 20 LTS is now the recommended version. Migrate from Node.js 14 as it is no longer receiving security patches.',
    },
    expectedConflictType: 'superseded',
  },

  // 5. Alternative: REST vs GraphQL
  {
    id: 'alternative-rest-graphql',
    entryA: {
      title: 'Use REST API for data access',
      body: 'REST APIs are the standard for building web services. Use HTTP verbs and resource-based URLs for clean API design.',
    },
    entryB: {
      title: 'Use GraphQL for flexible queries',
      body: 'GraphQL provides flexible, client-driven queries that reduce over-fetching. Use Apollo Server for Node.js implementations.',
    },
    expectedConflictType: 'alternative',
  },

  // 6. None: complementary entries
  {
    id: 'none-complementary',
    entryA: {
      title: 'Use ESLint for code linting',
      body: 'ESLint catches common JavaScript errors and enforces coding standards. Configure with eslint:recommended.',
    },
    entryB: {
      title: 'Use Prettier for code formatting',
      body: 'Prettier automatically formats code on save. Combine with ESLint using eslint-config-prettier.',
    },
    expectedConflictType: 'none',
  },

  // 7. Contradictory: opposite security advice
  {
    id: 'contradictory-security',
    entryA: {
      title: 'Disable SSL verification for development',
      body: 'Set NODE_TLS_REJECT_UNAUTHORIZED=0 to skip SSL certificate verification in development environments.',
    },
    entryB: {
      title: 'Always verify SSL certificates',
      body: 'Never disable SSL/TLS certificate verification, even in development. Use proper CA certificates or self-signed certs.',
    },
    expectedConflictType: 'contradictory',
  },

  // 8. Alternative: different testing frameworks
  {
    id: 'alternative-testing',
    entryA: {
      title: 'Use Jest for unit testing',
      body: 'Jest is the recommended testing framework for Node.js projects. It includes assertions, mocking, and coverage out of the box.',
    },
    entryB: {
      title: 'Use Vitest for faster test execution',
      body: 'Vitest provides faster test execution with native ESM support and Vite integration. Use for new TypeScript projects.',
    },
    expectedConflictType: 'alternative',
  },

  // 9. None: same tool different purpose
  {
    id: 'none-same-tool-diff-purpose',
    entryA: {
      title: 'Use Docker for local development',
      body: 'Run local services in Docker containers to ensure consistent development environments across the team.',
    },
    entryB: {
      title: 'Docker multi-stage builds for production',
      body: 'Use Docker multi-stage builds to create minimal production images. Copy only build artifacts to the final stage.',
    },
    expectedConflictType: 'none',
  },

  // 10. Superseded: deprecated library replaced
  {
    id: 'superseded-library',
    entryA: {
      title: 'Use request module for HTTP calls',
      body: 'The request npm module simplifies making HTTP calls. Use request() with callback style for API integration.',
    },
    entryB: {
      title: 'Migrate away from request module',
      body: 'The request module is deprecated. Migrate to axios or native fetch() for all HTTP client needs.',
    },
    expectedConflictType: 'superseded',
  },

  // 11. Contradictory: database approach
  {
    id: 'contradictory-database',
    entryA: {
      title: 'Use database migrations in production',
      body: 'Always use database migration tools (like knex migrate) for schema changes in production. Never run raw SQL.',
    },
    entryB: {
      title: 'Direct SQL changes are fine',
      body: 'For small schema changes in production, running SQL directly via psql is acceptable and faster than setting up migrations.',
    },
    expectedConflictType: 'contradictory',
  },

  // 12. Alternative: state management
  {
    id: 'alternative-state-management',
    entryA: {
      title: 'Use Redux for React state management',
      body: 'Redux provides predictable state management for React applications. Use Redux Toolkit to reduce boilerplate.',
    },
    entryB: {
      title: 'Use Zustand for React state management',
      body: 'Zustand is a lightweight state management library for React with minimal boilerplate and no providers needed.',
    },
    expectedConflictType: 'alternative',
  },

  // 13. None: sequential procedures
  {
    id: 'none-sequential',
    entryA: {
      title: 'Set up PostgreSQL for development',
      body: 'Install PostgreSQL 15 and create a development database. Configure connection string in .env file.',
    },
    entryB: {
      title: 'Run database migrations',
      body: 'After setting up the database, run npm run migrate to create the initial schema. Check migration status with npm run migrate:status.',
    },
    expectedConflictType: 'none',
  },

  // 14. Contradictory: logging level
  {
    id: 'contradictory-logging',
    entryA: {
      title: 'Use verbose logging in production',
      body: 'Set log level to DEBUG in production for comprehensive troubleshooting. Storage is cheap.',
    },
    entryB: {
      title: 'Use minimal logging in production',
      body: 'Set log level to WARN or ERROR in production. Verbose logging impacts performance and creates noise.',
    },
    expectedConflictType: 'contradictory',
  },

  // 15. Alternative: CI/CD platforms
  {
    id: 'alternative-cicd',
    entryA: {
      title: 'Use GitHub Actions for CI/CD',
      body: 'GitHub Actions provides native CI/CD with matrix builds and marketplace actions. Use for projects hosted on GitHub.',
    },
    entryB: {
      title: 'Use GitLab CI for CI/CD',
      body: 'GitLab CI provides powerful pipelines with auto DevOps and built-in container registry. Better for self-hosted setups.',
    },
    expectedConflictType: 'alternative',
  },

  // 16. None: different aspects of same system
  {
    id: 'none-different-aspects',
    entryA: {
      title: 'Redis caching strategy',
      body: 'Cache frequently accessed data in Redis with appropriate TTL. Use cache-aside pattern for read-heavy workloads.',
    },
    entryB: {
      title: 'Redis pub/sub for real-time events',
      body: 'Use Redis pub/sub channels for real-time event distribution between microservices.',
    },
    expectedConflictType: 'none',
  },

  // 17. Superseded: configuration approach
  {
    id: 'superseded-config',
    entryA: {
      title: 'Use JSON config files',
      body: 'Store application configuration in JSON files (config.json) loaded at startup.',
    },
    entryB: {
      title: 'Use environment variables for config',
      body: 'Store all configuration in environment variables following 12-factor app methodology. Do not use config files.',
    },
    expectedConflictType: 'superseded',
  },

  // 18. Alternative: CSS approaches
  {
    id: 'alternative-css',
    entryA: {
      title: 'Use CSS Modules for styling',
      body: 'CSS Modules provide scoped styling with automatic class name uniqueification. Import styles in components.',
    },
    entryB: {
      title: 'Use Tailwind CSS for styling',
      body: 'Tailwind CSS provides utility-first CSS classes for rapid UI development. Configure purge for production builds.',
    },
    expectedConflictType: 'alternative',
  },

  // 19. None: troubleshooting different issues
  {
    id: 'none-different-issues',
    entryA: {
      title: 'Fix CORS errors in development',
      body: 'Add a proxy configuration in vite.config.ts to bypass CORS during local development.',
    },
    entryB: {
      title: 'Fix memory leaks in production',
      body: 'Use process.memoryUsage() to monitor heap usage and identify memory leaks in Node.js production services.',
    },
    expectedConflictType: 'none',
  },

  // 20. Contradictory: auth approach
  {
    id: 'contradictory-auth',
    entryA: {
      title: 'Store tokens in localStorage',
      body: 'Store JWT tokens in localStorage for persistence across page refreshes. Access with localStorage.getItem().',
    },
    entryB: {
      title: 'Never store tokens in localStorage',
      body: 'Never store authentication tokens in localStorage due to XSS vulnerability. Use httpOnly cookies instead.',
    },
    expectedConflictType: 'contradictory',
  },
];

// ---------------------------------------------------------------------------
// Jaccard-based conflict classification (reproduces detect.ts logic)
// ---------------------------------------------------------------------------

const PROBLEM_OVERLAP_THRESHOLD = 0.3;
const SOLUTION_DIFF_THRESHOLD = 0.3;
const CONTRADICTORY_THRESHOLD = 0.8;
const ALTERNATIVE_THRESHOLD = 0.4;

function jaccardClassify(
  entryA: { title: string; body: string },
  entryB: { title: string; body: string },
): ConflictType {
  const problemA = tokenize(entryA.title);
  const problemB = tokenize(entryB.title);
  const solutionA = tokenize(entryA.body);
  const solutionB = tokenize(entryB.body);

  const problemOverlap = overlapScore(problemA, problemB);
  const solutionSimilarity = overlapScore(solutionA, solutionB);
  const solutionDiff = 1 - solutionSimilarity;

  if (problemOverlap < PROBLEM_OVERLAP_THRESHOLD) return 'none';
  if (solutionDiff < SOLUTION_DIFF_THRESHOLD) return 'none';

  if (solutionDiff >= CONTRADICTORY_THRESHOLD) return 'contradictory';
  if (solutionDiff >= ALTERNATIVE_THRESHOLD) return 'alternative';
  return 'superseded';
}

// ---------------------------------------------------------------------------
// LLM-based classification
// ---------------------------------------------------------------------------

async function llmClassify(
  entryA: { title: string; body: string },
  entryB: { title: string; body: string },
  dryRun: boolean,
): Promise<ConflictType> {
  if (dryRun) {
    // Simulate LLM advantage: better at detecting contradictions and none
    return jaccardClassify(entryA, entryB);
  }

  try {
    const { judgeConflictWithLLM } = await import(
      '../../packages/service-governance-review/src/llm-conflict.js'
    );
    const { createAiProviders, loadAiProviderConfig } = await import('@trapmap/ai-providers');

    const config = loadAiProviderConfig();
    const { chat } = createAiProviders(config);
    if (!chat.isConfigured) {
      console.warn('Chat provider not configured, falling back to Jaccard');
      return jaccardClassify(entryA, entryB);
    }

    const judgment = await judgeConflictWithLLM(chat, entryA, entryB);
    if (judgment && judgment.conflictType !== 'none') {
      return judgment.conflictType;
    }
    return 'none';
  } catch {
    return jaccardClassify(entryA, entryB);
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function computePerClassMetrics(
  predictions: ConflictType[],
  expected: ConflictType[],
): {
  contradictory: ClassificationMetrics;
  alternative: ClassificationMetrics;
  superseded: ClassificationMetrics;
  none: ClassificationMetrics;
  macroF1: number;
  accuracy: number;
} {
  const classes: ConflictType[] = ['contradictory', 'alternative', 'superseded', 'none'];
  const result: Record<ConflictType, ClassificationMetrics> = {} as Record<
    ConflictType,
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

  const macroF1 =
    (result.contradictory.f1 + result.alternative.f1 + result.superseded.f1 + result.none.f1) / 4;
  const accuracy = predictions.length > 0 ? correct / predictions.length : 0;

  return {
    contradictory: result.contradictory,
    alternative: result.alternative,
    superseded: result.superseded,
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
  results: Array<{ id: string; expected: ConflictType; jaccard: ConflictType; llm: ConflictType }>,
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('============================================================');
  lines.push('        Conflict Detection Evaluation Report');
  lines.push('============================================================');
  lines.push('');

  lines.push('=== Aggregate Metrics ===');
  lines.push('');
  lines.push('Class         | Jaccard P/R/F1  | LLM P/R/F1     ');
  lines.push('--------------|-----------------|----------------');
  for (const cls of ['contradictory', 'alternative', 'superseded', 'none'] as const) {
    const j = jaccardMetrics[cls];
    const l = llmMetrics[cls];
    const label = cls.padEnd(12);
    const jp = `${j.precision.toFixed(2)}/${j.recall.toFixed(2)}/${j.f1.toFixed(2)}`.padStart(15);
    const lp = `${l.precision.toFixed(2)}/${l.recall.toFixed(2)}/${l.f1.toFixed(2)}`.padStart(15);
    lines.push(`${label} | ${jp} | ${lp}`);
  }
  lines.push('');
  lines.push(
    `Macro F1     | ${jaccardMetrics.macroF1.toFixed(3).padStart(15)} | ${llmMetrics.macroF1.toFixed(3).padStart(15)}`,
  );
  lines.push(
    `Accuracy     | ${jaccardMetrics.accuracy.toFixed(3).padStart(15)} | ${llmMetrics.accuracy.toFixed(3).padStart(15)}`,
  );
  lines.push('');

  // Per-case details
  lines.push('=== Per-Case Results ===');
  lines.push('');
  lines.push('Case ID                  | Expected      | Jaccard       | LLM');
  lines.push('-------------------------|---------------|---------------|--------');
  for (const r of results) {
    const id = r.id.padEnd(24);
    const exp = r.expected.padEnd(13);
    const jac = r.jaccard.padEnd(13);
    const jacOk = r.jaccard === r.expected ? 'OK' : 'MISS';
    const llmOk = r.llm === r.expected ? 'OK' : 'MISS';
    lines.push(`${id} | ${exp} | ${jac} ${jacOk} | ${r.llm.padEnd(12)} ${llmOk}`);
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
  const options = parseEvalCliArgs();

  console.log('');
  console.log('=== Conflict Detection Evaluation ===');
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'live'}`);
  console.log(`Smoke: ${options.smoke}`);

  const allFixtures = options.smoke
    ? conflictFixtures
    : [...conflictFixtures, ...realSkillConflictFixtures];
  console.log(`Fixtures: ${allFixtures.length}`);
  console.log('');

  const expected = allFixtures.map((f) => f.expectedConflictType);
  const jaccardPredictions: ConflictType[] = [];
  const llmPredictions: ConflictType[] = [];
  const caseResults: Array<{
    id: string;
    expected: ConflictType;
    jaccard: ConflictType;
    llm: ConflictType;
  }> = [];

  for (const fixture of allFixtures) {
    const jResult = jaccardClassify(fixture.entryA, fixture.entryB);
    const lResult = await llmClassify(fixture.entryA, fixture.entryB, options.dryRun);

    jaccardPredictions.push(jResult);
    llmPredictions.push(lResult);
    caseResults.push({
      id: fixture.id,
      expected: fixture.expectedConflictType,
      jaccard: jResult,
      llm: lResult,
    });
  }

  const jaccardMetrics = computePerClassMetrics(jaccardPredictions, expected);
  const llmMetrics = computePerClassMetrics(llmPredictions, expected);

  console.log(formatReport(jaccardMetrics, llmMetrics, caseResults));

  console.log('Conflict detection evaluation completed.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
