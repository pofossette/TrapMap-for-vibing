# Skill Lookup 契约漂移修复主线（active）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本细则。步骤使用复选框（`- [ ]`）语法跟踪；复选框只有在代码/文档变更、focused test、事实守卫和必要 closeout 都有证据后才能勾选。
>
> **激活授权：** 2026-08-22 用户 goal：使用 subagent-driven development + git worktree，以最大并行度完成「修复 skill search-by-content 契约漂移」任务。

**Goal:** 让 `POST /v1/retrieval/skills/search-by-content` 成为真实可用的网关端点（artifact-first 语义，复用现代 shared recall 管线），对齐 CLI / 文档 / 评测三面契约，并落地防复发守卫（文档路由路径存在性检查）。

**Architecture:** 判定：**实现路线（不删除产物）**——契约（`skillLookupQuerySchema`/`skillLookupResponseSchema`）、CLI 命令、评测数据集、文档均把该端点视为真实存在的 Phase 18 SKED-01 能力；原实现随 `packages/server` 退役被删除（`a66d94e6 refactor: retire server package`），从未在新架构重建。现代 knowledge-read 已把 skill artifacts 并入检索条目池（`artifact-entry-merge.ts`，entryId == artifactId），因此新实现 = **同一检索管线 + artifact-first 视图映射**：检索后仅保留 artifact 派生 match，并用 artifact 元数据（slug/sourceKind）补全 `SkillLookupResultItem`。领域映射放 backend-core `knowledge-read/domain/`（纯函数），服务接线在 service-knowledge-read，网关层两宿主共用同一契约注册 RouteDef。

**Tech Stack:** TypeScript / Zod contracts / RouteDef 工厂（`createNestAdapter`/`createFastifyAdapter` 消费）/ Vitest / biome / fallow / git worktree + subagent。

---

## Global Constraints（每个任务的 subagent 都隐式继承本节）

- 在本仓库执行 shell 命令直接用 `pnpm`；单文件测试 `pnpm test:file -- <repo-root-relative-test-path>`；单包测试 `pnpm --filter @trapmap/<pkg> test --run <path>`。
- 禁止根级全量 `pnpm test` 再接 `grep/tail/head` 筛失败；watch 必须显式 `pnpm exec vitest`。
- 共享类型/Schema/API shape 以 `packages/contracts/src/index.ts` 与 `packages/contracts/src/domain/` 为准；**本主线不修改 contracts**（schema 已存在，直接消费）。
- 新领域规则必须落在 `packages/backend-core/src/<context>/domain/`（纯函数、零框架、零 DB）；infrastructure 层禁止新增业务判断。
- 新 HTTP 路由必须以 `create<X>RouteDefs(deps)`/`gatewayRouteDef` 工厂声明为 `RouteDef`，由 adapter 消费；禁止任一宿主手写重复路由实现。
- 禁止新增 `@ts-ignore`/`@ts-expect-error`；禁止裸 `as never`/`as unknown as`；确因第三方库类型缺陷必须断言时加 `// lib type gap:` 同行注释。
- 通用工具函数统一从 `@trapmap/lib` 导入；通用第三方依赖声明在 `@trapmap/lib`。
- 跨包导入路径变更或新增包必须跑 `pnpm exec fallow audit --base main`；涉及检索/评测的改动至少补跑相关 focused tests（本机无 docker，`pnpm eval:smoke` 全量留 CI/后续）。
- 文档变化至少运行 `pnpm check:docs` 和 `pnpm check:structure`。
- 运行时语义不变是默认硬约束；本主线唯一行为新增 = skill-lookup 端点与其 artifact-first 视图，其余路由/管线禁止改动。
- 提交粒度：一任务一提交（conventional commits：`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`），message 遵循仓库风格。

---

## 已核实事实（2026-08-22，integrator 勘察）

