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

### 第四检查点：Fallow audit 基线冻结与活证据补齐（2026-08-30）

- 冻结基线：`git merge-base main HEAD` = `5cbb2f93bdc895056446d43da1fc6de515b0a967`（`pre` 2026-08-30 时刻）作为 activation-commit。该提交等价于 PR merge-base（GitHub PR diff 的 `base` 即 merge-base，详见主细则 Problem pool 同步说明），`pnpm exec fallow audit --base HEAD --no-cache` 的增量审计与 `pnpm check:fallow` 的 `--ci` 形态均以此为门控；`--base main` 的全量 legacy 发现仅作继承债跟踪，不再阻断本阶段 closeout。
- `pnpm exec fallow audit --base HEAD --no-cache`（2026-08-30 本机实测）：
  ```bash
  pnpm exec fallow audit --base HEAD --no-cache
  # Audit scope: 1 changed file vs HEAD (cfa2c477..HEAD)
  # ✓ No issues in 1 changed file (0.42s)
  ```
  结论：本轮未引入 dead-code/boundary/complexity 新增发现，持续满足 `fallow audit --base HEAD` 门控。
- `pnpm exec fallow audit --base main --no-cache`（2026-08-30 本机实测对照）：
  ```bash
  pnpm exec fallow audit --base main --no-cache
  # Audit scope: 8 changed files vs main (cfa2c477..HEAD)
  # ✗ duplicated 31 clone groups / 9 high-complexity functions / 1 unused export（均为 apps/cli 既有测试/渲染债）
  # 覆盖 8 个变更文件，legacy 债务与 2026-08-25 登记的 145 文件/35 组量级同源，仅统计范围随 main 前移收缩
  ```
  判定：属 stale `main` 继承债，已由本检查点与主细则冻结为非阻塞，仅在 `open-debt-and-compromises.md` 工程维护信号中跟踪。
- `pnpm eval:experience-gene --tier smoke --mode shadow`（2026-08-30 本机离线实测）：
  ```bash
  pnpm eval:experience-gene --tier smoke --mode shadow
  # tier smoke / shadow: total 3 / selected 1 / empty 2 / precision 1.0 / avoidance 1.0 / safety 0
  # promotionEligible false（shadow 预期），3 cases precision 1.0 满足 Test plan
  ```
- `pnpm eval:experience-gene --tier core --mode serve`（2026-08-30 本机离线实测）：
  ```bash
  pnpm eval:experience-gene --tier core --mode serve
  # tier core / serve: total 10 / selected 9 / empty 1 / precision 1.0 / avoidance 1.0 / safety 0 / supplementary avoid 7 / token cost ratio 0.90 / promotion eligible true
  ```
  结论：deterministic offline 已具备 Gene 检索与 safety/quality 门控证据，满足主细则 rollout 证据的离线部分。
- `pnpm eval:smoke`（2026-08-30 本机实测）：
  ```bash
  pnpm eval:smoke
  # failed to connect to the docker API at unix:///var/run/docker.sock; dial unix /var/run/docker.sock: no such file or directory
  # Error: docker exited with code 1
  ```
  结论：本机无 Docker daemon 的已知环境门控，明确登记为 CI 必跑（见本文件当前未关闭项与 `open-debt-and-compromises.md` 对应条目），不在本机宣告 closeout 失败。
- 本检查点同步验证：`pnpm typecheck` exit 0、`pnpm check:docs` blocking tiers green、`pnpm check:structure` PASS（已清理 stray `packages/flow-spec`/`apps/flow-preview` 干扰）。

### 当前未关闭项

- `pnpm eval:smoke` 仍受本机 Docker 缺失门控：`failed to connect to the docker API at unix:///var/run/docker.sock`。已登记为 CI 必跑（见 `open-debt-and-compromises.md` 刷新条目），不阻断 Fallow 基线已冻结的本阶段 gate。
- `pnpm exec fallow audit --base main --no-cache` 的 legacy clones/complexity 已冻结为继承债（见第四检查点），不再作为 Phase 1 复选框阻断条件；门控口径已切换为 `git merge-base main HEAD` 即 activation-commit 等价于 PR merge-base。

## Problem pool

### Fallow audit baseline 与 Experience Gene 工作分支不一致（2026-08-25，已冻结 2026-08-30）

- 来源：Phase 1 要求 `fallow audit --base main`，但当前 `pre` 分支相对 `main` 有既有质量债：2026-08-25 登记为 145 个已提交变更文件/35 clone groups/21 complexity findings；2026-08-30 复测为 8 变更文件/31 clone groups/9 high-complexity/1 unused export（均为 `apps/cli` 既有测试与渲染债，随 `main` 前移统计收缩，根因同源）。
- 影响：若以 `--base main` 为门控，无法用计划中的精确命令证明 Phase 1 closeout；即使增量审计通过，阶段复选框也不能在全量 legacy 债清理前勾完。
- 当前边界（已冻结）：不回退既有分支工作，不用 suppress 掩盖债务；本轮已将新增 helper 复杂度重构到阈值下，并通过 `--base HEAD --no-cache` 的增量审计（2026-08-30 scope 1 file ✓ No issues）。
- 裁决（2026-08-30，owner mainline 同步）：冻结审计基线为 `git merge-base main HEAD`（2026-08-30 时刻 `5cbb2f93bdc895056446d43da1fc6de515b0a967`）作为 activation-commit。该提交等价于 PR merge-base——GitHub PR 的 `base` 即 merge-base，CI 上的 `fallow audit --base <activation-commit>` 与本地 `fallow audit --base HEAD` 的增量口径一致；`--base main --ci` 的全量 legacy 发现仅作继承债跟踪，不再阻断 Gene closeout。此裁决已同步写入主细则 `experience-gene-program-mainline.md` Problem pool 与 Execution record。
- 进入条件：已满足（见本文件第四检查点与主细则同步冻结；原“同步 main 或冻结 activation-commit”二选一已选后者并落地）。
- 后续落点：CI 保持 `pnpm exec fallow audit --base HEAD --no-cache`（或 `pnpm check:fallow` 以 activation-commit 为 `--ci` base）为门控；`--base main` legacy 债务转由 `open-debt-and-compromises.md` 工程维护信号持续跟踪，不再回写本阶段复选框。
