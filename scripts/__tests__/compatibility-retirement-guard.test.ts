import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');

const COMPATIBILITY_SYMBOLS = [
  '@trapmap/server',
  '@trapmap/runtime-infra',
  'store_snapshot',
  'JsonStore',
  'PostgresStore',
] as const;

type CompatibilitySymbol = (typeof COMPATIBILITY_SYMBOLS)[number];
type OwnerWave =
  | 'wave-1'
  | 'wave-2'
  | 'wave-3'
  | 'wave-4'
  | 'wave-5'
  | 'wave-6'
  | 'wave-7'
  | 'wave-8'
  | 'wave-9'
  | 'wave-10';
const OWNER_WAVES: OwnerWave[] = [
  'wave-1',
  'wave-2',
  'wave-3',
  'wave-4',
  'wave-5',
  'wave-6',
  'wave-7',
  'wave-8',
  'wave-9',
  'wave-10',
];

interface AllowlistEntry {
  file: string;
  symbol: CompatibilitySymbol;
  ownerWave: OwnerWave;
  rationale: string;
}

const completedOwnerWaves: OwnerWave[] = [
  'wave-1',
  'wave-2',
  'wave-3',
  'wave-4',
  'wave-6',
  'wave-7',
  'wave-9',
];
const POSTGRES_COMPOSITION_ENTRYPOINTS = [
  'evals/retrieval-live/lib/snapshot-orchestrator.ts',
] as const;
const OWNER_LOCAL_POSTGRES_ENTRYPOINTS = ['scripts/test-skill-import-export.ts'] as const;
const RETIRED_WAVE_9_LEGACY_TESTS = [
  'packages/server/src/lib/artifacts/demo-acceptance.test.ts',
  'packages/server/src/lib/retrieval-workflow.test.ts',
  'packages/server/src/routes/retrieval.test.ts',
] as const;
const RETIRED_WAVE_1_OWNER_SYMBOLS = [
  'createSessionRepository',
  'createAccessKeyRepository',
  'createTeamRepository',
  'createMembershipRepository',
  'createUserRepository',
  'createAuditRepository',
  'createPgAccessKeyRepo',
  'createPgTeamRepo',
  'createPgMembershipRepo',
  'createPgUserRepo',
  'createPgAuditRepo',
] as const;
const RETIRED_WAVE_2_ARTIFACT_SYMBOLS = [
  'createArtifactRepository',
  'PgArtifactRepository',
  'artifactRepo',
] as const;
const WAVE_2_ARTIFACT_SCAN_ROOTS = [
  'packages/server/src',
  'packages/runtime-infra/src',
  'packages/host-local/src',
  'packages/host-distributed/src',
  'packages/worker/src',
] as const;
const WAVE_2_ARTIFACT_ALLOWLIST = new Set([
  'packages/server/src/lib/persistence/migrate-artifacts.ts',
]);
const RETIRED_WAVE_2_KNOWLEDGE_SYMBOLS = [
  'createKnowledgeRepository',
  'PgKnowledgeRepository',
  'KnowledgeRepository',
  'emitLifecycleTransition',
  'createLifecyclePublisher',
  'createLabelRepository',
] as const;
const WAVE_2_KNOWLEDGE_SCAN_ROOTS = [
  'packages/server/src',
  'packages/runtime-infra/src',
  'packages/host-local/src',
  'packages/host-distributed/src',
  'packages/worker/src',
] as const;
const RETIRED_WAVE_4_PATHS = [
  'packages/server/src/routes/feedback.ts',
  'packages/server/src/routes/feedback-admin.ts',
  'packages/server/src/routes/feedback-admin',
  'packages/server/src/lib/feedback',
  'packages/server/src/lib/conflict',
  'packages/server/src/lib/lifecycle/subscribers/conflict.ts',
] as const;
const RETIRED_WAVE_4_SYMBOLS = [
  'createConflictRepository',
  'createFeedbackRepository',
  'createConflictSubscriber',
  'createRemediationReactivationHandler',
  'createBadcaseExportDraftHandler',
  'feedbackRoutes',
  'feedbackAdminRoutes',
  'ConflictRepository',
  'FeedbackRepository',
] as const;
const RETIRED_WAVE_4_BADCASE_EXPORT = 'scripts/export-badcase-to-eval.ts';
const RETIRED_WAVE_6_RUNTIME_INFRA_EXPORTS = [
  'createAsyncTransport',
  'createPostgresTaskTransport',
  'createPostgresEventTransport',
  'createTaskQueue',
  'createTaskWorker',
  'createDomainEventOutbox',
  'createRabbitMqTaskTransport',
] as const;
const RETIRED_WAVE_6_ASYNC_IMPLEMENTATIONS = [
  'packages/runtime-infra/src/async-factory.ts',
  'packages/runtime-infra/src/async-transport.ts',
  'packages/runtime-infra/src/task-queue.ts',
  'packages/runtime-infra/src/outbox.ts',
  'packages/runtime-infra/src/rabbitmq-task-queue.ts',
  'packages/runtime-infra/src/event-bus.ts',
  'packages/server/src/lib/async/factory.ts',
  'packages/server/src/lib/async/rabbitmq-task-queue.ts',
] as const;
const AI_PROVIDER_CONFIG_CONSUMERS = [
  'packages/host-local/src/nest/runtime/shared-infra.ts',
  'packages/server/src/app.ts',
  'packages/server/src/config.ts',
  'packages/server/src/lib/context.ts',
  'packages/server/src/lib/embeddings.ts',
  'packages/server/src/lib/indexing/pipeline.ts',
  'packages/server/src/lib/indexing/events.ts',
  'packages/server/src/lib/indexing/skill-events.ts',
  'packages/server/src/lib/indexing/artifact-pipeline.ts',
  'packages/server/src/lib/indexing/skill-graph-build.ts',
  'packages/server/src/lib/indexing/adapters/graph.ts',
  'packages/server/src/lib/indexing/adapters/artifact-graph.ts',
  'packages/server/src/lib/indexing/graph-lite/llm-extract.ts',
  'packages/server/src/lib/indexing/graph-lite/llm-extract-planning.ts',
  'packages/server/src/lib/pre-review.ts',
  'packages/server/src/lib/boundary-extract.ts',
  'packages/server/src/lib/artifacts/contextual-enrichment.ts',
  'packages/server/src/lib/artifacts/derive/types.ts',
  'packages/server/src/lib/labels/graph-align.ts',
  'packages/server/src/lib/labels/llm-align.ts',
  'packages/server/src/lib/labels/backfill.ts',
  'packages/server/src/lib/labels/candidate-recall.ts',
  'packages/server/src/lib/retrieval/capsules/intent.ts',
  'packages/server/src/testing/mock-factories.ts',
  'packages/server/src/lib/__tests__/types-export.test.ts',
  'packages/server/src/lib/labels/llm-align.test.ts',
  'packages/server/src/lib/boundary-extract.test.ts',
  'packages/server/src/lib/pre-review.test.ts',
  'packages/server/src/lib/artifacts/contextual-enrichment.test.ts',
  'packages/server/src/lib/indexing/graph-lite/llm-extract.test.ts',
  'scripts/label-runner.ts',
  'evals/label-alignment/lib/decision-eval.ts',
  'evals/label-alignment/lib/decision-eval.test.ts',
  'evals/graph-extraction/run.ts',
  'evals/graph-extraction/dedup-eval.ts',
  'evals/graph-extraction/conflict-eval.ts',
] as const;
const SERVER_AI_PROVIDER_CONFIG_IMPORT =
  /(?:@trapmap\/server\/lib\/ai|(?:\.\.\/)+packages\/server\/src\/lib\/ai|\.\/ai)\/(?:index|types|providers|provider-config)\.js/;
