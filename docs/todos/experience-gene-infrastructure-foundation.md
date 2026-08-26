# Experience Gene Infrastructure Foundation

## Status

- Owned by [Experience Gene Infrastructure and Pipeline](experience-gene-program-mainline.md).
- Phase order: 1 / 5.

## Goal

先收敛 Gene 管线要复用的向量、structured generation 和 derivation task 骨架，避免在后续阶段复制 pgvector、embedding cache、JSON 解析和任务幂等逻辑。

## Non-goals

- 不新建 `@trapmap/vector-store` 包。
- 不替换现有 embedding provider 或引入第二套向量索引。
- 不改变既有 knowledge entry、capsule 和 label 检索语义。
- 不实现 ExperienceGene 业务对象。

## Current facts

- `cosineSimilarity` 目前位于 `packages/backend-core/src/knowledge-read/domain/ranking.ts`。
- pgvector 用法分散在 knowledge embeddings、capsule embeddings 和 canonical label embeddings。
- embedding provider 工厂已经由 `@trapmap/ai-providers` 统一提供。
- artifact derivation 已有 judgment-node contract：`ArtifactDerivationPort`。
- task/outbox 基础设施位于 `packages/service-job-runtime/src/async-runtime.ts`。

## Design decisions

### Vector utilities

- 将纯函数 `cosineSimilarity` 和新增 `normalizeVector` 移入 `packages/lib/src/vector.ts`。
- 新增 `createDeterministicFallbackVector(text: string, dimension = 384): number[]`，算法与现有 `FallbackEmbeddings` 完全一致；`@trapmap/ai-providers` 改为消费该 helper。
- `backend-core` 改为从 `@trapmap/lib` 导入 `cosineSimilarity` 并在原 public barrel re-export，避免破坏既有消费方。
- 本阶段不替换 `service-knowledge-read/retrieval-infra-default.ts` 现有的本地 embedding 函数，避免改变未配置 provider 时的既有检索向量。
- `cosineSimilarity` 对 dimension mismatch、`NaN` 和非 finite 输入抛错；zero vector 返回 `0`。`normalizeVector` 返回新数组，不修改输入；zero/non-finite vector 分别返回全零和抛错。deterministic helper 对相同 text/dimension 必须逐位一致。

### Vector search port

新增 `packages/backend-core/src/ports/vector-search-ports.ts`:

```ts
export interface VectorSearchRecord {
  sourceId: string;
  sourceRevision: number;
  contentHash: string;
  vector: number[];
  teamId: string | null;
  scope: 'global' | 'project';
  requiredLevel: number;
}

export interface VectorSearchFilters {
  teamId: string | null;
  maxRequiredLevel: number;
  scopes: Array<'global' | 'project'>;
  sourceIds?: string[];
}

export interface VectorSearchHit {
  sourceId: string;
  similarity: number;
}

export interface VectorSearchPort {
  upsert(records: VectorSearchRecord[]): Promise<void>;
  search(vector: number[], filters: VectorSearchFilters, limit: number): Promise<VectorSearchHit[]>;
  deleteBySource(sourceId: string): Promise<void>;
  health(): Promise<{ ok: boolean; reason?: string }>;
}
```

- Port 只定义能力，不绑定 pgvector。
- PostgreSQL/pgvector 实现留在对应 service owner infrastructure；第一阶段允许 knowledge-read 与后续 Gene read/write adapter 分别装配同一 port。
- Port 表示一个 logical collection；具体表名、namespace 和 embedding model/version 由宿主装配时绑定，不在每次调用里混用不同集合。
- 查询必须强制 governance filters，不得让调用方绕过 team/scope/security level。
- `upsert` 必须以 `(source_id, source_revision, content_hash)` 为逻辑幂等键；重复 upsert 更新 vector 与 governance columns，不产生第二行。
- `search` 的 similarity 必须 clamp 到 `[0, 1]`，按 similarity desc、sourceId asc 排序，保证测试稳定。

### Structured generation seam

在 `@trapmap/ai-providers` 增加 provider-neutral helper:

```ts
export interface StructuredGenerationResult<T> {
  value: T;
  rawText: string;
  rawTextSha256: string;
  provider: string;
  model: string | null;
  attempts: number;
}

export async function generateStructured<T>(options: {
  chat: ChatProvider;
  system: string;
  prompt: string;
  schema: ZodType<T>;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}): Promise<StructuredGenerationResult<T>>;
```

- helper 复用现有 JSON fence 清理思路，负责 Zod parse、bounded retry、raw output hash 和 redacted observability metadata；默认 `maxRetries = 2`，允许范围 `0..5`。
- 为避免破坏既有调用方，可为 `ChatProvider` 增加 optional `readonly model?: string | null`；result.model 取该值或 `null`，不得从 prompt/raw text 推断模型名。
- prompt 内容仍由调用方拥有；不在 ai-providers 内编写 Gene 业务 prompt。
- chat 未配置、invoke 失败或重试后仍无法通过 Zod parse 时抛出 typed `StructuredGenerationError`，携带 `attempts` 和 redacted last failure class，由上层决定降级策略。