- 网关缺路由：`packages/host-distributed/src/gateway/route-defs.ts` 只有 `/v1/retrieval/search`（:827）与 `/v3/retrieval/search`（:835）；`packages/host-local/src/nest/gateway/gateway.route-defs.ts` 只有 `/v1/retrieval/search`（:121）。两宿主均无 `/v1/retrieval/skills/search-by-content`。
- CLI 已指向正确路径：`apps/cli/src/commands/skill/search.ts:39` 调用 `POST /v1/retrieval/skills/search-by-content` 并解析 `skillLookupResponseSchema`（当前会 404/解析失败）；CLI 单测 mock apiRequest，无法捕获。
- 评测 harness 自造路径：`scripts/testing/postgres-server-composition.ts:107` 注册该路径但映射到 `runtime.retrievalQuery.search`（v1 entry 形状），而 `evals/retrieval/lib/normalize.ts:119` 的 `normalizeV1SkillLookupResponse` 期望 `matches` 形状——评测面为假阳性。
- 原实现：`packages/server/src/lib/retrieval/capsules/skill-lookup.ts`（该文件已随 packages/server 退役一并删除；artifact-first：intent → 治理过滤 → capsule recall → 按 artifactId 去重 → `SkillLookupResultItem`），历史见 `a66d94e6`。
- 现代管线：`packages/service-knowledge-read/src/artifact-entry-merge.ts` 将 artifacts 并入检索条目池（`id = artifact.id`），`RetrievalMatch`（backend-core `knowledge-read/domain/assembly.ts`）带 entryId/shortcut/labels/scope/requiredLevel/score/reason，但**无 slug/sourceKind、无 artifact 标记**——需 artifact 元数据注册表补全。
- 契约已存在：`packages/contracts/src/domain/retrieval.ts:496`（`skillLookupQuerySchema`：`text`/`maxResults`）与 :534（`skillLookupResponseSchema`：`matches`）。
- 文档漂移：`docs/guides/CLIENT_INTEGRATION.md:53` curl body 用了 `query`/`limit`（应 `text`/`maxResults`）；`docs/reference/api-surface.md:119` 注记"源码来自已删除的 packages/server"；`docs/architecture/components/ARTIFACTS.md`、`docs/operations/TESTING.md:843`、`evals/retrieval/README.md` 均按真实端点表述。
- 端口面：`KnowledgeReadPort`（`packages/backend-core/src/ports/internal-ports.ts:67`）被 host-local 网关 `GatewayRouteDeps.knowledgeRead` 与 host-distributed `internal-client` 共同消费；知识读服务经 `createKnowledgeReadModule(createKnowledgeReadDeps({knowledgeRepo, retrievalQuery}))` 在 `packages/host-local/src/nest/app.module.ts:100` 装配。

## 接口契约（跨任务锁定，A/B 双方照此实现）

```ts
// KnowledgeReadPort 新增（backend-core ports/internal-ports.ts）
skillLookup(params: {
  text: string;
  teamId?: string;
  maxResults?: number;
}): Promise<SkillLookupResponse>;

// knowledge-read 内部路由（service-knowledge-read/routes.ts 新增）
POST /internal/retrieval/skills/search-by-content
  body  schema: skillLookupQuerySchema            // { text, maxResults? }
  resp  schema: skillLookupResponseSchema         // { matches: SkillLookupResultItem[] }

// 网关外部路由（两宿主 RouteDef 新增）
POST /v1/retrieval/skills/search-by-content
  schema: skillLookupQuerySchema                  // body { text, maxResults? }
  resp:   skillLookupResponseSchema

// host-distributed internal-client 新增（host-distributed/gateway/internal-client.ts）
knowledgeRead.searchByContent(params: SkillLookupQuery): Promise<SkillLookupResponse>
//   → POST {knowledgeReadUrl}/internal/retrieval/skills/search-by-content

// backend-core domain 纯函数（backend-core/src/knowledge-read/domain/skill-lookup.ts）
export interface SkillLookupArtifactMeta {
  slug: string;
  sourceKind: SkillSourceKind;
  title?: string; // 缺省回退 match.shortcut
}
export function toSkillLookupMatches(
  matches: RetrievalMatch[],
  artifactMetaByEntryId: ReadonlyMap<string, SkillLookupArtifactMeta>,
): SkillLookupResultItem[];
// 语义：仅保留 entryId 命中 artifact 注册表的 match；按输入顺序（分数降序）；
// 同一 artifactId 只保留第一个；title 回退 match.shortcut；输出经 skillLookupResponseSchema 解析。
```

---