const allowlist: AllowlistEntry[] = [
  [
    'scripts/label-runner.ts',
    '@trapmap/server',
    'wave-10',
    'temporary compatibility label catalog core composition',
  ],
  [
    'packages/server/Dockerfile',
    '@trapmap/server',
    'wave-10',
    'compatibility image self-reference',
  ],
].map(([file, symbol, ownerWave, rationale]) => ({
  file,
  symbol: symbol as CompatibilitySymbol,
  ownerWave: ownerWave as OwnerWave,
  rationale,
}));

const CANDIDATE_INGESTION_SCAN_ROOTS = [
  'packages/service-candidate-ingestion/src',
  'packages/host-distributed/src/candidate-ingestion',
  'packages/host-local/src/nest/candidate-ingestion',
] as const;

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function isProductionFile(root: string, file: string): boolean {
  const path = relative(root, file);
  if (/(^|\/)(__fixtures__|fixtures)(\/|$)/.test(path)) return false;
  if (/(^|\/)testing(\/|$)/.test(path)) return false;
  if (/\.(test|spec)\.[cm]?tsx?$/.test(path)) return false;

  return /^(packages\/[^/]+\/src\/.*\.[cm]?tsx?|scripts\/.*\.[cm]?tsx?|packages\/[^/]+\/Dockerfile[^/]*|package\.json|packages\/[^/]+\/package\.json)$/.test(
    path,
  );
}