### Canonical JSON

新增 `canonicalJsonStringify(value: unknown): string` 到 `@trapmap/lib`：

- 递归排序 object key，保留 array order，不写入空白字符。
- `undefined` object properties 被省略；array 中的 `undefined` 和 non-finite number 抛错。
- 该 helper 是后续 Gene content hash 与 task idempotency key 的唯一稳定序列化入口。

### Derivation task skeleton

新增通用 derivation contract 到 `packages/backend-core/src/ports/derivation-ports.ts`:

```ts
export interface DerivationRequest<TSnapshot> {
  sourceType: string;
  sourceId: string;
  sourceRevision: number;
  sourceHash: string;
  snapshot: TSnapshot;
}

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface DerivationCandidate<TOutput> {
  output: TOutput;
  validatorReport: ValidationReport;
  provenance: {
    generator: 'rule' | 'llm' | 'hybrid';
    model: string | null;
    promptVersion: string;
  };
}
```

- 该骨架只约束请求溯源、候选输出和验证报告，不定义 Gene 字段。
- task enqueue 继续使用现有 pending/running in-flight dedupe 规则；业务层 key 至少包含 source type/id/revision/source hash、derivation unit id、generator kind 和 prompt version。
- `ValidationReport.valid === false` 不抛错；是否保存 rejected event、重试或终止由领域管线决定。

## Implementation checklist

- [x] 把 cosine/vector pure helpers 迁移到 `@trapmap/lib` 并补测试。
- [x] backend-core 保持原导出兼容并改用 lib implementation。
- [x] deterministic fallback helper 保持 `FallbackEmbeddings` 现有输出不变。
- [x] 新增 `VectorSearchPort` 与最小 fixture-based contract tests。
- [x] 为 knowledge-read 现有 pgvector path 建立 port-backed adapter seam。
- [x] 在 ai-providers 增加 `generateStructured` 与 retry/parser tests。
- [x] 新增 derivation request/candidate/report contracts 与 fixture tests。
- [x] 新增 `canonicalJsonStringify` 与 nested-object/array edge-case tests。
- [x] 抽离通用 pgvector/embedding helpers 至 `@trapmap/infra` 并迁移至 `apps/` 薄组装（见第三检查点）。
- [x] 运行 focused tests、typecheck 和增量 fallow audit；`--base main` 的分支级审计基线问题保留在问题池，阶段 closeout 前必须解决。

## Acceptance criteria

1. 旧 `cosineSimilarity` public import path 继续可用，ranking 相关 focused tests 全绿。
2. `FallbackEmbeddings.embed` 对固定输入的输出在重构前后一致。
3. knowledge-read 默认检索行为、路由和响应 shape 不变；pgvector adapter 只替换 seam，不改 SQL 语义。
4. structured generation 对 fence、invalid JSON、schema failure、invoke failure 和成功 retry 各有确定性 fake-chat 测试。
5. 没有新建向量包、数据库连接管理器或 Gene 业务类型。
6. 相同逻辑对象的 canonical JSON 输出与 key insertion order 无关。

## Test plan

```bash
pnpm --filter @trapmap/lib test --run src/vector.test.ts
pnpm --filter @trapmap/lib test --run src/canonical-json.test.ts
pnpm --filter @trapmap/backend-core test --run src/ports/vector-search-ports.test.ts
pnpm --filter @trapmap/service-knowledge-read test --run src/retrieval-infra-default.test.ts
pnpm --filter @trapmap/ai-providers test --run src/structured-generation.test.ts
pnpm typecheck
pnpm exec fallow audit --base main
```

## Rollout and rollback

- 本阶段不改默认路由行为。
- 若 pgvector adapter seam 引发回归，直接回退 caller wiring，保留 lib pure helpers 和 ports。

## Debt register

- 若多个 service 出现重复 pgvector SQL，登记为下一阶段抽取 shared adapter 的触发条件；当前不以新包预判抽象。

## Execution record（2026-08-25）

### 已完成实现

- `@trapmap/lib` 新增 `vector.ts` 与 `canonical-json.ts`，并经 barrel 导出；`backend-core/ranking.ts` 改为消费共享 cosine helper 且保持原导出。
- `@trapmap/ai-providers` 的 fallback embedding 改为消费 `createDeterministicFallbackVector`；`ChatProvider` 增加 optional `model`，OpenAI-compatible chat 暴露配置模型；新增 `generateStructured` 与 typed failure class。
- `backend-core/ports` 新增 `VectorSearchPort`、通用 derivation request/report/candidate contract。
- `service-knowledge-read` 新增 owner-local knowledge embeddings pgvector adapter；默认 retrieval infra 经该 adapter 执行向量召回并支持注入替换。SQL governance filters、similarity clamp、metadata projection 和稳定排序保持不变。
- 文档同步：AI provider README、AI provider architecture、retrieval architecture 已记录 structured generation、shared vector helper 和 pgvector port seam。

