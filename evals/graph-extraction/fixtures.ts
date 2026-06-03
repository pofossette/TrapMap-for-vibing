/**
 * Graph Extraction Evaluation Fixtures
 *
 * Annotated ground truth entries for evaluating the LLM graph extraction pipeline.
 * Each entry contains input text and expected nodes/edges that should be extracted.
 *
 * Coverage:
 * - Simple single-entity entries
 * - Complex multi-entity entries
 * - Negation sentences
 * - Implicit prerequisite/mitsigation
 * - Co-occurring tools/environments
 * - Risk-blocking relationships
 * - Hard vs soft strength classification
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeKind =
  | 'trap'
  | 'skill'
  | 'cue'
  | 'tool'
  | 'environment'
  | 'prerequisite'
  | 'mitigation';

export type RelationType = 'mitigates' | 'requires' | 'order' | 'risk-blocks' | 'co-occurs-with';

export type RelationStrength = 'hard' | 'soft';

export interface ExpectedNode {
  kind: NodeKind;
  label: string;
}

export interface ExpectedEdge {
  source: string;
  target: string;
  type: RelationType;
  strength: RelationStrength;
}

export interface GraphExtractionFixture {
  id: string;
  input: string;
  expectedNodes: ExpectedNode[];
  expectedEdges: ExpectedEdge[];
}

import { realSkillGraphFixtures } from './fixtures-real.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const handCraftedFixtures: GraphExtractionFixture[] = [
  // 1. Simple trap with one tool
  {
    id: 'simple-tool-trap',
    input:
      'When using Docker for deployments, the container healthcheck may time out if the startup is slow. Increase the healthcheck interval to fix this.',
    expectedNodes: [
      { kind: 'tool', label: 'docker' },
      { kind: 'cue', label: 'healthcheck-timeout' },
      { kind: 'mitigation', label: 'increase-healthcheck-interval' },
    ],
    expectedEdges: [
      {
        source: 'increase-healthcheck-interval',
        target: 'healthcheck-timeout',
        type: 'mitigates',
        strength: 'hard',
      },
      { source: 'docker', target: 'healthcheck-timeout', type: 'co-occurs-with', strength: 'soft' },
    ],
  },

  // 2. Multi-entity complex entry
  {
    id: 'complex-multi-entity',
    input:
      'Node.js 18+ is required for this project. Using npm as the package manager, you may encounter ERESOLVE errors when dependencies conflict. The solution is to use --legacy-peer-deps flag or switch to yarn as an alternative package manager. This often happens in CI/CD environments running Ubuntu.',
    expectedNodes: [
      { kind: 'prerequisite', label: 'nodejs-18' },
      { kind: 'tool', label: 'npm' },
      { kind: 'tool', label: 'yarn' },
      { kind: 'cue', label: 'eresolve-error' },
      { kind: 'mitigation', label: 'legacy-peer-deps' },
      { kind: 'environment', label: 'ubuntu' },
    ],
    expectedEdges: [
      { source: 'npm', target: 'eresolve-error', type: 'risk-blocks', strength: 'soft' },
      { source: 'legacy-peer-deps', target: 'eresolve-error', type: 'mitigates', strength: 'hard' },
      { source: 'yarn', target: 'npm', type: 'co-occurs-with', strength: 'soft' },
      { source: 'npm', target: 'nodejs-18', type: 'requires', strength: 'hard' },
    ],
  },

  // 3. Negation sentence — should NOT extract TypeScript as a dependency
  {
    id: 'negation-no-typescript',
    input:
      'This project does NOT require TypeScript. JavaScript with JSDoc annotations is sufficient. Do not add tsconfig.json.',
    expectedNodes: [{ kind: 'tool', label: 'javascript' }],
    expectedEdges: [],
  },

  // 4. Implicit prerequisite (not explicitly labeled)
  {
    id: 'implicit-prerequisite',
    input:
      'Before deploying, make sure Docker is installed and the daemon is running. You need at least 4GB of memory allocated to Docker. The deployment script uses docker-compose to orchestrate services.',
    expectedNodes: [
      { kind: 'prerequisite', label: 'docker' },
      { kind: 'tool', label: 'docker-compose' },
      { kind: 'cue', label: 'docker-memory-issue' },
    ],
    expectedEdges: [
      { source: 'docker-compose', target: 'docker', type: 'requires', strength: 'hard' },
    ],
  },

  // 5. Skill-oriented entry with order relation
  {
    id: 'skill-with-order',
    input:
      'To set up the development environment: First install Node.js, then run npm install, then configure the .env file. The build step requires all three to be completed in order.',
    expectedNodes: [
      { kind: 'prerequisite', label: 'nodejs' },
      { kind: 'tool', label: 'npm' },
      { kind: 'skill', label: 'dev-environment-setup' },
    ],
    expectedEdges: [
      { source: 'npm', target: 'nodejs', type: 'requires', strength: 'hard' },
      { source: 'dev-environment-setup', target: 'nodejs', type: 'order', strength: 'hard' },
    ],
  },

  // 6. Risk-blocks relationship
  {
    id: 'risk-blocks',
    input:
      'Running tests in parallel may cause race conditions when tests share a database. Use test isolation with separate database schemas or SQLite in-memory mode to avoid this.',
    expectedNodes: [
      { kind: 'trap', label: 'test-race-condition' },
      { kind: 'cue', label: 'shared-database' },
      { kind: 'mitigation', label: 'test-isolation' },
    ],
    expectedEdges: [
      {
        source: 'shared-database',
        target: 'test-race-condition',
        type: 'risk-blocks',
        strength: 'hard',
      },
      {
        source: 'test-isolation',
        target: 'test-race-condition',
        type: 'mitigates',
        strength: 'hard',
      },
    ],
  },

  // 7. Soft co-occurrence
  {
    id: 'soft-co-occurrence',
    input:
      'Docker is often used alongside Kubernetes for container orchestration. While Docker handles building images, Kubernetes manages the deployment lifecycle. Helm charts are commonly used with Kubernetes.',
    expectedNodes: [
      { kind: 'tool', label: 'docker' },
      { kind: 'tool', label: 'kubernetes' },
      { kind: 'tool', label: 'helm' },
    ],
    expectedEdges: [
      { source: 'kubernetes', target: 'docker', type: 'co-occurs-with', strength: 'soft' },
      { source: 'helm', target: 'kubernetes', type: 'co-occurs-with', strength: 'soft' },
    ],
  },

  // 8. Environment-specific trap
  {
    id: 'environment-specific',
    input:
      'On macOS, the default file descriptor limit is too low for running many Node.js workers. Use ulimit -n 65536 or set it in launchd.conf. This issue does not occur on Linux.',
    expectedNodes: [
      { kind: 'trap', label: 'macos-fd-limit' },
      { kind: 'environment', label: 'macos' },
      { kind: 'environment', label: 'linux' },
      { kind: 'tool', label: 'nodejs' },
      { kind: 'mitigation', label: 'ulimit-increase' },
    ],
    expectedEdges: [
      { source: 'macos', target: 'macos-fd-limit', type: 'co-occurs-with', strength: 'hard' },
      { source: 'ulimit-increase', target: 'macos-fd-limit', type: 'mitigates', strength: 'hard' },
      { source: 'nodejs', target: 'macos-fd-limit', type: 'co-occurs-with', strength: 'soft' },
    ],
  },

  // 9. Multiple mitigations for same problem
  {
    id: 'multiple-mitigations',
    input:
      'When PostgreSQL runs out of connections, you can: 1) Increase max_connections in postgresql.conf, 2) Use connection pooling with PgBouncer, 3) Implement retry logic with exponential backoff in the application.',
    expectedNodes: [
      { kind: 'cue', label: 'pg-connection-exhaustion' },
      { kind: 'tool', label: 'postgresql' },
      { kind: 'mitigation', label: 'increase-max-connections' },
      { kind: 'tool', label: 'pgbouncer' },
      { kind: 'mitigation', label: 'connection-retry-backoff' },
    ],
    expectedEdges: [
      {
        source: 'increase-max-connections',
        target: 'pg-connection-exhaustion',
        type: 'mitigates',
        strength: 'hard',
      },
      {
        source: 'pgbouncer',
        target: 'pg-connection-exhaustion',
        type: 'mitigates',
        strength: 'hard',
      },
      {
        source: 'connection-retry-backoff',
        target: 'pg-connection-exhaustion',
        type: 'mitigates',
        strength: 'soft',
      },
      {
        source: 'postgresql',
        target: 'pg-connection-exhaustion',
        type: 'co-occurs-with',
        strength: 'soft',
      },
    ],
  },

  // 10. Hard vs soft strength distinction
  {
    id: 'hard-vs-soft-strength',
    input:
      'You MUST use Node.js version 18 or higher. Prettier is recommended but optional for code formatting. ESLint is mandatory for CI to pass.',
    expectedNodes: [
      { kind: 'prerequisite', label: 'nodejs-18' },
      { kind: 'tool', label: 'prettier' },
      { kind: 'tool', label: 'eslint' },
    ],
    expectedEdges: [{ source: 'eslint', target: 'nodejs-18', type: 'requires', strength: 'hard' }],
  },

  // 11. Order relation between skills
  {
    id: 'skill-order',
    input:
      'Run database migrations before starting the application server. The seed script must run after migrations complete. Always back up the database before running migrations.',
    expectedNodes: [
      { kind: 'skill', label: 'database-migration' },
      { kind: 'skill', label: 'database-seed' },
      { kind: 'skill', label: 'database-backup' },
    ],
    expectedEdges: [
      { source: 'database-seed', target: 'database-migration', type: 'order', strength: 'hard' },
      { source: 'database-backup', target: 'database-migration', type: 'order', strength: 'hard' },
    ],
  },

  // 12. Co-occurring environment and tool
  {
    id: 'env-tool-co-occurrence',
    input:
      'This project is designed for Linux environments with Docker installed. The CI pipeline runs on Ubuntu 22.04 using GitHub Actions. SSH access to the deployment server is required for manual interventions.',
    expectedNodes: [
      { kind: 'environment', label: 'linux' },
      { kind: 'tool', label: 'docker' },
      { kind: 'environment', label: 'ubuntu-22-04' },
      { kind: 'tool', label: 'github-actions' },
      { kind: 'tool', label: 'ssh' },
    ],
    expectedEdges: [
      { source: 'docker', target: 'linux', type: 'co-occurs-with', strength: 'soft' },
      {
        source: 'github-actions',
        target: 'ubuntu-22-04',
        type: 'co-occurs-with',
        strength: 'soft',
      },
    ],
  },

  // 13. Trap with implicit mitigation
  {
    id: 'implicit-mitigation',
    input:
      'Memory leaks in long-running Node.js services can be detected using --inspect flag with Chrome DevTools. Profiling heap snapshots helps identify retained objects. Consider setting --max-old-space-size as a temporary workaround.',
    expectedNodes: [
      { kind: 'trap', label: 'nodejs-memory-leak' },
      { kind: 'tool', label: 'nodejs' },
      { kind: 'cue', label: 'heap-snapshot' },
      { kind: 'mitigation', label: 'max-old-space-size' },
    ],
    expectedEdges: [
      { source: 'nodejs', target: 'nodejs-memory-leak', type: 'co-occurs-with', strength: 'soft' },
      {
        source: 'max-old-space-size',
        target: 'nodejs-memory-leak',
        type: 'mitigates',
        strength: 'soft',
      },
      {
        source: 'heap-snapshot',
        target: 'nodejs-memory-leak',
        type: 'co-occurs-with',
        strength: 'soft',
      },
    ],
  },

  // 14. Simple mitigation-only entry
  {
    id: 'simple-mitigation',
    input:
      'If your SSH connection drops during a long deployment, use tmux or screen to keep the session alive.',
    expectedNodes: [
      { kind: 'cue', label: 'ssh-connection-drop' },
      { kind: 'tool', label: 'tmux' },
      { kind: 'tool', label: 'screen' },
    ],
    expectedEdges: [
      { source: 'tmux', target: 'ssh-connection-drop', type: 'mitigates', strength: 'hard' },
      { source: 'screen', target: 'ssh-connection-drop', type: 'mitigates', strength: 'hard' },
    ],
  },

  // 15. Negation with positive content
  {
    id: 'negation-with-positive',
    input:
      'Unlike REST APIs, GraphQL does not require versioning. The schema evolves through deprecation. Apollo Server is the recommended implementation for Node.js.',
    expectedNodes: [
      { kind: 'tool', label: 'graphql' },
      { kind: 'tool', label: 'apollo-server' },
      { kind: 'tool', label: 'nodejs' },
    ],
    expectedEdges: [
      { source: 'apollo-server', target: 'graphql', type: 'co-occurs-with', strength: 'soft' },
      { source: 'apollo-server', target: 'nodejs', type: 'requires', strength: 'hard' },
    ],
  },

  // 16. Complex prerequisite chain
  {
    id: 'prerequisite-chain',
    input:
      'To deploy the application: 1) Install Docker and docker-compose, 2) Copy .env.example to .env and fill in secrets, 3) Run docker-compose build, 4) Run docker-compose up. AWS credentials are needed for S3 uploads.',
    expectedNodes: [
      { kind: 'prerequisite', label: 'docker' },
      { kind: 'prerequisite', label: 'docker-compose' },
      { kind: 'tool', label: 'aws' },
      { kind: 'skill', label: 'application-deployment' },
    ],
    expectedEdges: [
      { source: 'docker-compose', target: 'docker', type: 'requires', strength: 'hard' },
      { source: 'application-deployment', target: 'docker', type: 'requires', strength: 'hard' },
      {
        source: 'application-deployment',
        target: 'docker-compose',
        type: 'requires',
        strength: 'hard',
      },
    ],
  },

  // 17. Edge case: minimal text
  {
    id: 'minimal-text',
    input: 'Use npm to install dependencies.',
    expectedNodes: [{ kind: 'tool', label: 'npm' }],
    expectedEdges: [],
  },
];

// ---------------------------------------------------------------------------
// Canonical label alignment fixtures
// ---------------------------------------------------------------------------

/**
 * Fixtures for testing canonical label alignment.
 * These fixtures test that semantically equivalent labels resolve to one canonical label.
 */