function hasSymbol(content: string, symbol: CompatibilitySymbol): boolean {
  return content.includes(symbol);
}

function symbolsInFile(root: string, file: string): CompatibilitySymbol[] {
  const relativeFile = relative(root, file);
  if (relativeFile.endsWith('.d.ts')) return [];

  const content = readFileSync(file, 'utf8');
  if (relativeFile.endsWith('package.json')) {
    const manifest = JSON.parse(content) as Record<string, Record<string, string> | undefined>;
    const dependencyNames = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.devDependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ];
    return COMPATIBILITY_SYMBOLS.filter((symbol) => dependencyNames.includes(symbol));
  }

  return COMPATIBILITY_SYMBOLS.filter((symbol) => {
    if (symbol === '@trapmap/server' && relativeFile.startsWith('packages/server/src/')) {
      return false;
    }
    if (
      symbol === '@trapmap/runtime-infra' &&
      relativeFile.startsWith('packages/runtime-infra/src/')
    ) {
      return false;
    }
    return hasSymbol(content, symbol);
  });
}

function findCompatibilityDependencies(root: string): AllowlistEntry[] {
  return [
    join(root, 'package.json'),
    ...listFiles(join(root, 'packages')),
    ...listFiles(join(root, 'scripts')),
  ]
    .filter((file) => existsSync(file) && isProductionFile(root, file))
    .flatMap((file) => {
      const relativeFile = relative(root, file);

      return symbolsInFile(root, file).map((symbol) => ({
        file: relativeFile,
        symbol,
        ownerWave: 'wave-10' as const,
        rationale: '',
      }));
    });
}

function findCandidateIngestionCompatibilityImports(root: string): string[] {
  return CANDIDATE_INGESTION_SCAN_ROOTS.flatMap((scanRoot) =>
    listFiles(join(root, scanRoot)).flatMap((file) => {
      if (!isProductionFile(root, file)) return [];
      const content = readFileSync(file, 'utf8');
      return ['@trapmap/server', '@trapmap/runtime-infra']
        .filter((dependency) => content.includes(dependency))
        .map((dependency) => `${relative(root, file)}:${dependency}`);
    }),
  );
}

function validateAllowlistEntry(entry: AllowlistEntry, actualKeys: Set<string>): string[] {
  const key = `${entry.file}:${entry.symbol}`;
  const checks: Array<[boolean, string]> = [
    [
      !COMPATIBILITY_SYMBOLS.includes(entry.symbol),
      `allowlist entry ${key} uses an unsupported symbol`,
    ],
    [
      !OWNER_WAVES.includes(entry.ownerWave),
      `allowlist entry ${key} has an unsupported owner wave`,
    ],
    [!entry.ownerWave, `allowlist entry ${key} has no owner wave`],
    [!entry.rationale, `allowlist entry ${key} has no rationale`],
    [!actualKeys.has(key), `allowlist entry ${key} no longer matches a production dependency`],
    [
      completedOwnerWaves.includes(entry.ownerWave),
      `allowlist entry ${key} belongs to completed ${entry.ownerWave}`,
    ],
  ];

  return checks.filter(([failed]) => failed).map(([, message]) => message);
}

function validateAllowlist(root: string, entries: AllowlistEntry[]): string[] {
  const actualKeys = new Set(
    findCompatibilityDependencies(root).map((entry) => `${entry.file}:${entry.symbol}`),
  );
  const allowedKeys = new Set(entries.map((entry) => `${entry.file}:${entry.symbol}`));
  const invalidEntries = entries.flatMap((entry) => validateAllowlistEntry(entry, actualKeys));
  const unregistered = [...actualKeys]
    .filter((key) => !allowedKeys.has(key))
    .map((key) => `unregistered compatibility dependency: ${key}`);

  return [...invalidEntries, ...unregistered];
}