## Workstream A：领域映射 + knowledge-read 服务能力 + 内部路由 + host-local runtime seam + eval composition 接线（wt-a，branch `ml/a-skill-lookup`）

**Files:**
- Create: `packages/backend-core/src/knowledge-read/domain/skill-lookup.ts`
- Create: `packages/backend-core/src/knowledge-read/domain/skill-lookup.test.ts`
- Modify: `packages/backend-core/src/knowledge-read/domain/index.ts`（聚合导出）
- Modify: `packages/backend-core/src/ports/internal-ports.ts`（`KnowledgeReadPort` 增 `skillLookup`，见接口契约）
- Modify: `packages/service-knowledge-read/src/server-retrieval-seam.ts`（新增 `createKnowledgeReadSkillLookupQuery(options)`：复用 `searchKnowledge` 管线 + `services.repos.artifact` 元数据注册表构造 artifactMetaByEntryId）
- Modify: `packages/service-knowledge-read/src/deps.ts`（`KnowledgeReadDeps` 增 `skillLookup`，透传给 module）
- Modify: `packages/service-knowledge-read/src/routes.ts`（新增内部 RouteDef `/internal/retrieval/skills/search-by-content`）+ 对应测试 `routes.test.ts`
- Modify: `packages/service-knowledge-read/src/module.ts`（`KnowledgeReadPort` 实现含 `skillLookup`）
- Modify: `packages/host-local/src/nest/runtime/host-runtime.ts`（`HostLocalRuntime` 增 `skillLookup`，复用 `createRetrievalQuery` 中的 retrievalServices 构造）
- Modify: `packages/host-local/src/nest/app.module.ts`（`createKnowledgeReadDeps` 增 `skillLookup: runtime.skillLookup`）
- Modify: `scripts/testing/postgres-server-composition.ts`（skill-lookup 路由改接 `runtime.skillLookup`，返回真实 `matches` 形状）
- 连带测试：`deps.test.ts`、`server-retrieval-seam.test.ts`（或等价 seam 测试）、`scripts/__tests__/postgres-composition-entrypoints.test.ts`

**Interfaces:**
- Consumes: `skillLookupQuerySchema`/`skillLookupResponseSchema`（contracts 现有）；`searchKnowledge`（service-knowledge-read）；`RetrievalMatch`（backend-core domain/assembly.ts）。
- Produces: `KnowledgeReadPort.skillLookup` 签名、内部路由 `/internal/retrieval/skills/search-by-content`、`toSkillLookupMatches` 纯函数导出、`HostLocalRuntime.skillLookup`。

- [ ] **Step 1:** TDD：先写 `skill-lookup.test.ts`（artifact 命中映射 / 非 artifact 过滤 / 按 artifactId 去重保最高分 / title 回退 / 空输入 / schema 解析），实现 `toSkillLookupMatches`，绿。
- [ ] **Step 2:** `internal-ports.ts` 增 `KnowledgeReadPort.skillLookup`（类型仅签名，先让下游编译通过所需的实现随后补齐）。
- [ ] **Step 3:** service-knowledge-read：`createKnowledgeReadSkillLookupQuery` + deps 接线 + 内部 RouteDef + module 端口实现 + focused tests 全绿。
- [ ] **Step 4:** host-local runtime/app.module 接线 `runtime.skillLookup`，`gateway.schemas.test` 或 runtime 测试补覆盖。
- [ ] **Step 5:** `scripts/testing/postgres-server-composition.ts` 改接真实 `runtime.skillLookup`。
- [ ] **Step 6:** 验证：`pnpm --filter @trapmap/backend-core test --run ...`、`pnpm --filter @trapmap/service-knowledge-read test --run ...`、`pnpm --filter @trapmap/host-local test --run ...`、`pnpm typecheck`、`pnpm exec fallow audit --base main --ci`。
- [ ] **Step 7:** Commit（可多提交）。

## Workstream B：双网关外部 RouteDef + internal-client（wt-b，branch `ml/b-skill-gateway`）