export const canonicalLabelFixtures: GraphExtractionFixture[] = [
  {
    id: 'canonical-cue-timeout-issue-vs-pod-timeout',
    input:
      'Kubernetes pods fail readiness because the pod startup timeout is too short. ' +
      'The container receives SIGTERM after the readiness probe exceeds the timeout threshold.',
    expectedNodes: [
      { kind: 'cue', label: 'pod-timeout' },
      { kind: 'tool', label: 'kubernetes' },
    ],
    expectedEdges: [
      { source: 'kubernetes', target: 'pod-timeout', type: 'co-occurs-with', strength: 'soft' },
    ],
  },
  {
    id: 'canonical-multilingual-alias',
    input:
      'The deployment fails with "CrashLoopBackOff" status. ' +
      'Pod restarts occur repeatedly because the application crashes on startup.',
    expectedNodes: [
      { kind: 'cue', label: 'crashloopbackoff' },
      { kind: 'trap', label: 'startup-crash' },
    ],
    expectedEdges: [
      {
        source: 'crashloopbackoff',
        target: 'startup-crash',
        type: 'co-occurs-with',
        strength: 'soft',
      },
    ],
  },
  {
    id: 'canonical-near-miss-false-positive',
    input:
      'Memory leak in the connection pool causes gradual OOM. ' +
      'The issue is unrelated to CPU throttling or disk I/O bottlenecks.',
    expectedNodes: [
      { kind: 'trap', label: 'memory-leak' },
      { kind: 'cue', label: 'oom' },
    ],
    expectedEdges: [
      { source: 'oom', target: 'memory-leak', type: 'co-occurs-with', strength: 'soft' },
    ],
  },
];

/**
 * All graph extraction fixtures: hand-crafted + real-skill + canonical-label.
 */
export const graphExtractionFixtures: GraphExtractionFixture[] = [
  ...handCraftedFixtures,
  ...realSkillGraphFixtures,
  ...canonicalLabelFixtures,
];

/**
 * Get a subset of fixtures for smoke tests (first 5 hand-crafted entries).
 */
export function getSmokeFixtures(): GraphExtractionFixture[] {
  return handCraftedFixtures.slice(0, 5);
}