function findRetiredOwnerSymbols(
  root: string,
  ownerRoots: readonly string[],
  symbols: readonly string[],
  messagePrefix: string,
): string[] {
  return ownerRoots.flatMap((ownerRoot) =>
    listFiles(join(root, ownerRoot)).flatMap((file) => {
      if (!isProductionFile(root, file)) return [];
      const content = readFileSync(file, 'utf8');
      return symbols
        .filter((symbol) => content.includes(symbol))
        .map((symbol) => `${messagePrefix}: ${relative(root, file)}:${symbol}`);
    }),
  );
}

function findRetiredWaveOneOwners(root: string): string[] {
  return findRetiredOwnerSymbols(
    root,
    ['packages/server/src', 'packages/runtime-infra/src', 'packages/host-distributed/src/shared'],
    RETIRED_WAVE_1_OWNER_SYMBOLS,
    'retired wave-1 identity owner',
  );
}

function findRetiredWaveTwoArtifactOwners(root: string): string[] {
  return WAVE_2_ARTIFACT_SCAN_ROOTS.flatMap((ownerRoot) =>
    listFiles(join(root, ownerRoot)).flatMap((file) => {
      if (!isProductionFile(root, file)) return [];
      const relativeFile = relative(root, file);
      if (WAVE_2_ARTIFACT_ALLOWLIST.has(relativeFile)) return [];
      const content = readFileSync(file, 'utf8');
      const patterns = [
        /\bimport\s+[^;]*\bcreateArtifactRepository\b/,
        /\bimport\s+[^;]*\bPgArtifactRepository\b/,
        /\bnew\s+PgArtifactRepository\b/,
        /\bartifactRepo\s*[:?]/,
      ];
      return patterns
        .filter((pattern) => pattern.test(content))
        .map((pattern) => `retired wave-2 artifact owner: ${relativeFile}:${pattern}`);
    }),
  );
}

function findRetiredWaveTwoKnowledgeOwners(root: string): string[] {
  return findRetiredOwnerSymbols(
    root,
    WAVE_2_KNOWLEDGE_SCAN_ROOTS,
    RETIRED_WAVE_2_KNOWLEDGE_SYMBOLS,
    'retired wave-2 knowledge owner',
  );
}

function findRetiredWaveFourCompatibilitySurfaces(root: string): string[] {
  const pathViolations = RETIRED_WAVE_4_PATHS.filter((path) => existsSync(join(root, path))).map(
    (path) => `retired wave-4 compatibility path: ${path}`,
  );
  const symbolViolations = listFiles(join(root, 'packages/server/src')).flatMap((file) => {
    if (!isProductionFile(root, file)) return [];
    const content = readFileSync(file, 'utf8');
    return RETIRED_WAVE_4_SYMBOLS.filter((symbol) => content.includes(symbol)).map(
      (symbol) => `retired wave-4 compatibility symbol: ${relative(root, file)}:${symbol}`,
    );
  });
  return [...pathViolations, ...symbolViolations];
}

function findRetiredWaveFourRuntimeAggregateMembers(root: string): string[] {
  const file = join(root, 'packages/runtime-infra/src/repos.ts');
  if (!existsSync(file)) return [];
  const content = readFileSync(file, 'utf8');
  return [
    [/createConflictRepository/, 'retired wave-4 runtime aggregate member: conflict'],
    [/createFeedbackRepository/, 'retired wave-4 runtime aggregate member: feedback'],
  ]
    .filter(([pattern]) => (pattern as RegExp).test(content))
    .map(([, message]) => message as string);
}

function findRetiredWaveFourBadcaseBoundaryViolations(root: string): string[] {
  const file = join(root, RETIRED_WAVE_4_BADCASE_EXPORT);
  if (!existsSync(file)) return [];
  const content = readFileSync(file, 'utf8');
  return content.includes('@trapmap/server')
    ? [`retired wave-4 badcase boundary: ${RETIRED_WAVE_4_BADCASE_EXPORT}:@trapmap/server`]
    : [];
}