**Files:**
- Modify: `packages/host-local/src/nest/gateway/gateway.route-defs.ts`（外部 RouteDef：schema `skillLookupQuerySchema`，handler 走 `deps.knowledgeRead.skillLookup({ text, maxResults, teamId: ctx.authContext?.activeTeamId })`）
- Modify: `packages/host-local/src/nest/gateway/gateway.route-defs.test.ts`（或 `gateway.schemas.test.ts`：断言路由注册 + handler 调用签名）
- Modify: `packages/host-distributed/src/gateway/route-defs.ts`（外部 RouteDef：`forward(clients.knowledgeRead.searchByContent(skillLookupArgs(ctx)))`）
- Modify: `packages/host-distributed/src/gateway/internal-client.ts`（`searchByContent`：POST 内部路径，body `{ text, maxResults }`，解析 `skillLookupResponseSchema`）
- Modify: `packages/host-distributed/src/gateway/internal-client.test.ts`（断言请求路径/body/响应解析）+ `distributed-acceptance.test.ts`（外部路由可达、转发正确）

**Interfaces:**
- Consumes: 接口契约中 `KnowledgeReadPort.skillLookup` 签名、内部路由路径 `/internal/retrieval/skills/search-by-content`（Workstream A 声明，本任务按契约实现即可并行）。
- Produces: 两宿主外部路由 `/v1/retrieval/skills/search-by-content` + `internalClient.knowledgeRead.searchByContent`。

- [ ] **Step 1:** TDD：先补 `internal-client.test.ts`（searchByContent 请求形状）与 gateway 测试（路由注册/转发），红。
- [ ] **Step 2:** host-local `gateway.route-defs.ts` 外部路由实现（守护路由照旧，handler 直连 port）。
- [ ] **Step 3:** host-distributed `route-defs.ts` + `internal-client.ts` 实现。
- [ ] **Step 4:** 测试转绿：`pnpm --filter @trapmap/host-local test --run src/nest/gateway`、`pnpm --filter @trapmap/host-distributed test --run src/gateway`、`pnpm typecheck`。
- [ ] **Step 5:** Commit。
- 注意：若合并时 A 的签名有出入，rebase 后按 A 实际签名微调；不得自行改接口契约文档。

## Workstream C：文档对齐（wt-c，branch `ml/c-skill-docs`）

**Files:**
- Modify: `docs/guides/CLIENT_INTEGRATION.md`（:53 curl body 改 `{"text": "...", "maxResults": 5}`）
- Modify: `docs/reference/api-surface.md`（:119 行：删除"源码来自已删除 packages/server"注记，改为指向 `packages/service-knowledge-read/src/routes.ts` 与网关 RouteDef）
- Modify: `docs/architecture/components/ARTIFACTS.md`（核对 :359 / :571 处端点描述与示例 body 对齐契约）
- Modify: `docs/operations/TESTING.md`（:843 附近：表述保持"端点已纳入 retrieval eval 合同边界"，补一句"真实网关已实现该端点"）
- Modify: `evals/retrieval/README.md`（:38/:74/:93 等：若注明"仅在 eval composition 存在"则改为真实端点口径）

**Interfaces:**
- Consumes: 仅文档；不改代码与契约。
- Produces: 文档面与契约一致；`check:docs`/`check:structure` 全绿。

- [ ] **Step 1:** 逐文件核对并将 curl 示例 body 改为 `text`/`maxResults`；删除 packages/server（已删除）源码注记。
- [ ] **Step 2:** 运行 `pnpm check:docs`、`pnpm check:structure` 全绿（含 link 校验通过）。
- [ ] **Step 3:** Commit `docs(retrieval): align skill search-by-content surface docs with contract`。

## Workstream D：防复发守卫——文档路由路径存在性检查（wt-d，branch `ml/d-route-surface-guard`）

**Files:**
- Create: `scripts/check-route-surface.ts`
- Create: `scripts/__tests__/check-route-surface.test.ts`
- Modify: `scripts/check-docs.ts`（新增 blocking step `route-surface`：`pnpm exec tsx scripts/check-route-surface.ts`）

