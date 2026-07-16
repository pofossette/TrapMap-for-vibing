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

const completedOwnerWaves: OwnerWave[] = ['wave-1'];
const POSTGRES_COMPOSITION_ENTRYPOINTS = [
  'scripts/export-retrieval-db-snapshot.ts',
  'evals/retrieval-live/lib/snapshot-orchestrator.ts',
  'packages/server/scripts/benchmark-graph-backend.ts',
  'scripts/test-skill-import-export.ts',
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
const allowlist: AllowlistEntry[] = [
  ['package.json', '@trapmap/server', 'wave-10', 'root development dependency'],
  [
    'packages/backend-core/src/runtime/capability-model.ts',
    'JsonStore',
    'wave-9',
    'legacy capability taxonomy',
  ],
  [
    'packages/host-distributed/src/gateway/server.ts',
    '@trapmap/server',
    'wave-8',
    'gateway request context',
  ],
  [
    'packages/host-local/package.json',
    '@trapmap/runtime-infra',
    'wave-8',
    'local host composition dependency',
  ],
  [
    'packages/host-local/src/nest/config/config.ts',
    'JsonStore',
    'wave-8',
    'local host capability config',
  ],
  [
    'packages/host-local/src/nest/runtime/shared-infra.ts',
    '@trapmap/runtime-infra',
    'wave-8',
    'local host shared infrastructure',
  ],
  [
    'packages/host-local/src/nest/runtime/host-services.ts',
    '@trapmap/runtime-infra',
    'wave-8',
    'local host PostgreSQL pool seam',
  ],
  [
    'packages/host-local/src/nest/runtime/server-composition.ts',
    '@trapmap/server',
    'wave-8',
    'local host compatibility-shell composition',
  ],
  [
    'packages/host-local/src/nest/runtime/server-composition.ts',
    '@trapmap/runtime-infra',
    'wave-8',
    'local host PostgreSQL pool ownership',
  ],
  [
    'packages/runtime-infra/package.json',
    '@trapmap/server',
    'wave-10',
    'compatibility package dependency',
  ],
  ['packages/runtime-infra/src/index.ts', 'JsonStore', 'wave-9', 'legacy store export'],
  ['packages/runtime-infra/src/index.ts', 'PostgresStore', 'wave-9', 'legacy store export'],
  [
    'packages/runtime-infra/src/knowledge-read-retrieval-infra.ts',
    '@trapmap/server',
    'wave-7',
    'knowledge-read infrastructure',
  ],
  [
    'packages/runtime-infra/src/knowledge-read-support-infra.ts',
    '@trapmap/server',
    'wave-7',
    'knowledge-read infrastructure',
  ],
  [
    'packages/runtime-infra/src/postgres-store.ts',
    'store_snapshot',
    'wave-9',
    'legacy snapshot persistence',
  ],
  [
    'packages/runtime-infra/src/postgres-store.ts',
    'PostgresStore',
    'wave-9',
    'legacy snapshot persistence',
  ],
  [
    'packages/runtime-infra/src/repos.ts',
    '@trapmap/server',
    'wave-10',
    'compatibility repository aggregate',
  ],
  [
    'packages/runtime-infra/src/shared-infra.ts',
    '@trapmap/server',
    'wave-10',
    'compatibility shared infrastructure',
  ],
  ['packages/runtime-infra/src/store-factory.ts', 'JsonStore', 'wave-9', 'legacy store factory'],
  [
    'packages/runtime-infra/src/store-factory.ts',
    'PostgresStore',
    'wave-9',
    'legacy store factory',
  ],
  [
    'packages/runtime-infra/src/store.ts',
    '@trapmap/server',
    'wave-9',
    'legacy store contract bridge',
  ],
  ['packages/runtime-infra/src/store.ts', 'JsonStore', 'wave-9', 'legacy JSON store export'],
  [
    'packages/server/Dockerfile',
    '@trapmap/server',
    'wave-10',
    'compatibility image self-reference',
  ],
  ['packages/server/src/config.ts', 'JsonStore', 'wave-8', 'compatibility runtime capability'],
  [
    'packages/server/src/lib/candidates/pg-repository/pg-candidate-repository.ts',
    'store_snapshot',
    'wave-3',
    'candidate snapshot note',
  ],
  [
    'packages/server/src/lib/candidates/processor.ts',
    'JsonStore',
    'wave-3',
    'candidate JSON fallback',
  ],
  [
    'packages/server/src/lib/candidates/repository.ts',
    'store_snapshot',
    'wave-3',
    'candidate snapshot fallback',
  ],
  [
    'packages/server/src/lib/candidates/repository.ts',
    'JsonStore',
    'wave-3',
    'candidate JSON fallback',
  ],
  [
    'packages/server/src/lib/feedback/pg-repository.ts',
    'store_snapshot',
    'wave-4',
    'governance snapshot note',
  ],
  [
    'packages/server/src/lib/labels/backfill-runner.ts',
    'PostgresStore',
    'wave-9',
    'migration export fixture',
  ],
  [
    'packages/server/src/lib/labels/merge-repair-runner.ts',
    'PostgresStore',
    'wave-9',
    'migration export fixture',
  ],
  [
    'packages/server/src/lib/lineage/pg-repository.ts',
    'store_snapshot',
    'wave-3',
    'lineage snapshot note',
  ],
  [
    'packages/server/src/lib/persistence/backfill-indexes.ts',
    'PostgresStore',
    'wave-9',
    'migration export fixture',
  ],
  [
    'packages/server/src/lib/persistence/create-store.ts',
    'JsonStore',
    'wave-9',
    'legacy store assembly',
  ],
  [
    'packages/server/src/lib/persistence/create-store.ts',
    'PostgresStore',
    'wave-9',
    'legacy store assembly',
  ],
  [
    'packages/server/src/lib/persistence/postgres-store.ts',
    'store_snapshot',
    'wave-9',
    'legacy snapshot persistence',
  ],
  [
    'packages/server/src/lib/persistence/postgres-store.ts',
    'JsonStore',
    'wave-9',
    'legacy store fallback',
  ],
  [
    'packages/server/src/lib/persistence/postgres-store.ts',
    'PostgresStore',
    'wave-9',
    'legacy snapshot persistence',
  ],
  [
    'packages/server/src/lib/persistence/schema/index.ts',
    'store_snapshot',
    'wave-9',
    'legacy snapshot schema export',
  ],
  [
    'packages/persistence-schema/src/candidates.ts',
    'store_snapshot',
    'wave-3',
    'candidate snapshot schema',
  ],
  [
    'packages/persistence-schema/src/knowledge.ts',
    'store_snapshot',
    'wave-2',
    'knowledge snapshot schema',
  ],
  [
    'packages/persistence-schema/src/retrieval.ts',
    'store_snapshot',
    'wave-7',
    'retrieval snapshot schema',
  ],
  [
    'packages/server/src/lib/runtime/deployment-profile.ts',
    'JsonStore',
    'wave-8',
    'compatibility profile capability',
  ],
  ['packages/server/src/lib/store/index.ts', 'JsonStore', 'wave-9', 'legacy JSON store export'],
  [
    'packages/server/src/lib/store/json-store.ts',
    'JsonStore',
    'wave-9',
    'legacy JSON store implementation',
  ],
  [
    'packages/service-knowledge-read/package.json',
    '@trapmap/server',
    'wave-7',
    'read service compatibility dependency',
  ],
  [
    'packages/service-knowledge-read/package.json',
    '@trapmap/runtime-infra',
    'wave-7',
    'read service compatibility dependency',
  ],
  [
    'packages/service-knowledge-read/src/context.ts',
    '@trapmap/runtime-infra',
    'wave-7',
    'read service context bridge',
  ],
  [
    'packages/service-knowledge-read/src/knowledge-read-support-infra-default.ts',
    '@trapmap/runtime-infra',
    'wave-7',
    'read support infrastructure',
  ],
  [
    'packages/service-knowledge-read/src/read-model.ts',
    '@trapmap/runtime-infra',
    'wave-7',
    'read model infrastructure',
  ],
  [
    'packages/service-knowledge-read/src/retrieval-infra-default.ts',
    '@trapmap/runtime-infra',
    'wave-7',
    'retrieval infrastructure',
  ],
  [
    'packages/service-knowledge-read/src/retrieval-recall-coordinator.ts',
    '@trapmap/runtime-infra',
    'wave-7',
    'recall coordinator infrastructure',
  ],
  [
    'packages/service-knowledge-read/src/server-retrieval-seam.ts',
    '@trapmap/runtime-infra',
    'wave-7',
    'server retrieval seam',
  ],
  ['scripts/bench-store.ts', 'JsonStore', 'wave-9', 'legacy store benchmark'],
  ['scripts/bench-store.ts', 'PostgresStore', 'wave-9', 'legacy store benchmark'],
  ['scripts/export-badcase-to-eval.ts', '@trapmap/server', 'wave-4', 'governance export fixture'],
  [
    'scripts/export-retrieval-db-snapshot.ts',
    '@trapmap/server',
    'wave-9',
    'legacy snapshot export fixture',
  ],
].map(([file, symbol, ownerWave, rationale]) => ({
  file,
  symbol: symbol as CompatibilitySymbol,
  ownerWave: ownerWave as OwnerWave,
  rationale,
}));

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
  it('keeps Wave-8 host composition as the sole server factory path for migrated entrypoints', () => {
    for (const file of POSTGRES_COMPOSITION_ENTRYPOINTS) {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      expect(source).toContain('buildPostgresComposedServer');
      expect(source).not.toMatch(/\bbuildServer\s*\(/);
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