function findRetiredWaveSixAsyncCompatibility(root: string): string[] {
  const index = join(root, 'packages/runtime-infra/src/index.ts');
  const indexViolations = existsSync(index)
    ? RETIRED_WAVE_6_RUNTIME_INFRA_EXPORTS.filter((symbol) =>
        readFileSync(index, 'utf8').includes(symbol),
      ).map((symbol) => `retired wave-6 runtime-infra async export: ${symbol}`)
    : [];
  const lifecycle = join(root, 'packages/server/src/bootstrap/bootstrap-lifecycle.ts');
  const lifecycleViolations = existsSync(lifecycle)
    ? ['createTaskQueue(', 'createDomainEventOutbox(', 'store.snapshot(']
        .filter((symbol) => readFileSync(lifecycle, 'utf8').includes(symbol))
        .map((symbol) => `retired wave-6 server lifecycle compatibility: ${symbol}`)
    : [];
  const implementationViolations = RETIRED_WAVE_6_ASYNC_IMPLEMENTATIONS.filter((path) =>
    existsSync(join(root, path)),
  ).map((path) => `retired wave-6 async implementation: ${path}`);
  return [...indexViolations, ...lifecycleViolations, ...implementationViolations];
}

function findArtifactReadProjectionBoundaryViolations(root: string): string[] {
  const violations: string[] = [];
  const contractPort = 'packages/contracts/src/domain/artifact-ports.ts';
  const contractsIndex = 'packages/contracts/src/index.ts';
  const backendPort = 'packages/backend-core/src/ports/artifact-ports.ts';

  if (!existsSync(join(root, contractPort))) {
    violations.push(`missing shared artifact read port: ${contractPort}`);
  }
  if (!readFileSync(join(root, contractsIndex), 'utf8').includes('./domain/artifact-ports.js')) {
    violations.push(`contracts root does not export artifact read port: ${contractsIndex}`);
  }
  if (existsSync(join(root, backendPort))) {
    violations.push(`backend-core retains artifact read port: ${backendPort}`);
  }

  for (const ownerRoot of WAVE_2_ARTIFACT_SCAN_ROOTS) {
    for (const file of listFiles(join(root, ownerRoot))) {
      if (!isProductionFile(root, file)) continue;
      const content = readFileSync(file, 'utf8');
      if (content.includes("ArtifactReadProjection } from '@trapmap/backend-core'")) {
        violations.push(
          `artifact read projection crosses backend-core boundary: ${relative(root, file)}`,
        );
      }
    }
  }
  return violations;
}