### 验证证据

```bash
pnpm --filter @trapmap/lib test --run src/vector.test.ts src/canonical-json.test.ts
# 2 files / 9 tests passed
pnpm --filter @trapmap/backend-core test --run src/knowledge-read/domain/ranking.test.ts src/ports/vector-search-ports.test.ts src/ports/derivation-ports.test.ts
# 3 files / 20 tests passed
pnpm --filter @trapmap/service-knowledge-read test --run src/retrieval-infra-default.test.ts src/knowledge-vector-search-port.test.ts src/import-boundary.test.ts
# 3 files / 21 tests passed
pnpm --filter @trapmap/ai-providers test --run src/providers.test.ts src/structured-generation.test.ts
# 2 files / 16 tests passed
pnpm typecheck
# exit 0
pnpm exec fallow audit --base HEAD --no-cache
# verdict pass; new-only dead code, complexity, boundary all 0
pnpm check:docs
# blocking tiers green；doc-references 对 Phase 2-4 计划中的未来文件有 non-blocking warning
pnpm check:structure
# exit 0
pnpm check:asserts
# exit 0
pnpm exec fallow list --boundaries
# service-knowledge-read → backend-core/contracts/lib 边界保持合规
```

### 第三检查点：通用基础设施抽离至 `@trapmap/infra` 薄组装（2026-08-26）

- 新建 `@trapmap/infra`：`src/vector/pgvector.ts` 统一 `formatVectorLiteral`、`clampSimilarity`、`appendTeamFilter`、`appendScopeFilter`、`appendExperienceGeneGovernanceFilters`、`buildGeneSearchDocument`，`src/embedding/index.ts` 统一 `createFallbackEmbedding`/`embedWithFallback`（384 维，`experience-gene-fallback-v1`，透传 `@trapmap/lib::createDeterministicFallbackVector`）。两个宿主与两个 service 包已迁移至该包，消除 pgvector SQL 重复抽取触发条件。
- `service-knowledge-read` 的 `knowledge-vector-search-port`/`experience-gene-retrieval` 与 `service-knowledge-write` 的 `experience-gene-repository`/`pg-ports`/`experience-gene-derivation`、`host-local`/`host-distributed` knowledge-read server 均改为消费 `@trapmap/infra`。`apps/light` 与 `apps/distributed` 新增 `src/composition/experience-gene.ts` 薄 seam，负责 `embedWithFallback` 到 `PgExperienceGeneSearchPort` 的组装，`packages/host-*` 保持库实现。
- 更新 `tsconfig.base.json` paths、`vitest.config.ts` projects、`pnpm-workspace` 依赖、`fallow` zones（`infra`/`app-light`/`app-distributed`）与 `docs/reference/REPO_STRUCTURE.md`。`pnpm typecheck` 通过，`infra` 9 tests、`service-knowledge-read` 14、`service-knowledge-write` 53、`host-local` 6、`host-distributed` 12 全绿；`fallow audit --base HEAD` 通过；`check:docs`/`check:structure` 通过（补 `packages/infra/README.md`）。

### 当前未关闭项

- `pnpm exec fallow audit --base main --no-cache` 在当前 `pre` 分支报告 145 个 committed changed files 中的 35 个 clone groups 与 21 个 complexity findings；这些属于分支相对 stale `main` 的既有质量债，但按当前计划命令仍阻断阶段 closeout。增量 `--base HEAD` 通过证明本轮没有引入 dead-code/boundary/complexity finding。
- `pnpm eval:smoke` 因本机无 Docker daemon 失败：`failed to connect to the docker API at unix:///var/run/docker.sock`。这是已知环境门控，需在 CI 或具备 Docker 的环境补跑。

## Problem pool

### Fallow audit baseline 与 Experience Gene 工作分支不一致（2026-08-25）

- 来源：Phase 1 要求 `fallow audit --base main`，但当前 `pre` 分支相对 `main` 有 145 个已提交变更文件，其中包含 Web Panel、gateway、route、测试等既有 clone/complexity 债。
- 影响：无法用计划中的精确命令证明 Phase 1 closeout；即使本轮增量审计通过，阶段复选框也不能在 `--base main` 通过前勾完。
- 当前边界：不回退既有分支工作，不用 suppress 掩盖债务；本轮已将新增 helper 复杂度重构到阈值下，并通过 `--base HEAD --no-cache` 的新增发现审计。
- 进入条件：Experience Gene Phase 1 closeout 前，要么把 `main` 同步为包含当前分支已合并基线，要么在主细则冻结一个明确的 activation-commit audit base 并解释为何它等价于 PR merge-base。
- 后续落点：先由 owner mainline 决策审计基线；若选择 activation commit，更新 Phase 1 与 cross-phase 命令后再重跑。