**设计：** 守卫读取两宿主网关 RouteDef 文件（`packages/host-local/src/nest/gateway/gateway.route-defs.ts`、`gateway.cron-route-defs.ts`、`packages/host-distributed/src/gateway/route-defs.ts`）中的 `path: '<literal>'` 字面量 → 真实路由清单；扫描指定文档（`docs/reference/api-surface.md`、`docs/guides/CLIENT_INTEGRATION.md`、`docs/architecture/components/ARTIFACTS.md`）中的 `/v1|/v2|/v3` 路径字面量 → 文档路由清单；断言 **文档 ⊆ 真实路由** 且 **真实路由 ⊆ 文档（api-surface.md）**；例外清单常量（seed：`/v2/retrieval/search`——CLI `--v2` 引用的胶囊检索端点两宿主均未实现，属登记册 deferred），每个例外必须带注释引用问题池/登记册条目；不把例外偷偷用于新路径（新路径必须真实存在）。`:param` 型路径做归一化（`/v1/traps/:trapId` 形态一致即算匹配）。

**Interfaces:**
- Consumes: 上述 RouteDef 文件与文档文件（契约最终面，含 A/B 合并后新增的 `/v1/retrieval/skills/search-by-content`）。
- Produces: `pnpm check:docs` 新增 blocking 步骤；脚本可被 vitest 单测覆盖（纯函数拆分：`collectRoutePathsFromSource` / `collectDocumentedPaths` / `checkSurface(real, documented, exemptions)`）。

- [ ] **Step 1:** TDD：`scripts/__tests__/check-route-surface.test.ts` 覆盖三纯函数 + 例外语义，红。
- [ ] **Step 2:** `scripts/check-route-surface.ts` 实现；接入 `scripts/check-docs.ts`（blocking）。
- [ ] **Step 3:** 在**合并后基线**（A/B/C 已合入 main）跑 `pnpm check:docs` 全绿；独立在 base main 跑应仅因 skill-lookup/v2 两条体现差异（skill-lookup 将被 A/B 的真实路由覆盖，v2 走例外）。
- [ ] **Step 4:** Commit `chore(docs): add route-surface existence guard to check:docs`。

---

## 合并顺序与 Completion Gates（integrator 在主仓库执行）

合并顺序 **A → B → C → D**（D 依赖 A/B/C 后的最终契约面；C 依赖 B 后的真实端点口径）。后合并者先 `git fetch && git rebase main`。

- [ ] `pnpm typecheck` 全绿
- [ ] 包级测试：backend-core / service-knowledge-read / host-local / host-distributed / cli 全绿
- [ ] `pnpm test:deployment-smoke` / `test:runtime-foundations` 全绿
- [ ] `pnpm check:docs` / `check:structure` / `check:asserts` / `check:imports` 全绿；无新增断言豁免
- [ ] `pnpm exec fallow audit --base main` exit 0
- [ ] CLI `skill search-by-content` 端点契约测试（新外部路由）由 B 的 gateway 测试覆盖
- [ ] eval 面：`evals/retrieval` 相关单测绿；`pnpm eval:smoke` 全量环境门控，回填登记册

## 问题池（执行期新发现进这里，closeout 逐条清空或转登记册）

- **`/v2/retrieval/search` 网关面缺失**（2026-08-22 integrator 勘察发现）：CLI `apps/cli/src/commands/retrieval.ts:234`（`--v2`）调用该路径，两宿主 RouteDef 均未注册；api-surface.md 有该行。与 skill-lookup 同源（v2 胶囊检索原实现已删除，随 packages/server 退役）。处置：closeout 转登记册 deferred（进入条件：CLI `--v2` 或胶囊检索产品需求）。
- **host-local 网关缺少 `/v3/retrieval/search`**（2026-08-22 勘察发现）：host-distributed 有（:835），host-local 无；CLI `load`（`apps/cli/src/commands/load.ts:80`）在 host-local 后端下会 404。处置：closeout 转登记册 deferred 或在后续宿主面 parity 任务中修复。

## closeout 要求

- [ ] 全部 A/B/C/D 复选框勾选且证据（commit hash + 门禁摘要）完整
- [ ] 问题池逐条处置；转 deferred 的条目回写 `docs/todos/open-debt-and-compromises.md`（含来源/影响/进入条件/落点）
- [ ] `docs/todos/README.md` 活跃索引移除本细则；`plan.md` 状态切换
- [ ] 本细则 `git mv` 至 `docs/archived/archived-plans/skill-lookup-surface-mainline-archived.md`，同步归档三件套
