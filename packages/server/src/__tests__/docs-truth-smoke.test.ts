import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

function readDoc(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), 'utf8');
}

describe('docs truth smoke', () => {
  it('CODE_GUIDE uses current server entry name', () => {
    const guide = readDoc('docs/guides/CODE_GUIDE.md');

    expect(guide).toContain('buildServer()');
    expect(guide).not.toContain('createApp()');
  });

  it('key docs reference SYSTEM_TRUTH_SOURCES.md', () => {
    const docs = ['README.md', 'docs/README.md'];

    for (const doc of docs) {
      const content = readDoc(doc);
      expect(content, `${doc} should link to SYSTEM_TRUTH_SOURCES.md`).toContain(
        'SYSTEM_TRUTH_SOURCES.md',
      );
    }
  });

  it('SYSTEM_TRUTH_SOURCES.md exists', () => {
    const content = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    expect(content.length).toBeGreaterThan(0);
  });

  it('non-planned truth source paths exist on disk', () => {
    const content = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');

    // Skip paths on rows annotated with "planned" or "Task"
    const lines = content.split('\n');
    for (const line of lines) {
      if (/planned|Task \d/i.test(line)) continue;
      // Extract paths from this non-planned line
      const linePathPattern = /`([a-z0-9_.-]+\/[a-z0-9_/.-]+\.[a-z]+)`/gi;
      const lineMatches = line.matchAll(linePathPattern);
      for (const pathMatch of lineMatches) {
        const relPath = pathMatch[1];
        const absPath = resolve(ROOT, relPath);
        const serverRelativePath = resolve(ROOT, 'packages/server/src', relPath);
        expect(
          existsSync(absPath) || existsSync(serverRelativePath),
          `truth source path should exist: ${relPath}`,
        ).toBe(true);
      }
    }
  });

  it('DOCS_TRUTH_MATRIX.md exists', () => {
    const content = readDoc('docs/reference/DOCS_TRUTH_MATRIX.md');
    expect(content.length).toBeGreaterThan(0);
  });

  it('SYSTEM_TRUTH_SOURCES.md references DOCS_TRUTH_MATRIX.md', () => {
    const content = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    expect(content).toContain('DOCS_TRUTH_MATRIX.md');
  });

  it('guardrail docs mention pnpm check:docs-drift and pnpm check:complexity', () => {
    const guardrailDocs = ['docs/operations/TESTING.md', 'docs/operations/CI_CD.md'];

    for (const doc of guardrailDocs) {
      const content = readDoc(doc);
      expect(content, `${doc} should mention pnpm check:docs-drift`).toContain(
        'pnpm check:docs-drift',
      );
      expect(content, `${doc} should mention pnpm check:complexity`).toContain(
        'pnpm check:complexity',
      );
    }
  });

  it('DATABASE_SCHEMA.md references schema module path', () => {
    const content = readDoc('docs/reference/DATABASE_SCHEMA.md');
    expect(content).toContain('packages/server/src/lib/persistence/schema');
  });

  it('docs/README.md does not advertise JSON as primary runtime', () => {
    const content = readDoc('docs/README.md');
    expect(content).not.toContain('使用 JSON 文件存储');
  });

  it('DEPLOYMENT.md contains PostgreSQL-first posture', () => {
    const content = readDoc('docs/architecture/DEPLOYMENT.md');
    expect(content).toContain('TRAPMAP_DATABASE_URL');
    expect(content).toMatch(/PostgreSQL|pgvector/);
  });

  it('DATABASE_SCHEMA.md contains correct table count', () => {
    const content = readDoc('docs/reference/DATABASE_SCHEMA.md');
    expect(content).toContain('57');
  });

  it('DOCS_TRUTH_MATRIX.md covers expanded drift categories', () => {
    const matrix = readDoc('docs/reference/DOCS_TRUTH_MATRIX.md');
    expect(matrix).toContain('Root workspace commands');
    expect(matrix).toContain('Server-only DB commands');
    expect(matrix).toContain('Runtime env defaults');
    expect(matrix).toContain('AI provider/model defaults');
    expect(matrix).toContain('Eval workflow');
    expect(matrix).toContain('Deep architecture persistence docs');
    expect(matrix).toContain('Deployment defaults');
    expect(matrix).toContain('Health/readiness endpoints');
    expect(matrix).toContain('Deep architecture component docs');
    expect(matrix).toContain('Operator-only internal APIs');
    expect(matrix).toContain('Drift Type');
  });

  it('SYSTEM_TRUTH_SOURCES.md covers expanded drift categories', () => {
    const sources = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    expect(sources).toContain('Root workspace commands');
    expect(sources).toContain('Server-only DB commands');
    expect(sources).toContain('Runtime env defaults');
    expect(sources).toContain('AI provider/model defaults');
    expect(sources).toContain('Eval workflow');
    expect(sources).toContain('Deep architecture persistence docs');
    expect(sources).toContain('Deployment defaults');
    expect(sources).toContain('Health/readiness endpoints');
    expect(sources).toContain('Deep architecture component docs');
    expect(sources).toContain('Operator-only internal APIs');
    expect(sources).toContain('Runtime request/trace headers');
    expect(sources).toContain('Runtime status/readiness contract');
    expect(sources).toContain('Shared resilience policy');
    expect(sources).toContain('Runtime metrics snapshot semantics');
    expect(sources).toContain('Queue / outbox reliability policy');
  });

  it('Phase 1 boundary docs freeze server/backend-core/service-host ownership facts', () => {
    const remediation = readDoc('docs/todos/trapmap-architecture-remediation-plan.md');
    const truthSources = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    const packagesDoc = readDoc('docs/PACKAGES.md');
    const appSource = readDoc('packages/server/src/app.ts');
    const configSource = readDoc('packages/server/src/config.ts');
    const internalPortsSource = readDoc('packages/backend-core/src/ports/internal-ports.ts');
    const reposSource = readDoc('packages/server/src/lib/repos/index.ts');
    const schemaSource = readDoc('packages/server/src/lib/persistence/schema/index.ts');
    const migrationRunnerSource = readDoc('packages/server/src/lib/persistence/migration-runner.ts');

    expect(remediation).toContain('### Phase 1 closure freeze (G1 `#1-#10`)');
    expect(remediation).toContain('`packages/server` 只保留 Fastify compatibility shell 与 shared runtime/status seam');
    expect(remediation).toContain('packages/server/src/lib/*/repository.ts');
    expect(remediation).toContain('packages/server/src/lib/repos/index.ts');
    expect(remediation).toContain('Drizzle schema 与 migration 执行 owner 继续冻结在 `packages/server`');
    expect(remediation).toContain('`service-*` 只承载 owner-aligned thin assembly');

    expect(appSource).toContain('await registerCapabilityRoutes(capabilityScopedApp, config);');
    expect(appSource).toContain("if (capabilities.routeSurface === 'minimal-agent') {");
    expect(appSource).toContain("await app.register(operationsRoutes);");
    expect(appSource).toContain("await app.register(feedbackAdminRoutes);");
    expect(configSource).toContain("routeSurface: z.enum(['minimal-agent', 'gateway-core', 'worker-status'])");
    expect(configSource).toContain('supportsReviewGovernance: z.boolean()');
    expect(configSource).toContain('requiresPostgres: z.boolean()');
    expect(internalPortsSource).toContain('export interface KnowledgeWritePort');
    expect(internalPortsSource).toContain('applyMaintenanceDecision');
    expect(internalPortsSource).toContain('publishCandidateResult');
    expect(internalPortsSource).toContain('export interface CandidateIngestionPort');
    expect(reposSource).toContain('export interface SkillShareerRepos');
    expect(reposSource).toContain('createAllRepos');
    expect(schemaSource).toContain('export const storeSnapshot = pgTable');
    expect(schemaSource).toContain("export * from './queue.js';");
    expect(migrationRunnerSource).toContain('ADD COLUMN IF NOT EXISTS "worker_id" TEXT');
    expect(migrationRunnerSource).toContain('INSERT INTO "users"');

    expect(truthSources).toContain('Phase 1 server/backend-core boundary freeze');
    expect(truthSources).toContain('packages/server/src/lib/persistence/schema/index.ts');
    expect(truthSources).toContain('packages/server/src/lib/persistence/migration-runner.ts');
    expect(truthSources).toContain('packages/service-*');
    expect(truthSources).toContain('thin assembly');

    expect(packagesDoc).toContain('## Phase 1 Server / Backend-Core boundary freeze');
    expect(packagesDoc).toContain('`packages/server` 保留 Fastify compatibility shell 与 shared runtime/status seam');
    expect(packagesDoc).toContain('`packages/backend-core` 不是“仅接口”空壳');
    expect(packagesDoc).toContain('`packages/service-*` 只承载 owner-aligned thin assembly');
  });

  it('Phase 2 docs freeze store_snapshot, InMemory fallback, and PG-first posture facts', () => {
    const remediation = readDoc('docs/todos/trapmap-architecture-remediation-plan.md');
    const truthSources = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    const packagesDoc = readDoc('docs/PACKAGES.md');
    const persistenceDoc = readDoc('docs/architecture/components/PERSISTENCE.md');
    const testingDoc = readDoc('docs/operations/TESTING.md');
    const snapshotGuard = readDoc('packages/server/src/__tests__/snapshot-usage-guard.test.ts');
    const pgCompat = readDoc('packages/server/src/__tests__/pg-first-compat.test.ts');
    const readModelSource = readDoc('packages/server/src/lib/operations/read-model.ts');
    const activateRouteSource = readDoc('packages/server/src/routes/operations/artifacts-activate.ts');

    expect(remediation).toContain('### Phase 2 closure freeze (G2 `#11-#16`)');
    expect(remediation).toContain('compatibility JSONB store');
    expect(remediation).toContain('Wave A 先补 repo / projection capability');
    expect(remediation).toContain('artifactFilePayloads');
    expect(remediation).toContain('teams / members / access-keys');
    expect(remediation).toContain('InMemory repository fallback');

    expect(truthSources).toContain('Phase 2 store-snapshot / PG-first posture freeze');
    expect(truthSources).toContain('InMemory 继续是 repo-backed fallback/testing posture');
    expect(truthSources).toContain('live no-PG / InMemory fallback');
    expect(truthSources).toContain('artifactFilePayloads hydration');

    expect(packagesDoc).toContain('## Phase 2 Store Snapshot / PG-first posture freeze');
    expect(packagesDoc).toContain('InMemory 不是与 PG 对等的长期生产轨道');
    expect(packagesDoc).toContain('PG-primary 事实已经成立');
    expect(packagesDoc).toContain('direct `store.snapshot()` / `store.transact()` 入口当前仍集中在 compatibility shell');

    expect(persistenceDoc).toContain('PostgreSQL 是主要且权威的生产存储后端');
    expect(persistenceDoc).toContain('PG-first + InMemory fallback/testing posture');
    expect(persistenceDoc).toContain('fallback 已经从运行态消失');
    expect(persistenceDoc).toContain('不再接纳新的 production 主路径');

    expect(testingDoc).toContain('Phase 2 Store Snapshot / PG-first Freeze Checks');
    expect(testingDoc).toContain('snapshot-usage-guard.test.ts');
    expect(testingDoc).toContain('pg-first-compat.test.ts');

    expect(snapshotGuard).toContain('Phase 2 posture freeze');
    expect(snapshotGuard).toContain('routes/teams.ts');
    expect(snapshotGuard).toContain('lib/operations/read-model.ts');

    expect(pgCompat).toContain('Phase 2 (PG-First Convergence)');
    expect(pgCompat).toContain('fallback still works correctly');

    expect(readModelSource).toContain('store.snapshot()');
    expect(activateRouteSource).toContain('artifactFilePayloads');
  });

  it('Phase 3 docs freeze adapter scope, provider taxonomy, and host/gateway boundaries', () => {
    const remediation = readDoc('docs/todos/trapmap-architecture-remediation-plan.md');
    const truthSources = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    const packagesDoc = readDoc('docs/PACKAGES.md');
    const repoStructure = readDoc('docs/reference/REPO_STRUCTURE.md');
    const testingDoc = readDoc('docs/operations/TESTING.md');
    const hostLocalAdapterFactory = readDoc('packages/host-local/src/nest/adapters/adapter-factory.ts');
    const hostLocalRemoteAdapter = readDoc('packages/host-local/src/nest/adapters/remote.adapter.ts');
    const hostLocalSharedInfra = readDoc('packages/host-local/src/nest/runtime/shared-infra.ts');
    const internalPorts = readDoc('packages/backend-core/src/ports/internal-ports.ts');
    const distributedClient = readDoc('packages/host-distributed/src/gateway/internal-client.ts');
    const distributedKnowledgeWriteClient = readDoc(
      'packages/host-distributed/src/shared/internal-knowledge-write-client.ts',
    );

    expect(remediation).toContain('### Phase 3 closure freeze (G3 `#17` `#18` `#19` `#21` `#23` `#29` `#30` adapter scope)');
    expect(remediation).toContain('provider taxonomy');
    expect(remediation).toContain('host-owned adapter selection seam');
    expect(remediation).toContain('gateway client');
    expect(remediation).toContain('mega-adapter');

    expect(truthSources).toContain('Phase 3 unified-adapter boundary freeze');
    expect(truthSources).toContain('packages/host-local/src/nest/adapters/adapter-factory.ts');
    expect(truthSources).toContain('packages/host-distributed/src/gateway/internal-client.ts');
    expect(truthSources).toContain('packages/host-distributed/src/shared/internal-knowledge-write-client.ts');
    expect(truthSources).toContain('host-owned adapter selection');

    expect(packagesDoc).toContain('## Phase 3 Unified adapter boundary freeze');
    expect(packagesDoc).toContain('统一适配器不是 mega-adapter');
    expect(packagesDoc).toContain('`backend-core` 只定义 port contract');
    expect(packagesDoc).toContain('`packages/host-local/src/nest/adapters/`');
    expect(packagesDoc).toContain('`packages/host-distributed/src/gateway/internal-client.ts`');

    expect(repoStructure).toContain('packages/host-local/src/nest/adapters/');
    expect(repoStructure).toContain('packages/host-distributed/src/gateway/');
    expect(repoStructure).toContain('packages/host-distributed/src/shared/');

    expect(testingDoc).toContain('Phase 3 Unified Adapter Freeze Checks');
    expect(testingDoc).toContain(
      'rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts',
    );
    expect(testingDoc).toContain('rtk pnpm check:docs-drift');
    expect(testingDoc).toContain('rtk pnpm check:structure');
    expect(testingDoc).toContain('packages/server/src/__tests__/docs-truth-smoke.test.ts');

    expect(hostLocalAdapterFactory).toContain("export type AdapterMode = 'in-process' | 'remote'");
    expect(hostLocalAdapterFactory).toContain('Adapter selection is the host assembly');
    expect(hostLocalRemoteAdapter).toContain('Remote adapter must NOT leak fetch Response');
    expect(hostLocalSharedInfra).toContain('buildDefaultAdapterRegistry()');
    expect(hostLocalSharedInfra).toContain('Shared seam only');
    expect(internalPorts).toContain('This layer enables both in-process direct invocation');
    expect(distributedClient).toContain('normalizeCanonicalErrorBody');
    expect(distributedKnowledgeWriteClient).toContain('createRemoteKnowledgeWriteClient');
  });

  it('docs/README.md does not contain stale schema counts', () => {
    const content = readDoc('docs/README.md');
    expect(content).not.toContain('48 张表');
    expect(content).not.toContain('54 张表');
  });

  it('GETTING_STARTED uses package-scoped DB commands and current JSON fallback path', () => {
    const content = readDoc('docs/guides/GETTING_STARTED.md');
    expect(content).toContain('pnpm --filter @trapmap/server db:migrate');
    expect(content).toContain('.data/skill-shareer.json');
    expect(content).not.toContain('pnpm run db:migrate');
    expect(content).not.toContain('.data/trapmap.json');
  });

  it('ARCHITECTURE.md uses correct runtime defaults', () => {
    const content = readDoc('docs/architecture/ARCHITECTURE.md');
    expect(content).toContain('127.0.0.1');
    expect(content).toContain('gpt-4o-mini');
    expect(content).not.toContain('| `HOST` | `0.0.0.0`');
    expect(content).not.toContain('| `AI_CHAT_MODEL` | `gpt-4o` |');
  });

  it('PERSISTENCE.md reports correct schema count', () => {
    const content = readDoc('docs/architecture/components/PERSISTENCE.md');
    expect(content).toContain('57 张表');
    expect(content).not.toContain('48 张表');
    expect(content).not.toContain('56 张表');
  });

  it('ENVIRONMENT.md does not describe JSON storage as dev default', () => {
    const content = readDoc('docs/operations/ENVIRONMENT.md');
    expect(content).toContain('.data/skill-shareer.json');
    expect(content).not.toContain('.data/trapmap.json');
  });

  it('CONTRIBUTING.md uses package-scoped DB commands', () => {
    const content = readDoc('docs/guides/CONTRIBUTING.md');
    expect(content).toContain('pnpm --filter @trapmap/server db:generate');
    expect(content).toContain('pnpm --filter @trapmap/server db:migrate');
    expect(content).not.toContain('pnpm run db:generate');
    expect(content).not.toContain('pnpm run db:migrate');
  });

  it('TESTING.md uses current eval entrypoints', () => {
    const content = readDoc('docs/operations/TESTING.md');
    expect(content).toContain('pnpm eval:ci:core');
    expect(content).not.toContain('TIER=core pnpm eval:ci');
  });

  it('runtime docs describe resilience and readiness verification', () => {
    const env = readDoc('docs/operations/ENVIRONMENT.md');
    const testing = readDoc('docs/operations/TESTING.md');
    const ci = readDoc('docs/operations/CI_CD.md');

    expect(env).toContain('TRAPMAP_REQUEST_ID_HEADER');
    expect(env).toContain('Runtime Resilience');
    expect(testing).toContain('Runtime Foundations Verification');
    expect(testing).toContain('outboxWorker');
    expect(ci).toContain('Runtime foundations');
    expect(ci).toContain('doc-rules');
  });

  it('ENVIRONMENT.md describes provider auto-detection', () => {
    const content = readDoc('docs/operations/ENVIRONMENT.md');
    expect(content).toMatch(/OPENAI_API_KEY.*GEMINI_API_KEY.*fallback/s);
  });

  it('DEPLOYMENT.md uses correct chat model default', () => {
    const content = readDoc('docs/architecture/DEPLOYMENT.md');
    expect(content).toContain('gpt-4o-mini');
    expect(content).toContain('.data/skill-shareer.json');
  });

  it('PERSISTENCE.md uses PG-first framing', () => {
    const content = readDoc('docs/architecture/components/PERSISTENCE.md');
    expect(content).toContain('.data/skill-shareer.json');
    // Verify it describes PostgreSQL as primary
    expect(content).toMatch(/主要|primary|推荐/);
  });

  it('EVALUATION.md uses current eval commands', () => {
    const content = readDoc('docs/architecture/components/EVALUATION.md');
    expect(content).toContain('pnpm eval:smoke');
    expect(content).toContain('pnpm eval:core');
    expect(content).not.toContain('pnpm eval:governance');
  });

  it('ARCHITECTURE.md Docker Compose uses pgvector image and wget healthcheck', () => {
    const content = readDoc('docs/architecture/ARCHITECTURE.md');
    expect(content).toContain('pgvector/pgvector:pg16');
    expect(content).toContain('wget');
    expect(content).not.toContain('image: postgres:16');
  });

  it('EVALUATION.md uses TS datasets, not YAML cases', () => {
    const content = readDoc('docs/architecture/components/EVALUATION.md');
    expect(content).toContain('datasets/');
    expect(content).toContain('scenarios/');
    expect(content).not.toContain('cases/');
  });

  it('AI_PROVIDER.md uses correct Ollama default model', () => {
    const content = readDoc('docs/architecture/components/AI_PROVIDER.md');
    expect(content).toContain('llama3');
    expect(content).not.toContain('llama2');
  });

  it('ASYNC_INFRASTRUCTURE.md does not reference removed DualWrite repos', () => {
    const content = readDoc('docs/architecture/components/ASYNC_INFRASTRUCTURE.md');
    expect(content).not.toContain('DualWriteKnowledgeRepository');
    expect(content).not.toContain('DualWriteArtifactRepository');
  });

  it('ARTIFACTS.md uses current lifecycle states and record types', () => {
    const content = readDoc('docs/architecture/components/ARTIFACTS.md');
    expect(content).toContain('agent-pass');
    expect(content).toContain('SkillArtifactRecord');
    expect(content).not.toContain('interface SkillArtifact {');
  });

  it('server package has local structure guides', () => {
    expect(existsSync(resolve(ROOT, 'packages/server/src/lib/README.md'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'packages/server/src/routes/README.md'))).toBe(true);

    const codeGuide = readDoc('docs/guides/CODE_GUIDE.md');
    expect(codeGuide).toContain('packages/server/src/lib/README.md');
    expect(codeGuide).toContain('packages/server/src/routes/README.md');
  });

  it('server raw report revalidation — live gap tests exist', () => {
    expect(existsSync(resolve(ROOT, 'packages/server/src/app.test.ts'))).toBe(true);
    expect(existsSync(resolve(ROOT, 'docs/plans/fm-agent-scan/server-live-gap-matrix.md'))).toBe(
      true,
    );
  });

  it('server raw report revalidation — source pack exists', () => {
    expect(existsSync(resolve(ROOT, 'docs/plans/fm-agent-scan/server-source-pack.md'))).toBe(true);
  });
});
