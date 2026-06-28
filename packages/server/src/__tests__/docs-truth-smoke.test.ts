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
    const migrationRunnerSource = readDoc(
      'packages/server/src/lib/persistence/migration-runner.ts',
    );

    expect(remediation).toContain('### Phase 1 closure freeze (G1 `#1-#10`)');
    expect(remediation).toContain(
      '`packages/server` 只保留 Fastify compatibility shell 与 shared runtime/status seam',
    );
    expect(remediation).toContain('packages/server/src/lib/*/repository.ts');
    expect(remediation).toContain('packages/server/src/lib/repos/index.ts');
    expect(remediation).toContain(
      'Drizzle schema 与 migration 执行 owner 继续冻结在 `packages/server`',
    );
    expect(remediation).toContain('`service-*` 只承载 owner-aligned thin assembly');

    expect(appSource).toContain('await registerCapabilityRoutes(capabilityScopedApp, config);');
    expect(appSource).toContain("if (capabilities.routeSurface === 'minimal-agent') {");
    expect(appSource).toContain('await app.register(operationsRoutes);');
    expect(appSource).toContain('await app.register(feedbackAdminRoutes);');
    expect(configSource).toContain(
      "routeSurface: z.enum(['minimal-agent', 'gateway-core', 'worker-status'])",
    );
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
    expect(packagesDoc).toContain(
      '`packages/server` 保留 Fastify compatibility shell 与 shared runtime/status seam',
    );
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
    const activateRouteSource = readDoc(
      'packages/server/src/routes/operations/artifacts-activate.ts',
    );

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
    expect(packagesDoc).toContain(
      'direct `store.snapshot()` / `store.transact()` 入口当前仍集中在 compatibility shell',
    );

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
    const hostLocalAdapterFactory = readDoc(
      'packages/host-local/src/nest/adapters/adapter-factory.ts',
    );
    const hostLocalRemoteAdapter = readDoc(
      'packages/host-local/src/nest/adapters/remote.adapter.ts',
    );
    const hostLocalSharedInfra = readDoc('packages/host-local/src/nest/runtime/shared-infra.ts');
    const internalPorts = readDoc('packages/backend-core/src/ports/internal-ports.ts');
    const distributedClient = readDoc('packages/host-distributed/src/gateway/internal-client.ts');
    const distributedKnowledgeWriteClient = readDoc(
      'packages/host-distributed/src/shared/internal-knowledge-write-client.ts',
    );

    expect(remediation).toContain(
      '### Phase 3 closure freeze (G3 `#17` `#18` `#19` `#21` `#23` `#29` `#30` adapter scope)',
    );
    expect(remediation).toContain('provider taxonomy');
    expect(remediation).toContain('host-owned adapter selection seam');
    expect(remediation).toContain('gateway client');
    expect(remediation).toContain('mega-adapter');

    expect(truthSources).toContain('Phase 3 unified-adapter boundary freeze');
    expect(truthSources).toContain('packages/host-local/src/nest/adapters/adapter-factory.ts');
    expect(truthSources).toContain('packages/host-distributed/src/gateway/internal-client.ts');
    expect(truthSources).toContain(
      'packages/host-distributed/src/shared/internal-knowledge-write-client.ts',
    );
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

  it('Phase 4 docs freeze selector envs, recommended profile combos, and target-pruning posture', () => {
    const remediation = readDoc('docs/todos/trapmap-architecture-remediation-plan.md');
    const truthSources = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    const packagesDoc = readDoc('docs/PACKAGES.md');
    const environmentDoc = readDoc('docs/operations/ENVIRONMENT.md');
    const deploymentDoc = readDoc('docs/architecture/DEPLOYMENT.md');
    const testingDoc = readDoc('docs/operations/TESTING.md');
    const serverConfig = readDoc('packages/server/src/config.ts');
    const hostLocalConfig = readDoc('packages/host-local/src/nest/config/config.ts');
    const distributedServiceConfig = readDoc(
      'packages/host-distributed/src/config/service-config.ts',
    );

    expect(remediation).toContain('### Phase 4 closure freeze (G3 env / target matrix)');
    expect(remediation).toContain('selector env');
    expect(remediation).toContain('provider-specific env');
    expect(remediation).toContain('fail-fast / fallback');
    expect(remediation).toContain('optional dependency');

    expect(truthSources).toContain('Phase 4 adapter env / target-pruning freeze');
    expect(truthSources).toContain('packages/host-local/src/nest/config/config.ts');
    expect(truthSources).toContain('packages/host-distributed/src/config/service-config.ts');
    expect(truthSources).toContain('TRAPMAP_DEPLOYMENT_PROFILE');
    expect(truthSources).toContain('TRAPMAP_TASK_TRANSPORT');

    expect(packagesDoc).toContain('## Phase 4 Adapter env / target-pruning freeze');
    expect(packagesDoc).toContain('`local-agent` / `team-monolith` -> `light`');
    expect(packagesDoc).toContain('`distributed` -> `heavy`');
    expect(packagesDoc).toContain('optional dependency');

    expect(environmentDoc).toContain('Phase 4 freeze');
    expect(environmentDoc).toContain('TRAPMAP_DEPLOYMENT_PROFILE');
    expect(environmentDoc).toContain('TRAPMAP_DEPLOYMENT_PRESET');
    expect(environmentDoc).toContain('TRAPMAP_TASK_TRANSPORT');
    expect(environmentDoc).toContain('AI_PROVIDER');

    expect(deploymentDoc).toContain('Phase 4 freeze');
    expect(deploymentDoc).toContain('local-agent');
    expect(deploymentDoc).toContain('team-monolith');
    expect(deploymentDoc).toContain('distributed');
    expect(deploymentDoc).toContain('light');
    expect(deploymentDoc).toContain('heavy');

    expect(testingDoc).toContain('Phase 4 Adapter Env / Target Freeze Checks');
    expect(testingDoc).toContain(
      'rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts',
    );
    expect(testingDoc).toContain('rtk pnpm check:docs-drift');
    expect(testingDoc).toContain('rtk pnpm check:structure');

    expect(serverConfig).toContain(
      "provider: z.enum(['postgres', 'rabbitmq']).default('postgres')",
    );
    expect(serverConfig).toContain(
      "profile: z.enum(['local-agent', 'team-monolith', 'distributed'])",
    );
    expect(serverConfig).toContain(
      "preset: z\n    .enum(['monolith', 'api', 'candidate-worker', 'governance-worker', 'outbox-worker'])",
    );
    expect(hostLocalConfig).toContain('TRAPMAP_DEPLOYMENT_PROFILE');
    expect(hostLocalConfig).toContain('TRAPMAP_DEPLOYMENT_PRESET');
    expect(hostLocalConfig).toContain('TRAPMAP_TASK_TRANSPORT');
    expect(distributedServiceConfig).toContain('TRAPMAP_SERVICE_NAME');
    expect(distributedServiceConfig).toContain('TRAPMAP_KNOWLEDGE_WRITE_URL');
  });

  it('Phase 5 docs freeze distributed maturity baseline, shared-PG posture, and deferred boundary', () => {
    const remediation = readDoc('docs/todos/trapmap-architecture-remediation-plan.md');
    const truthSources = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    const packagesDoc = readDoc('docs/PACKAGES.md');
    const deploymentDoc = readDoc('docs/architecture/DEPLOYMENT.md');
    const testingDoc = readDoc('docs/operations/TESTING.md');
    const maturityDoc = readDoc(
      'docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md',
    );
    const hostDistributedReadme = readDoc('packages/host-distributed/README.md');
    const composeFile = readDoc('docker-compose.yml');
    const distributedCloseoutTest = readDoc(
      'packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts',
    );

    expect(remediation).toContain('### Phase 5 closure freeze (G4 distributed baseline)');
    expect(remediation).toContain('Level 2 / transitional-microservice');
    expect(remediation).toContain('shared PostgreSQL');
    expect(remediation).toContain('真实内部 HTTP hop');
    expect(remediation).toContain('deferred');

    expect(truthSources).toContain('Phase 5 distributed baseline / runtime-isolation freeze');
    expect(truthSources).toContain(
      'docs/todos/nestjs-service-evolution-distributed-maturity-assessment.md',
    );
    expect(truthSources).toContain(
      'packages/host-distributed/src/gateway/distributed-runtime-closeout.test.ts',
    );
    expect(truthSources).toContain('docker-compose.yml');

    expect(packagesDoc).toContain('## Phase 5 Distributed baseline freeze');
    expect(packagesDoc).toContain('Level 2 / transitional-microservice');
    expect(packagesDoc).toContain('shared PostgreSQL');
    expect(packagesDoc).toContain('gateway-only external access');

    expect(deploymentDoc).toContain('Phase 5 freeze');
    expect(deploymentDoc).toContain('Level 2 / transitional-microservice');
    expect(deploymentDoc).toContain('shared PostgreSQL');
    expect(deploymentDoc).toContain('compose');

    expect(testingDoc).toContain('Phase 5 Distributed Baseline Freeze Checks');
    expect(testingDoc).toContain(
      'rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts',
    );
    expect(testingDoc).toContain('rtk pnpm check:docs-drift');
    expect(testingDoc).toContain('rtk pnpm check:structure');

    expect(maturityDoc).toContain('Level 2 / transitional-microservice');
    expect(maturityDoc).toContain('gateway 仍是唯一外部入口');
    expect(maturityDoc).toContain('已存在真实内部 HTTP hop');
    expect(maturityDoc).toContain('shared PostgreSQL 仍是主要持久化底座');

    expect(hostDistributedReadme).toContain('Gateway-only external access');
    expect(hostDistributedReadme).toContain('HTTP-based inter-service communication');
    expect(hostDistributedReadme).toContain('Shared PostgreSQL (Transitional)');
    expect(composeFile).toContain('profiles: ["distributed"]');
    expect(composeFile).toContain('TRAPMAP_DEPLOYMENT_PROFILE=distributed');
    expect(distributedCloseoutTest).toContain(
      'proves multi-process gateway to internal services to knowledge-write closeout with recovery evidence',
    );
  });

  it('Phase 6 docs freeze mature-capability boundaries without overstating platform maturity', () => {
    const remediation = readDoc('docs/todos/trapmap-architecture-remediation-plan.md');
    const truthSources = readDoc('docs/reference/SYSTEM_TRUTH_SOURCES.md');
    const packagesDoc = readDoc('docs/PACKAGES.md');
    const environmentDoc = readDoc('docs/operations/ENVIRONMENT.md');
    const testingDoc = readDoc('docs/operations/TESTING.md');
    const resilienceSource = readDoc('packages/server/src/lib/runtime/resilience.ts');
    const metricsSource = readDoc('packages/server/src/lib/runtime/metrics.ts');
    const cacheInvalidationSource = readDoc('packages/server/src/lib/cache/invalidation.ts');
    const serverConfig = readDoc('packages/server/src/config.ts');
    const graphConfig = readDoc('packages/server/src/lib/graph-query/config.ts');
    const distributedServiceConfig = readDoc(
      'packages/host-distributed/src/config/service-config.ts',
    );
    const distributedClient = readDoc('packages/host-distributed/src/gateway/internal-client.ts');

    expect(remediation).toContain(
      '### Phase 6 closure freeze (G4 mature-capability / library-replacement freeze)',
    );
    expect(remediation).toContain('internal client + resilience');
    expect(remediation).toContain('tracing + metrics');
    expect(remediation).toContain('rate limiting + bulkhead / 背压');
    expect(remediation).toContain('service discovery');
    expect(remediation).toContain('DB budget / PgBouncer');
    expect(remediation).toContain('light` 与 `heavy`');
    expect(remediation).toContain('TRAPMAP_GRAPH_DB_*');

    expect(truthSources).toContain('Phase 6 mature-capability / library-replacement freeze');
    expect(truthSources).toContain('packages/server/src/lib/runtime/resilience.ts');
    expect(truthSources).toContain('packages/server/src/lib/runtime/metrics.ts');
    expect(truthSources).toContain('packages/server/src/lib/cache/invalidation.ts');
    expect(truthSources).toContain('packages/server/src/lib/graph-query/config.ts');
    expect(truthSources).toContain('not current built-in runtime default');

    expect(packagesDoc).toContain('## Phase 6 Mature capability freeze');
    expect(packagesDoc).toContain('不是完整 mature-service platform stack');
    expect(packagesDoc).toContain('rate limiting + bulkhead / 背压');
    expect(packagesDoc).toContain('自治缓存平台');
    expect(packagesDoc).toContain('不同默认策略姿态');

    expect(environmentDoc).toContain('### Phase 6 freeze');
    expect(environmentDoc).toContain('internal client + resilience');
    expect(environmentDoc).toContain('rate limiting + bulkhead / 背压');
    expect(environmentDoc).toContain('DB budget / PgBouncer');
    expect(environmentDoc).toContain('TRAPMAP_GRAPH_DB_*');

    expect(testingDoc).toContain('Phase 6 Mature Capability Freeze Checks');
    expect(testingDoc).toContain(
      'rtk pnpm test:file -- packages/server/src/__tests__/docs-truth-smoke.test.ts',
    );
    expect(testingDoc).toContain('rtk pnpm check:docs-drift');
    expect(testingDoc).toContain('rtk pnpm check:structure');

    expect(resilienceSource).toContain('export interface ResiliencePolicy');
    expect(resilienceSource).toContain(
      "export type ResilienceFailureMode = 'fail-closed' | 'fail-open'",
    );
    expect(metricsSource).toContain('export interface RuntimeMetricsSnapshot');
    expect(metricsSource).toContain('retryableFailures');
    expect(cacheInvalidationSource).toContain('CacheInvalidationReason');
    expect(cacheInvalidationSource).toContain('pendingInvalidation');
    expect(serverConfig).toContain('rateLimitMaxPerMinute');
    expect(serverConfig).toContain('graphDb: GraphDbConfigSchema');
    expect(graphConfig).toContain("provider: z.enum(['neo4j']).default('neo4j')");
    expect(graphConfig).toContain('failOpen: z.boolean().default(true)');
    expect(distributedServiceConfig).toContain('TRAPMAP_KNOWLEDGE_READ_URL');
    expect(distributedServiceConfig).toContain('TRAPMAP_JOB_RUNTIME_URL');
    expect(distributedClient).toContain('normalizeCanonicalErrorBody');
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