describe('compatibility retirement guard', () => {
  it('requires provider and configuration consumers to use the shared AI provider package', () => {
    const violations = AI_PROVIDER_CONFIG_CONSUMERS.flatMap((file) => {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      return SERVER_AI_PROVIDER_CONFIG_IMPORT.test(source) ? [file] : [];
    });

    expect(violations).toEqual([]);
  });

  it('retires server AI provider compatibility modules and host-local provider imports', () => {
    for (const retiredPath of [
      'packages/server/src/lib/ai/types.ts',
      'packages/server/src/lib/ai/provider-config.ts',
      'packages/server/src/lib/ai/providers.ts',
      'packages/host-local/src/nest/config/ai-provider-config.ts',
    ]) {
      expect(existsSync(resolve(repoRoot, retiredPath))).toBe(false);
    }

    const hostSharedInfra = readFileSync(
      resolve(repoRoot, 'packages/host-local/src/nest/runtime/shared-infra.ts'),
      'utf8',
    );
    expect(hostSharedInfra).not.toContain('@trapmap/server/lib/ai');
  });

  it('retires legacy store-backed server acceptance fixtures', () => {
    for (const retiredPath of RETIRED_WAVE_9_LEGACY_TESTS) {
      expect(existsSync(resolve(repoRoot, retiredPath))).toBe(false);
    }
  });

  it('keeps Wave-8 host composition as the sole server factory path for migrated entrypoints', () => {
    for (const file of POSTGRES_COMPOSITION_ENTRYPOINTS) {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      expect(source).toContain('buildPostgresComposedServer');
      expect(source).not.toMatch(/\bbuildServer\s*\(/);
    }
  });

  it('requires owner-local PostgreSQL tooling to avoid compatibility server composition', () => {
    for (const file of OWNER_LOCAL_POSTGRES_ENTRYPOINTS) {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      expect(source).toContain('createArtifactBundleImportPort');
      expect(source).toContain('createArtifactReadProjection');
      expect(source).not.toContain('buildPostgresComposedServer');
      expect(source).not.toContain('@trapmap/server');
    }
  });

  function writeProductionFile(root: string, relativePath: string, content: string): void {
    const file = join(root, relativePath);
    mkdirSync(resolve(file, '..'), { recursive: true });
    writeFileSync(file, content);
  }

  it('rejects an unregistered production compatibility dependency', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(root, 'packages/example/src/runtime.ts', "import '@trapmap/server';");

    expect(validateAllowlist(root, [])).toEqual([
      'unregistered compatibility dependency: packages/example/src/runtime.ts:@trapmap/server',
    ]);
  });

  it('ignores compatibility references in tests and fixtures', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(root, 'packages/example/src/runtime.test.ts', "import '@trapmap/server';");
    writeProductionFile(
      root,
      'packages/example/src/fixtures/legacy.ts',
      'const store = new JsonStore();',
    );

    expect(validateAllowlist(root, [])).toEqual([]);
  });

  it('rejects retired Wave-1 identity owners in compatibility surfaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(
      root,
      'packages/runtime-infra/src/repos.ts',
      'export const createSessionRepository = () => ({});',
    );

    expect(findRetiredWaveOneOwners(root)).toEqual([
      'retired wave-1 identity owner: packages/runtime-infra/src/repos.ts:createSessionRepository',
    ]);
  });

  it('has no retired Wave-1 identity owners in production code', () => {
    expect(findRetiredWaveOneOwners(repoRoot)).toEqual([]);
  });

  it('rejects retired Wave-2 artifact owners in compatibility surfaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(
      root,
      'packages/runtime-infra/src/repos.ts',
      "import { createArtifactRepository } from './legacy.js'; export const artifactRepo: unknown = createArtifactRepository();",
    );

    expect(findRetiredWaveTwoArtifactOwners(root)).toHaveLength(2);
  });

  it('has no retired Wave-2 artifact owners in production code', () => {
    expect(findRetiredWaveTwoArtifactOwners(repoRoot)).toEqual([]);
  });

  it('rejects retired Wave-2 knowledge owners in compatibility surfaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(
      root,
      'packages/server/src/routes/knowledge.ts',
      "import { createKnowledgeRepository } from '@trapmap/server/lib/knowledge';",
    );

    expect(findRetiredWaveTwoKnowledgeOwners(root)).toEqual([
      'retired wave-2 knowledge owner: packages/server/src/routes/knowledge.ts:createKnowledgeRepository',
      'retired wave-2 knowledge owner: packages/server/src/routes/knowledge.ts:KnowledgeRepository',
    ]);
  });

  it('has no Wave-3 candidate ownership exceptions', () => {
    expect(allowlist.filter((entry) => entry.ownerWave === 'wave-3')).toEqual([]);
  });

  it('has retired the server candidate, duplicate, and lineage implementations', () => {
    for (const path of [
      'packages/server/src/lib/candidates',
      'packages/server/src/lib/duplicates',
      'packages/server/src/lib/lineage',
      'packages/server/src/routes/candidates',
      'packages/server/src/bootstrap/bootstrap-candidate-recovery.ts',
    ]) {
      expect(existsSync(join(repoRoot, path))).toBe(false);
    }
  });

  it('rejects candidate-ingestion imports from compatibility packages', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-candidate-guard-'));
    writeProductionFile(
      root,
      'packages/service-candidate-ingestion/src/server.ts',
      "import '@trapmap/server';\nimport '@trapmap/runtime-infra';",
    );

    expect(findCandidateIngestionCompatibilityImports(root)).toEqual([
      'packages/service-candidate-ingestion/src/server.ts:@trapmap/server',
      'packages/service-candidate-ingestion/src/server.ts:@trapmap/runtime-infra',
    ]);
  });

  it('has no candidate-ingestion imports from compatibility packages', () => {
    expect(findCandidateIngestionCompatibilityImports(repoRoot)).toEqual([]);
  });

  it('has no retired Wave-2 knowledge owners in production code', () => {
    expect(findRetiredWaveTwoKnowledgeOwners(repoRoot)).toEqual([]);
  });

  it('keeps the artifact read projection in shared contracts', () => {
    expect(findArtifactReadProjectionBoundaryViolations(repoRoot)).toEqual([]);
  });

  it('keeps legacy artifact persistence outside the server compatibility shell', () => {
    expect(existsSync(join(repoRoot, 'packages/server/src/lib/artifacts/repository.ts'))).toBe(
      false,
    );
    expect(existsSync(join(repoRoot, 'packages/server/src/lib/artifacts/pg-repository.ts'))).toBe(
      false,
    );
    expect(
      existsSync(join(repoRoot, 'packages/server/src/lib/persistence/migrate-artifacts.ts')),
    ).toBe(false);
    expect(
      existsSync(join(repoRoot, 'packages/service-knowledge-write/src/wave9-artifact-backfill.ts')),
    ).toBe(true);
  });

  it('retires unconsumed compatibility maintenance and decay mutation helpers', () => {
    for (const path of [
      'packages/server/src/lib/maintenance/batch.ts',
      'packages/server/src/lib/decay/batch.ts',
      'packages/server/src/lib/decay/supersede.ts',
    ]) {
      expect(existsSync(join(repoRoot, path))).toBe(false);
    }
  });

  it('retires store-backed label runner entrypoints', () => {
    for (const path of [
      'packages/server/src/lib/labels/backfill-runner.ts',
      'packages/server/src/lib/labels/merge-repair-runner.ts',
      'packages/server/src/lib/labels/runner-helpers.ts',
    ]) {
      expect(existsSync(join(repoRoot, path))).toBe(false);
    }
    for (const path of [
      'scripts/backfill-labels.ts',
      'scripts/repair-label-merges.ts',
      'scripts/label-runner.ts',
    ]) {
      expect(existsSync(join(repoRoot, path))).toBe(true);
    }
  });

  it('retires the unconsumed compatibility artifact serializer aggregate', () => {
    for (const path of [
      'packages/server/src/lib/artifacts/index.ts',
      'packages/server/src/lib/artifacts/model.test.ts',
      'packages/server/src/lib/artifacts/model.ts',
      'packages/server/src/lib/artifacts/model/helpers.ts',
      'packages/server/src/lib/artifacts/model/index.ts',
      'packages/server/src/lib/artifacts/model/serialize.ts',
    ]) {
      expect(existsSync(join(repoRoot, path))).toBe(false);
    }
  });

  it('retires the compatibility graph repository aggregate', () => {
    for (const path of [
      'packages/server/src/lib/graph-index/index.ts',
      'packages/server/src/lib/graph-index/repository.ts',
      'packages/server/src/lib/graph-index/repository.test.ts',
    ]) {
      expect(existsSync(join(repoRoot, path))).toBe(false);
    }
  });

  it('retires the compatibility server graph-startup benchmark', () => {
    expect(existsSync(join(repoRoot, 'packages/server/scripts/benchmark-graph-backend.ts'))).toBe(
      false,
    );
  });

  it('retires the completed Task-9 legacy snapshot command surface', () => {
    for (const path of [
      'scripts/backfill-legacy-snapshot.ts',
      'scripts/legacy-snapshot-backfill.ts',
      'scripts/legacy-snapshot-owner-wiring.ts',
      'scripts/legacy-snapshot-source.ts',
    ]) {
      expect(existsSync(join(repoRoot, path))).toBe(false);
    }
    const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts['backfill:legacy-snapshot']).toBeUndefined();
  });

  it('rejects retired Wave-4 server compatibility surfaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(
      root,
      'packages/server/src/routes/feedback.ts',
      'export const route = true;',
    );
    writeProductionFile(
      root,
      'packages/server/src/lib/feedback/repository.ts',
      'export function createFeedbackRepository() {}',
    );

    expect(findRetiredWaveFourCompatibilitySurfaces(root)).toEqual([
      'retired wave-4 compatibility path: packages/server/src/routes/feedback.ts',
      'retired wave-4 compatibility path: packages/server/src/lib/feedback',
      'retired wave-4 compatibility symbol: packages/server/src/lib/feedback/repository.ts:createFeedbackRepository',
      'retired wave-4 compatibility symbol: packages/server/src/lib/feedback/repository.ts:FeedbackRepository',
    ]);
  });

  it('has no retired Wave-4 server compatibility surfaces', () => {
    expect(findRetiredWaveFourCompatibilitySurfaces(repoRoot)).toEqual([]);
  });

  it('rejects Wave-4 members from the runtime-infra repository aggregate', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(
      root,
      'packages/runtime-infra/src/repos.ts',
      'import { createConflictRepository, createFeedbackRepository } from "legacy";',
    );

    expect(findRetiredWaveFourRuntimeAggregateMembers(root)).toEqual([
      'retired wave-4 runtime aggregate member: conflict',
      'retired wave-4 runtime aggregate member: feedback',
    ]);
  });

  it('has no Wave-4 members in the runtime-infra repository aggregate', () => {
    expect(findRetiredWaveFourRuntimeAggregateMembers(repoRoot)).toEqual([]);
  });

  it('marks Wave-4 complete only after its production compatibility scan is empty', () => {
    expect(findRetiredWaveFourCompatibilitySurfaces(repoRoot)).toEqual([]);
    expect(findRetiredWaveFourRuntimeAggregateMembers(repoRoot)).toEqual([]);
    expect(findRetiredWaveFourBadcaseBoundaryViolations(repoRoot)).toEqual([]);
    expect(completedOwnerWaves).toContain('wave-4');
  });

  it('rejects server-owned remediation and badcase handlers', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(
      root,
      'packages/server/src/lib/jobs/index.ts',
      'export { createRemediationReactivationHandler, createBadcaseExportDraftHandler };',
    );

    expect(findRetiredWaveFourCompatibilitySurfaces(root)).toEqual([
      'retired wave-4 compatibility symbol: packages/server/src/lib/jobs/index.ts:createRemediationReactivationHandler',
      'retired wave-4 compatibility symbol: packages/server/src/lib/jobs/index.ts:createBadcaseExportDraftHandler',
    ]);
  });

  it('rejects the server boundary from badcase export', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(
      root,
      RETIRED_WAVE_4_BADCASE_EXPORT,
      "import { loadConfig } from '@trapmap/server/config.js';",
    );

    expect(findRetiredWaveFourBadcaseBoundaryViolations(root)).toEqual([
      'retired wave-4 badcase boundary: scripts/export-badcase-to-eval.ts:@trapmap/server',
    ]);
  });

  it('has no server-owned remediation or badcase handlers', () => {
    expect(findRetiredWaveFourCompatibilitySurfaces(repoRoot)).toEqual([]);
  });

  it('has no server boundary from badcase export', () => {
    expect(findRetiredWaveFourBadcaseBoundaryViolations(repoRoot)).toEqual([]);
  });

  it('keeps wave-6 async exports and lifecycle compatibility wiring retired', () => {
    expect(findRetiredWaveSixAsyncCompatibility(repoRoot)).toEqual([]);
    expect(completedOwnerWaves).toContain('wave-6');
  });

  it('marks Wave-7 complete after its read-service compatibility imports are retired', () => {
    expect(completedOwnerWaves).toContain('wave-7');
  });

  it('rejects retired Wave-6 async implementation files', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(
      root,
      'packages/runtime-infra/src/async-factory.ts',
      'export const legacy = true;',
    );
    writeProductionFile(
      root,
      'packages/server/src/lib/async/factory.ts',
      'export const legacy = true;',
    );

    expect(findRetiredWaveSixAsyncCompatibility(root)).toEqual([
      'retired wave-6 async implementation: packages/runtime-infra/src/async-factory.ts',
      'retired wave-6 async implementation: packages/server/src/lib/async/factory.ts',
    ]);
  });

  it('requires a real file, supported symbol, owner wave, and rationale for each exception', () => {
    const root = mkdtempSync(join(tmpdir(), 'trapmap-compatibility-guard-'));
    writeProductionFile(root, 'packages/example/src/runtime.ts', "import '@trapmap/server';");
    const invalid = {
      file: 'packages/example/src/missing.ts',
      symbol: 'UnknownStore',
      ownerWave: 'wave-11',
      rationale: '',
    } as unknown as AllowlistEntry;

    expect(validateAllowlist(root, [invalid])).toEqual(
      expect.arrayContaining([
        'allowlist entry packages/example/src/missing.ts:UnknownStore uses an unsupported symbol',
        'allowlist entry packages/example/src/missing.ts:UnknownStore has an unsupported owner wave',
        'allowlist entry packages/example/src/missing.ts:UnknownStore has no rationale',
        'allowlist entry packages/example/src/missing.ts:UnknownStore no longer matches a production dependency',
        'unregistered compatibility dependency: packages/example/src/runtime.ts:@trapmap/server',
      ]),
    );
  });

  it('registers every current production compatibility dependency for deletion', () => {
    expect(validateAllowlist(repoRoot, allowlist)).toEqual([]);
  });
});
