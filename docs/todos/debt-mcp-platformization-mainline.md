# 债务全量派发 + Agent MCP 接入 + 微服务平台化主线

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施本细则。步骤使用复选框（`- [ ]`）语法跟踪；复选框只有在代码/文档变更、focused test、事实守卫和必要 closeout 都有证据后才能勾选。
>
> **激活授权：** 2026-08-21 用户 goal 显式激活本主线，并对登记册做出三项裁决：① 登记册条目**全量派发**（进入条件由本主线显式覆盖，属登记册使用规则中"用户显式要求开始实施"路径）；② MCP 接入采用**完整读写**面；③ 微服务优化走 **Level 3 平台化方向**（DEPLOYMENT.md 冻结声明由本主线显式解除并回写）。

**Goal:** 以 git worktree + subagent-driven development 并行推进三条工作流——A：长期债务登记册全量派发清偿并净收缩登记册；B：新建 `apps/mcp` MCP server 让外部 agent 完整读写接入 TrapMap；C：微服务逻辑优化升级至 Level 3 方向（韧性硬化 + 编排资产 + 决策冻结）。

**Architecture:** 三条工作流各占一个 git worktree 与一条集成分支，任务级 fresh subagent + 两阶段评审；A 先行清偿债务解锁干净基线，B 以 gateway HTTP API 为唯一后端数据源做外层协议封装（TrapMap 服务本体不实现 MCP 协议），C 按"先冻结决策、再韧性硬化、最后编排/隔离落地"的顺序推进，所有新 HTTP 面走 RouteDef 工厂，领域规则落 backend-core domain 层。

**Tech Stack:** pnpm workspace / TypeScript / Vitest multi-project / Zod contracts / Drizzle PostgreSQL / cordis assembly / `@modelcontextprotocol/sdk`（仅 apps/mcp）/ Kubernetes manifests（k8s/base，kind 验证）。

---

## Global Constraints（每个任务的 subagent 都隐式继承本节）

- 在本仓库执行 shell 命令直接用 `pnpm`；单文件测试 `pnpm test:file -- <repo-root-relative-test-path>`；单包测试 `pnpm --filter @trapmap/<pkg> test --run <path>`。
- 禁止根级全量 `pnpm test` 再接 `grep/tail/head` 筛失败；watch 必须显式 `pnpm exec vitest`。
- 共享类型/Schema/API shape 以 `packages/contracts/src/index.ts` 与 `packages/contracts/src/domain/` 为准；新增枚举、字面量联合、共享接口默认放就近 `enum-types/` 目录经 `index.ts` 聚合导出。
- 新领域规则必须落在 `packages/backend-core/src/<context>/domain/`（纯函数、零框架、零 DB）；infrastructure 层禁止新增业务判断。
- 新 HTTP 路由必须以 `create<X>RouteDefs(deps)` 工厂声明为 `RouteDef`（`packages/backend-core/src/http/route-contract.ts`），由 `createNestAdapter`/`createFastifyAdapter` 消费；禁止任一宿主手写重复路由实现。
- 禁止新增 `@ts-ignore`/`@ts-expect-error`；禁止裸 `as never`/`as unknown as` 桥接；确因第三方库类型缺陷必须断言时加 `// lib type gap:` 同行注释。
- 通用工具函数（`nowIso`/`timeout`/`truncate`/`normalizeLabel`/`uniq`/`chunk`/`prefixedId`/`sha256` 等）统一从 `@trapmap/lib` 导入，禁止包内重复实现；通用第三方依赖声明在 `@trapmap/lib`（app 专用依赖如 `@modelcontextprotocol/sdk` 只声明在 `apps/mcp`）。
- 跨包导入路径变更或新增包必须跑 `pnpm exec fallow audit --base main`；涉及检索/摘要/治理/feedback/fixtures/eval runner 的改动至少补跑 `pnpm eval:smoke`（离线部分）。
- 文档变化至少运行 `pnpm check:docs` 和 `pnpm check:structure`。
- 运行时语义不变是默认硬约束；行为升级只允许发生在显式声明的任务内（A4/A7/A10/B 全部/C2-C8），且需评审留痕。
- 每任务结束：相关包 focused tests + `pnpm typecheck` 全绿后才允许勾选复选框并提交。

---

## 执行模型：git worktree + subagent 派发协议

### Worktree 布局（Task A0 一次性创建）

```bash
# 在主仓库根目录执行一次；三个 worktree 各对应一条工作流
git worktree add ../Trap-Map-wt-a -b ml/a-debt-dispatch main
git worktree add ../Trap-Map-wt-b -b ml/b-mcp-agent main
git worktree add ../Trap-Map-wt-c -b ml/c-platformization main
(cd ../Trap-Map-wt-a && pnpm install)
(cd ../Trap-Map-wt-b && pnpm install)
(cd ../Trap-Map-wt-c && pnpm install)
```

- 工作流内任务由 fresh subagent 顺序执行，一任务一提交（conventional commits：`feat:`/`fix:`/`refactor:`/`docs:`/`chore(debt):`）。
- 合并顺序 **A → B → C**；后合并者先 `git fetch && git rebase origin/main`（或本地 main），文档冲突以权威页（SYSTEM_TRUTH_SOURCES / REPO_STRUCTURE / DEPLOYMENT）为准手工收敛。
- 每 workstream 合并前跑 golden 子集（见各工作流末尾"工作流门禁"）；三条全部合并后在主仓库跑全量 Completion Gates。

### Subagent 派发协议（每任务相同）

1. **Implementer subagent**：prompt = 本节 + Global Constraints + 该任务全文（含 Files/Interfaces/Steps）+ worktree 绝对路径 + 验证命令。要求：先写失败测试（TDD 任务），实现至绿，运行任务声明的门禁命令，按步骤提交。
2. **Reviewer subagent（阶段一：规格符合性）**：对照任务验收边界逐条核对 diff；输出 PASS / FAIL+理由。
3. **Reviewer subagent（阶段二：代码质量）**：检查断言禁令、lib 工具复用、RouteDef 工厂、domain 规则落点、注释纪律；输出 PASS / FAIL+理由。
4. **Integrator（主会话）**：FAIL 则带理由重新派发；PASS 则在主细则勾选该任务复选框并回写证据（commit hash + 门禁摘要）。

### 登记册清理政策（防无限追加，硬规则）

- 执行期间：被派发条目**原位**更新——勾选 `[x]` 并追加一行证据（日期 + commit hash + 最小验证摘要）；不在登记册新增任何条目。
- 执行中发现的新问题一律进本细则「问题池」，不进登记册。
- Closeout（Task A16）：已关闭条目从登记册**物理删除**（历史由归档主细则 + git history 承载）；仍 deferred 条目保留并刷新进入条件；登记册必须净收缩。
- 主线完成后：本细则 `git mv` 至 `docs/archived/archived-plans/debt-mcp-platformization-mainline-archived.md`，同步 `docs/archived/README.md` 归档表与 `docs/todos/README.md`。

---

## Workstream A：登记册全量派发与清理（worktree wt-a）

登记册 triage 总表（派发裁决，2026-08-21 用户确认全量派发）：

| 登记册条目 | 处置 | 任务 |
|---|---|---|
| 兼容层债务持续存在 | 派发（调查收尾） | A11 |
| 工程维护信号偏高 | 派发（fallow 基线刷新 + scoped 收敛） | A12 |
| 平台化与服务自治尚未成熟 | 并入 Workstream C | C1 |
| 物理数据隔离与 PgBouncer | 派发（试点，条件任务） | C8 |
| 安全候选与文档事实校准 | 派发 | A13 |
| 重复工具函数回潮与工厂模式一致性 | 核验后关闭 | A12 内核验 |
| knowledgeRepo listByFilter LIMIT 100 暴露 | 派发 | A4 |
| eval:smoke 需 CI 补跑 | 派发【环境门控】 | A14 |
| `test:import-export` 脚本损坏 | 派发 | A2 |
| gateway actorId 字段放宽族 | 拍板备忘（人工门） | A6 |
| governance remediation-complete 契约反转已修复 | 已完成 → 清理关闭 | A1 |
| Task 9 listMine 空集 follow-up | 派发（证伪/证实后关闭） | A5 |
| candidates 表双份已单源化 | 已完成 → 清理关闭 | A1 |
| vitest fastify 别名漂移已修复 | 已完成 → 清理关闭 | A1 |
| web-panel real admin 路径不可运行 | 派发 | A10 |
| capability-model 拆分 | 派发 | A8 |
| OTel 双份接线收敛 | Phase 4 已完成 → 核验关闭 | A1 |
| Consul 双份实现收敛 | Phase 4 已完成 → 核验关闭 | A1 |
| EvalSeedPort 收窄 | 派发 | A9 |
| internal-client review/governanceReview 双组合并 | 已关闭 → 清理 | A1 |
| host-distributed shared/ports.ts 业务下沉 | Phase 3/4 已退役 → 核验关闭 | A1 |
| candidates 3 个 legacy JSONB 列 | 派发（迁移窗口批） | A7 |
| task_queue_type_dedupe_idx 冗余索引 | 派发（迁移窗口批） | A7 |
| store_snapshot 幽灵表 | 派发（迁移窗口批） | A7 |
| host-distributed Dockerfile 冗余 COPY client-core | 已关闭 → 清理 | A1 |
| web-panel 5 个预存测试失败 | 派发 | A3 |
| apps workspace 组装中心迁移遗留 | 遗留1 已被 Phase 4 T3 退役 → 核验关闭；遗留2 并入 A12 | A1+A12 |
| 统一优雅组装中心（assembly）主线 | 历史记录 → 归档清理 | A1 |
| 判断类节点（D8）消费方调用点迁移 | 已关闭 → 清理（llm/hybrid 变体保留为 deferred） | A1 |
| cron 检索版本联动数据流缺口 | 已关闭 → 清理 | A1 |
| 本地 trap-map-host-distributed 镜像漂移 | 派发【环境门控】 | A15 |

### Task A0: worktree 环境准备与 triage 回写

**Files:**
- Modify: `docs/todos/open-debt-and-compromises.md`（仅在登记册顶部追加一段"2026-08-21 全量派发裁决"说明，引用本细则；不新增条目）
- Modify: 本细则（勾选 A0）

- [x] **Step 1:** 在主仓库执行上文 Worktree 布局命令，确认三个 worktree `pnpm install` 成功（`pnpm exec vitest --version` 可运行）。
- [ ] **Step 2:** 在 wt-a 中给登记册顶部追加裁决段（≤5 行）：全量派发授权来源、本细则链接、"新问题进主细则问题池"指引。
- [ ] **Step 3:** 提交：

```bash
git add docs/todos/open-debt-and-compromises.md
git commit -m "chore(debt): 登记 2026-08-21 全量派发裁决并链接平台化主线"
```

### Task A1: 登记册陈旧条目清理（关闭已被后续主线完成的项）

**Files:**
- Modify: `docs/todos/open-debt-and-compromises.md`
- Verify: `packages/host-local/src/nest/observability/`、`packages/host-distributed/src/shared/telemetry.ts`、`packages/host-distributed/src/index.ts`（核验用，不改）

**Interfaces:**
- Produces: 登记册中以下条目标记 `[x] 已核验关闭（2026-08-21，Phase 3/4 证据）`：OTel 双份接线收敛、Consul 双份实现收敛、shared/ports.ts 业务下沉、apps workspace 遗留1（direct-run seam）、internal-client 双组合并、candidates 表双份单源化、vitest fastify 别名漂移、Dockerfile 冗余 COPY、remediation-complete 契约反转、listMine 之外的已关闭 D8/cron 条目、assembly 主线历史记录段。

- [x] **Step 1:** 逐条核验（只读）：OTel 单插件（host-local nest observability 模块与 host-distributed telemetry 共用 backend-core 支持）、Consul 单实现（DiscoveryPort framework-free adapter）、direct-run seam 已退役（`packages/host-local/src/index.ts` 无 `isDirectExecution`）、`shared/ports.ts` 不存在。
- [ ] **Step 2:** 对核验通过的条目勾选并追加一行关闭证据（引用 Phase 3/4 归档文档 + 本次核验日期）；核验不通过的条目保持 open 并移入本细则问题池说明偏差。
- [ ] **Step 3:** 运行 `pnpm check:docs && pnpm check:structure`，预期全绿。
- [ ] **Step 4:** 提交：

```bash
git add docs/todos/open-debt-and-compromises.md
git commit -m "chore(debt): 关闭已被 assembly Phase 3/4 与既有主线完成的登记条目"
```

### Task A2: `test:import-export` 脚本修复

**Files:**
- Modify: `package.json`（根，`test:import-export` script）
- Verify: `scripts/test-skill-import-export.ts`（不改逻辑）

**Interfaces:**
- Consumes: `tsconfig.base.json` 的 paths 映射（可解析全部 `@trapmap/*` 包）。
- Produces: `pnpm test:import-export` 可通过 npm script 直接运行（模块解析修复；运行时仍需 skill bundles 与 PostgreSQL，属环境前提不变）。

- [x] **Step 1:** 修改根 `package.json`：

```json
"test:import-export": "tsx --tsconfig tsconfig.base.json scripts/test-skill-import-export.ts"
```

- [ ] **Step 2:** 验证模块解析修复（无 PG 环境下允许在连接阶段失败，但不得再出现 `Cannot find module '@trapmap/service-knowledge-write'`）：

```bash
pnpm test:import-export 2>&1 | head -20
```

Expected: 不再出现模块解析错误；有环境时报连接/前置缺失，无环境时报对应运行错误。
- [ ] **Step 3:** 有 docker/PG 环境时完整跑通一次并在登记册回填结果；无环境则按登记册口径标注"CI 需补跑"。
- [ ] **Step 4:** 提交：

```bash
git add package.json
git commit -m "fix(scripts): test:import-export 经 tsconfig.base.json 解析 workspace 包"
```

### Task A3: web-panel 预存测试修复（stubEnv/MODE）

**Files:**
- Modify: `apps/web-panel/src/services/admin-panel-service-context.test.ts` 及其余 stubEnv/MODE 相关失败测试（以实际运行为准）
- Verify: `apps/web-panel/vitest.config.ts` 或包内测试 setup（如需补 setup 文件则 Create: `apps/web-panel/src/test/setup.ts`）

**Interfaces:**
- Produces: `pnpm --filter @trapmap/web-panel test --run` 全绿（13 files / 15 tests 基线之上零失败）。

- [ ] **Step 1:** 运行并记录失败画像：

```bash
pnpm --filter @trapmap/web-panel test --run 2>&1 | tail -40
```

- [ ] **Step 2:** 逐个修复：将测试中对 `import.meta.env`/MODE 的隐式依赖改为 `vi.stubEnv(...)` + `vi.unstubAllEnvs()` 显式注入（对齐 vitest 环境变量注入语义）；需要全局 MODE 的用例在文件顶部 `vi.stubEnv('MODE', 'test')` 或改用 `vi.mock` 注入。
- [ ] **Step 3:** 复跑 Step 1 命令，Expected: 全绿（0 failed）。
- [ ] **Step 4:** 回写登记册条目（web-panel 5 个预存测试失败 → `[x]` + 证据行）与 `docs/operations/TESTING.md` web-panel 小节（如该节声称门禁不可绿，需更正）。
- [ ] **Step 5:** 提交：

```bash
git add apps/web-panel docs/operations/TESTING.md docs/todos/open-debt-and-compromises.md
git commit -m "fix(web-panel): 修复预存 stubEnv/MODE 测试失败，恢复测试门禁可绿"
```

### Task A4: knowledgeRepo listByFilter LIMIT 100 分页契约

**Files:**
- Modify: `packages/service-knowledge-write/src/knowledge-projection.ts`（owner `listByFilter`）
- Modify: `packages/backend-core/src/knowledge-write/`（port 签名，若有独立 ports 文件则以实际为准）
- Modify: `packages/host-local/src/nest/app.module.ts`（knowledgeProjection 桥透传分页参数）
- Modify: `packages/service-knowledge-read/src/`（read-side port 同步声明语义）
- Test: `packages/service-knowledge-write/src/pg-ports.test.ts`（新增 >100 条用例）
- Docs: `docs/reference/api-surface.md`

**Interfaces:**
- Produces: owner/read 两侧 `listByFilter(filter, page?: { offset: number; limit: number })` → `Promise<{ items: KnowledgeEntryRecord[]; total: number }>`；`page` 缺省时 `offset=0, limit=100`（向后兼容默认上限，但语义显式化）；桥两侧签名同步。

- [x] **Step 1:** 写失败测试（pg-ports.test.ts）：seed 120 条同 filter 条目，断言 `listByFilter(filter)` 返回 `items.length === 100 && total === 120`；`listByFilter(filter, { offset: 100, limit: 50 })` 返回 20 条且 `total === 120`。
- [ ] **Step 2:** 运行确认失败：

```bash
pnpm --filter @trapmap/service-knowledge-write test --run src/pg-ports.test.ts
```

- [ ] **Step 3:** 实现：owner projection SQL 改 `LIMIT $n OFFSET $m` + `COUNT(*) OVER()`（或并行 count 查询）取 total；桥与 read-side port 同步签名；调用方编译错误逐一修正（不静默截断）。
- [ ] **Step 4:** 复跑 Step 2，Expected: PASS；再跑 `pnpm --filter @trapmap/service-knowledge-read test --run` 与 host-local focused tests。
- [ ] **Step 5:** 回写 `docs/reference/api-surface.md`（listByFilter 分页语义）与登记册条目 `[x]`。
- [ ] **Step 6:** 提交：

```bash
git add packages/service-knowledge-write packages/service-knowledge-read packages/backend-core packages/host-local docs/reference/api-surface.md docs/todos/open-debt-and-compromises.md
git commit -m "feat(knowledge): listByFilter 显式分页契约，消除 LIMIT 100 静默截断"
```

### Task A5: listMine 空集 follow-up 证实/证伪并关闭

**Files:**
- Test: `packages/service-knowledge-read/src/`（listMine 过滤字段回归测试，位置随实际 projection 文件）
- Modify: 视结论而定（若证实：read-side projection 或桥层按 `owner.userId` 对齐过滤字段）

- [x] **Step 1:** 写探针测试：构造带 `owner.userId` 的知识条目，调用 read-side `entryProjection.listMine`，断言非空。运行记录结果。
- [ ] **Step 2a（证伪）:** 若现有实现已正确返回：登记册条目标记 `[x] 已证伪关闭（2026-08-21）`，附测试证据，测试保留为回归用例。
- [ ] **Step 2b（证实）:** 若返回空集：在 read-side projection 按 `owner.userId` 对齐过滤字段，补 host-local 与 distributed listMine 非空回归测试，回写 `docs/reference/api-surface.md`。
- [ ] **Step 3:** 门禁：相关包 focused tests + `pnpm test:deployment-smoke` + 裸 `pnpm typecheck`。
- [ ] **Step 4:** 提交：

```bash
git add -A
git commit -m "test(knowledge): listMine owner.userId 过滤断言（证实/证伪收口）"
```

### Task A6: gateway actorId 放宽族拍板备忘（人工门）

**Files:**
- Create: `docs/todos/actor-id-relaxation-decision.md`（拍板备忘，closeout 后随主线归档）
- Modify(拍板后): `packages/host-distributed/src/gateway/route-defs.ts`、`routes.test.ts`

**Interfaces:**
- 备忘内容必须包含：两类放宽的精确 schema 清单（actorId optional 族 6 个 schema；空串 query 族 3 个 schema）、现状安全边界（`requireTrustedActor` 保证 handler actor 来自会话）、两个选项的影响分析与推荐项。

- [x] **Step 1:** 写备忘（含推荐：恢复 `actorId: z.string().min(1)` 必填与 query 非空校验，因无已知调用方依赖放宽语义，恢复可消除契约漂移）。
- [ ] **Step 2:** 向人类呈现备忘等待拍板（question 工具）。**此复选框在人类裁决前不得勾选。**
- [ ] **Step 3a（拍板恢复）:** 修改 route-defs.ts 恢复必填/非空约束，`routes.test.ts` 补 400 断言（body 缺 actorId → 400；query `userId: ''` → 400）；跑 gateway focused tests + `pnpm test:deployment-smoke` + 裸 `pnpm typecheck`。
- [ ] **Step 3b（拍板保留）:** 在登记册条目标注裁决结论并关闭，不改代码。
- [ ] **Step 4:** 提交：

```bash
git add docs/todos/actor-id-relaxation-decision.md packages/host-distributed docs/todos/open-debt-and-compromises.md
git commit -m "docs(gateway): actorId 放宽族人类拍板结论与（可选）契约恢复"
```

### Task A7: 迁移窗口批处理（JSONB 列 / 冗余索引 / store_snapshot / conflict_relations）

**Files:**
- Create: `packages/service-candidate-ingestion/drizzle/0001_drop_candidates_legacy_jsonb.sql`
- Modify: `packages/persistence-schema/src/queue.ts`（移除 `task_queue_type_dedupe_idx` 定义）
- Create: `packages/persistence-schema/drizzle/0001_drop_task_queue_type_dedupe_idx.sql`（目录以 persistence-schema 实际迁移布局为准）
- Modify: `packages/service-identity-access/drizzle/0000_identity_access_baseline.sql`（删除 `CREATE TABLE store_snapshot`）
- Docs: `docs/reference/DATABASE_SCHEMA.md`
- Test: `packages/service-job-runtime/src/async-runtime.test.ts`（回归）、identity-access / candidate-ingestion migrations 测试

**Interfaces:**
- Produces: 全新环境应用迁移后 DB 表结构 = persistence-schema 单源 64 表（无 store_snapshot、无 candidates 3 个 legacy JSONB 列、无冗余索引）；表清单守卫保持 64=64。

- [x] **Step 1:** 写 SQL：

```sql
-- 0001_drop_candidates_legacy_jsonb.sql
ALTER TABLE candidates
  DROP COLUMN IF EXISTS analysis_snapshot,
  DROP COLUMN IF EXISTS duplicate_case,
  DROP COLUMN IF EXISTS manual_result;
```

```sql
-- 0001_drop_task_queue_type_dedupe_idx.sql
DROP INDEX IF EXISTS task_queue_type_dedupe_idx;
```

- [ ] **Step 2:** 同步代码侧：`queue.ts` 删除该索引定义；identity-access baseline 删除 store_snapshot CREATE TABLE 块；conflict_relations 裁决记录到 DATABASE_SCHEMA.md（默认：有意不建模，注明归属 governance-review 独立 baseline，待该服务演进时一并处理）。
- [ ] **Step 3:** 门禁：

```bash
pnpm --filter @trapmap/service-candidate-ingestion test --run
pnpm --filter @trapmap/service-identity-access test --run
pnpm --filter @trapmap/service-job-runtime test --run src/async-runtime.test.ts
pnpm test:deployment-smoke
```

Expected: 全绿（含表清单守卫 64=64）。
- [ ] **Step 4:** 回写 DATABASE_SCHEMA.md 与登记册三条目 `[x]`；提交：

```bash
git add packages/service-candidate-ingestion packages/persistence-schema packages/service-identity-access docs/reference/DATABASE_SCHEMA.md docs/todos/open-debt-and-compromises.md
git commit -m "chore(schema): 迁移窗口批处理——清理 legacy JSONB 列/冗余索引/store_snapshot 幽灵表"
```

### Task A8: capability-model 拆分

**Files:**
- Create: `packages/backend-core/src/runtime/capability-model/types.ts`
- Create: `packages/backend-core/src/runtime/capability-model/defaults.ts`
- Create: `packages/backend-core/src/runtime/capability-model/validation.ts`
- Create: `packages/backend-core/src/runtime/capability-model/resolution.ts`
- Modify: `packages/backend-core/src/runtime/capability-model.ts`（改为 barrel re-export，消费方 import 路径不变）
- Test: 既有 capability-model 相关测试迁移/保持通过

**Interfaces:**
- Produces: `runtime/capability-model.ts` 继续导出原有全部公共符号（纯移动，零行为变化）；内部模块职责：types（类型定义）、defaults（默认值）、validation（校验）、resolution（宿主能力组合推导）。

- [x] **Step 1:** 记录拆分前基线：`wc -l packages/backend-core/src/runtime/capability-model.ts`（500 行）+ 既有测试全绿截图/摘要。
- [ ] **Step 2:** 按符号归属机械移动到四个模块（不改任何实现体）；barrel 文件 `export * from './capability-model/types.js'` 等聚合。
- [ ] **Step 3:** 门禁：backend-core focused tests + `pnpm typecheck` + `pnpm exec fallow audit --base main`。
- [ ] **Step 4:** 回写登记册条目 `[x]`；提交：

```bash
git add packages/backend-core docs/todos/open-debt-and-compromises.md
git commit -m "refactor(runtime): capability-model 按类型/默认值/校验/推导拆分（行为不变）"
```

### Task A9: EvalSeedPort 收窄

**Files:**
- Create: `packages/backend-core/src/testing/eval-seed-port.ts`
- Modify: `packages/host-local/src/nest/runtime/host-services.ts`（HostLocalServices 暴露面收窄为 seed 能力接口）
- Modify: `evals/retrieval/lib/adapters.ts`（改消费窄接口）
- Test: `packages/backend-core/src/testing/eval-seed-port.test.ts`（类型级契约测试）+ evals 受影响测试

**Interfaces:**
- Produces: `EvalSeedPort`（最小契约，方法集以 Step 1 盘点为准，预期形如 `seedKnowledgeEntry` / `seedTrap` / `resetScenario`）；eval adapters 类型上只可见 seed 能力，产品写端口不再对 evals 全量暴露。

- [x] **Step 1:** 盘点：grep `evals/**` 对 `HostLocalServices` 的实际方法调用面，列出 eval 真正使用的 seed 方法清单（写入 PR/commit message）。
- [ ] **Step 2:** 定义窄接口并让 HostLocalServices 结构化满足它；evals adapters 的参数类型从 `HostLocalServices` 收窄为 `EvalSeedPort`。
- [ ] **Step 3:** 门禁：`pnpm --filter @trapmap/backend-core test --run src/testing` + evals focused tests + `pnpm typecheck` + `pnpm eval:smoke`（离线部分，结果 = main 基线）。
- [ ] **Step 4:** 回写登记册条目 `[x]`；提交：

```bash
git add packages/backend-core packages/host-local evals docs/todos/open-debt-and-compromises.md
git commit -m "refactor(evals): EvalSeedPort 最小契约收窄，eval 面与产品写路径解耦"
```

### Task A10: web-panel real admin 后端路由 + token 回填

**Files:**
- Create: `packages/contracts/src/domain/admin-panel.ts`（5 个端点响应 Zod schema）+ `enum-types/` 就近聚合
- Modify: `packages/service-job-runtime/src/routes.ts`（runtime-overview RouteDef）
- Modify: `packages/service-governance-review/src/routes.ts`（reviews/:id、activity RouteDef）
- Modify: `packages/service-knowledge-write/src/routes.ts`（json-edits、artifacts RouteDef）
- Modify: `packages/host-distributed/src/gateway/route-defs.ts`（/api/admin/* 转发条目，按 owner 映射）
- Modify: `packages/host-local/src/nest/gateway/gateway.route-defs.ts`（同表面 monolith 直挂）
- Modify: `apps/web-panel/src/stores/session-store.ts` + `apps/web-panel/src/services/admin-panel-service-context.ts`（登录成功后会话 token 回填 SessionProvider）
- Test: 各 service routes.test + gateway routes.test + web-panel service-context 测试

**Interfaces:**
- Produces（端点 ↔ owner 映射，全部走 RouteDef 工厂）:
  - `GET /api/admin/runtime-overview` → job-runtime
  - `GET /api/admin/reviews/:id` → governance-review
  - `POST /api/admin/json-edits` → knowledge-write
  - `GET /api/admin/activity` → governance-review（operator projection）
  - `GET /api/admin/artifacts` → knowledge-write
- 认证：复用 gateway auth hook 会话；admin 端点要求 operator 角色，403 语义与其余 admin 面一致。

- [ ] **Step 1:** contracts 先行：定义 5 个响应 schema（`.strict()`），补 contracts 包测试。
- [ ] **Step 2:** 各 owner service 以 `create<X>RouteDefs` 追加路由（handler 委托既有 projection/port，不新增业务判断），补 fastify/nest 双 adapter 路由测试。
- [ ] **Step 3:** 双宿主挂载：host-distributed gateway route-defs 加 `/api/admin/*` 转发（薄传输壳，认证/转发，不手写业务）；host-local gateway.route-defs 直挂同一 RouteDef。
- [ ] **Step 4:** web-panel token 回填：登录成功回调将会话 token 写入 session-store 并供 `apiRequest` 使用；real 模式集成测试（mock transport 断言 Authorization 头携带）。
- [ ] **Step 5:** 门禁：受影响包 focused tests + `pnpm test:deployment-smoke` + `pnpm typecheck` + `pnpm check:docs`。
- [ ] **Step 6:** 回写 `apps/web-panel/README.md`、host 路由面文档、登记册条目 `[x]`；提交：

```bash
git add packages/contracts packages/service-job-runtime packages/service-governance-review packages/service-knowledge-write packages/host-distributed packages/host-local apps/web-panel docs
git commit -m "feat(admin): web-panel real 模式后端路由（RouteDef 工厂）与会话 token 回填"
```

### Task A11: 兼容层退役剩余关闭项收尾

**Files:**
- Verify/Modify: `packages/host-local/src/nest/runtime/`（compatibility helpers 残留调用点）
- Docs: `docs/architecture/BOUNDARIES.md`、`docs/reference/REPO_STRUCTURE.md`（如有漂移）

- [ ] **Step 1:** 调查：`rg -n "compatibility" packages/host-local packages/host-distributed apps --type ts`，列出残留 compatibility helper 引用清单。
- [ ] **Step 2a:** 若引用为零或仅为注释：登记册条目标记 `[x] 已收尾关闭`，REPO_STRUCTURE 中"可暂时调用 server compatibility helpers"过渡句删除。
- [ ] **Step 2b:** 若存在真实调用：逐个内联到 owner（host-local runtime composition 本地实现或 backend-core 端口），删除 compatibility 引用；跑受影响包测试 + `pnpm exec fallow list --boundaries` + `pnpm exec fallow audit --base main` + `pnpm typecheck` + `pnpm check:docs` + `pnpm check:structure`。
- [ ] **Step 3:** 提交：

```bash
git add -A
git commit -m "chore(compat): 兼容层退役剩余关闭项收尾（Wave-10 尾巴清理）"
```

### Task A12: fallow 基线刷新与维护信号 scoped 收敛

**Files:**
- Create: `docs/archived/reports/FALLOW_BASELINE_2026-08-21.md`（新基线报告：hotspot/重复组/unused export 清单）
- Modify: 按 changed-code risk 实际命中文件（只修 changed-code risk 与直接阻塞热点）

**Interfaces:**
- Produces: 新 fallow 基线报告；apps workspace 迁移暴露的 34 findings 中出现真实变更的项按常规处理；「重复工具函数回潮」条目核验后关闭（确认无第三次同类复制）。

- [ ] **Step 1:** 运行 `pnpm duplication` 与 fallow 报告，产出基线报告归档。
- [ ] **Step 2:** 只收敛与生产故障/边界违规/连续变更相关的 hotspot；不为压数字引入大规模抽象（登记册边界条款继续有效）。
- [ ] **Step 3:** 门禁：模块 focused tests + `pnpm exec fallow audit --base main` + `pnpm typecheck`；架构边界变化时回写 BOUNDARIES.md。
- [ ] **Step 4:** 回写登记册两条目（工程维护信号偏高 → 刷新基线与进入条件；重复工具函数回潮 → 核验关闭）；提交：

```bash
git add -A
git commit -m "chore(debt): fallow 基线刷新（2026-08-21）与维护信号 scoped 收敛"
```

### Task A13: 安全候选验证与文档事实校准

**Files:**
- Create: `docs/archived/reports/SECURITY_CANDIDATES_2026-08-21.md`（reachability 结论矩阵）
- Modify: 视验证结果（可达候选修复 + `docs/operations/SECURITY.md`；文档冲突以权威源码为准修 reference/architecture）

- [ ] **Step 1:** 枚举历史扫描安全候选（`pnpm audit` + 仓库历史报告），逐条做 reachability/数据流人工确认，产出结论矩阵（reachable/not-reachable/needs-evidence）。
- [ ] **Step 2:** reachable 项先补可复现测试再修复；not-reachable 项记录证据。
- [ ] **Step 3:** 文档事实校准：diff SYSTEM_TRUTH_SOURCES 声明 vs 具体 config/source（重点：服务发现 optional overlay 是否被误写成必需依赖），漂移处以源码为准修正。
- [ ] **Step 4:** 门禁：`pnpm check:docs` + `pnpm check:structure` + 受影响测试。
- [ ] **Step 5:** 回写登记册条目 `[x]`；提交：

```bash
git add -A
git commit -m "chore(security): 安全候选 reachability 验证与文档事实校准"
```

### Task A14: eval:smoke CI 完整补跑【环境门控】

**Files:**
- Modify: `docs/todos/open-debt-and-compromises.md`（回填结果后关闭条目）

- [ ] **Step 1:** 探测本地 docker daemon（`docker info`）。可用则：

```bash
pnpm eval:smoke
```

- [ ] **Step 2:** 本地不可用则在 CI 环境（`.github/workflows/eval.yml` 触发的运行或手动 workflow_dispatch）完整跑一轮，取回结果摘要。
- [ ] **Step 3:** 结果回填登记册条目（81 项判定分布 + 与 main 基线对比），条目 `[x]` 关闭；确认 `docs/operations/TESTING.md` eval 小节无 drift（`pnpm check:docs`）。
- [ ] **Step 4:** 提交：

```bash
git add docs/todos/open-debt-and-compromises.md
git commit -m "chore(eval): eval:smoke 完整补跑结果回填并关闭登记条目"
```

### Task A15: 分布式镜像重建与 compose 集群演示【环境门控】

**Files:**
- Modify: `docs/todos/open-debt-and-compromises.md`（回填证据后关闭条目）

- [ ] **Step 1:** 联网/CI 环境重建镜像：`docker compose build candidate-worker outbox-worker`。
- [ ] **Step 2:** 集群演示（登记册既定命令）：

```bash
docker compose --profile distributed up -d --no-build --scale candidate-worker=2 --scale outbox-worker=2 candidate-worker outbox-worker
```

- [ ] **Step 3:** 断言 ownership/重复消费（SKIP LOCKED/租约语义）通过；in-process 门禁 `pnpm test:cluster-ownership` 保持全绿作为代码侧证据。
- [ ] **Step 4:** 证据回填登记册条目并 `[x]` 关闭；提交：

```bash
git add docs/todos/open-debt-and-compromises.md
git commit -m "chore(deploy): 分布式镜像重建与 compose replicas 集群演示证据回填"
```

### Task A16: 登记册最终修剪（closeout，最后执行）

**Files:**
- Modify: `docs/todos/open-debt-and-compromises.md`（物理删除已关闭条目）
- Modify: `docs/archived/README.md`、`docs/todos/README.md`（主线归档同步）
- Move: 本细则 → `docs/archived/archived-plans/debt-mcp-platformization-mainline-archived.md`

- [ ] **Step 1:** 确认全部 A/B/C 任务复选框已勾选且有证据；未完成项明确转入问题池或刷新后的登记册 deferred 条目。
- [ ] **Step 2:** 从登记册删除所有 `[x]` 已关闭条目；仍 deferred 条目刷新进入条件；核对登记册净收缩（删除条目数 > 新增 0）。
- [ ] **Step 3:** 主线归档三件套：`git mv` 本细则、更新归档表、更新 todos 索引；根 `plan.md` 切换为"无 active mainline"或下一主线链接。
- [ ] **Step 4:** 门禁：`pnpm check:docs` + `pnpm check:structure` + 全量 Completion Gates（见文末）。
- [ ] **Step 5:** 提交：

```bash
git add -A
git commit -m "docs(todos): 平台化主线 closeout——登记册修剪与主细则归档"
```

**Workstream A 门禁（合并 wt-a 前必跑）:** `pnpm typecheck`；A2-A13 涉及包 focused tests；`pnpm test:deployment-smoke`；`pnpm check:imports` / `check:asserts` / `check:docs` / `check:structure`；`pnpm exec fallow audit --base main`；`pnpm eval:smoke`（离线部分）。

---

## Workstream B：Agent MCP 接入（worktree wt-b，基于 wt-a 合并后的 main）

设计基调（来自 `docs/guides/CLIENT_INTEGRATION.md`）：TrapMap 是"受治理的知识与 Skill 仓库"，MCP server 是**外层协议封装**，gateway HTTP API 是唯一后端数据源；TrapMap 服务本体不实现 MCP 协议。首期范围 = **完整读写**：读（检索/manifest/文件）+ 写（草稿提交，一律进审核队列）+ 治理（角色门控的评审操作）。

### Task B1: apps/mcp 包脚手架

**Files:**
- Create: `apps/mcp/package.json`（name `@trapmap/app-mcp`；deps: `@modelcontextprotocol/sdk`、`zod`、`@trapmap/client-core`、`@trapmap/contracts`、`@trapmap/lib`）
- Create: `apps/mcp/tsconfig.json`（extends `../../tsconfig.base.json`）
- Create: `apps/mcp/src/index.ts`（临时入口：导出占位 factory，B2 替换）
- Create: `apps/mcp/README.md`
- Modify: 根 `vitest.config.ts`（projects 增加 mcp）
- Modify: `.fallowrc.json`（新增 mcp zone）+ `docs/architecture/BOUNDARIES.md`（zone 行）
- Modify: `docs/reference/REPO_STRUCTURE.md`（Apps 小节增加 `apps/mcp/` 行）

**Interfaces:**
- Produces: `@trapmap/app-mcp` 可构建可测试的空壳；BOUNDARIES 声明：mcp zone 只允许依赖 client-core/contracts/lib，禁止直接导入 service-*/host-*。

- [x] **Step 1:** 创建上述文件；package.json scripts：`{"test": "vitest --run", "typecheck": "tsc --noEmit", "start": "tsx src/index.ts"}`。
- [ ] **Step 2:** `pnpm install` 后验证：

```bash
pnpm --filter @trapmap/app-mcp test --run
pnpm exec fallow audit --base main
```

Expected: 空 shell 测试通过；fallow 无新增违规。
- [ ] **Step 3:** 提交：

```bash
git add apps/mcp vitest.config.ts .fallowrc.json docs/architecture/BOUNDARIES.md docs/reference/REPO_STRUCTURE.md
git commit -m "feat(mcp): apps/mcp 包脚手架（thin 协议封装层，zone 边界注册）"
```

### Task B2: MCP stdio server 引导

**Files:**
- Create: `apps/mcp/src/config.ts`
- Create: `apps/mcp/src/server.ts`
- Create: `apps/mcp/src/tools/shared.ts`
- Create: `apps/mcp/src/tools/registry.ts`
- Modify: `apps/mcp/src/index.ts`
- Test: `apps/mcp/src/config.test.ts`、`apps/mcp/src/server.test.ts`

**Interfaces:**

```ts
// config.ts
export const mcpConfigSchema = z.object({
  gatewayUrl: z.string().url().default('http://127.0.0.1:4000'),
  accessToken: z.string().min(1),
});
export type McpConfig = z.infer<typeof mcpConfigSchema>;
export function loadMcpConfig(env: Record<string, string | undefined>): McpConfig;
// 读 TRAPMAP_GATEWAY_URL / TRAPMAP_ACCESS_TOKEN

// tools/shared.ts
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ZodType;
  requiredRole: Role; // B5 前先用 'viewer' 占位类型
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
}
export interface ToolContext { config: McpConfig; logger: AuditLogger; fetchImpl: typeof fetch }
export function defineTool(def: ToolDefinition): ToolDefinition;

// server.ts
export function createTrapmapMcpServer(cfg: McpConfig, deps?: { fetchImpl?: typeof fetch }): McpServer;
```

- [x] **Step 1:** 写失败测试：`loadMcpConfig({})` 抛出（缺 token）；`createTrapmapMcpServer` 实例可列出全部注册工具名（此时 registry 为空数组也通过）。
- [ ] **Step 2:** 实现 config/server/shared；stdio transport 连接 + SIGINT/SIGTERM 优雅退出写在 `index.ts`。
- [ ] **Step 3:** `pnpm --filter @trapmap/app-mcp test --run` 全绿；提交：

```bash
git add apps/mcp
git commit -m "feat(mcp): stdio server 引导与工具定义骨架"
```

### Task B3: 读工具组（检索 / manifest / 文件）

**Files:**
- Create: `apps/mcp/src/gateway-client.ts`
- Create: `apps/mcp/src/tools/search-skills.ts`
- Create: `apps/mcp/src/tools/skill-manifest.ts`
- Create: `apps/mcp/src/tools/skill-files.ts`
- Modify: `apps/mcp/src/tools/registry.ts`
- Test: 各工具同名 `.test.ts`

**Interfaces:**

```ts
// gateway-client.ts —— client-core apiRequest 薄封装
export function createGatewayClient(cfg: McpConfig, fetchImpl?: typeof fetch): {
  request<T>(method: 'GET'|'POST', path: string, opts?: { body?: unknown; query?: Record<string, string> }): Promise<T>;
};
// 自动附 authorization: Bearer <accessToken>；canonical error body 原样透传

// search-skills.ts
// trapmap_search_skills { query: string(min 1), limit?: number(1..20, default 5) }
//   → POST /v1/retrieval/skills/search-by-content
//   → 返回 metadata-only 匹配（title/slug/capsule/activationHints/clientManifest 摘要）

// skill-manifest.ts
// trapmap_get_skill_manifest { artifactId: string }
//   → manifest 元数据 + 四态 activation policy

// skill-files.ts
// trapmap_read_skill_files { artifactId: string, paths: string[] 至少 1 项 }
//   → 激活下载指定文件子集；客户端侧强制 effective = min(serverDefault, localOverride)，
//     policy 为 blocked 的文件直接拒绝（对齐 apps/cli/src/lib/activation-policy.ts 语义）
```

- [x] **Step 1:** 写失败测试（fetch stub）：断言 method/path/auth 头/body 正确；blocked 文件拒绝；limit 越界 400 透传。
- [ ] **Step 2:** 实现三工具并注册；registry 导出 `allTools: ToolDefinition[]`。
- [ ] **Step 3:** 测试全绿；提交：

```bash
git add apps/mcp
git commit -m "feat(mcp): 读工具组——检索/manifest/按需文件读取（四态策略客户端强制）"
```

### Task B4: 写工具组（草稿提交，一律进审核队列）

**Files:**
- Create: `apps/mcp/src/tools/submit-knowledge.ts`
- Create: `apps/mcp/src/tools/submit-skill-draft.ts`
- Create: `apps/mcp/src/tools/submit-feedback.ts`
- Modify: `apps/mcp/src/tools/registry.ts`
- Test: 各工具同名 `.test.ts`

**Interfaces:**

```ts
// trapmap_submit_knowledge { title, content, labels?: string[], teamId?: string }
//   → gateway knowledge submit 端点；产物状态恒为待审核（pending review）
// trapmap_submit_skill_draft { slug, title, files: { path: string; content: string }[] }
//   → artifact bundle 草稿导入；lifecycle_state 恒为 draft/pending，绝不自动 approve
// trapmap_submit_feedback { ... } → feedback 提交
// 硬约束：input schema 一律 .strict()；schema 不暴露 lifecycle_state/actorId——
// actorId 恒取会话身份，客户端不可自报
```

- [x] **Step 1:** 写失败测试：strict schema 拒绝含 `lifecycle_state`/`actorId` 的未知键输入（400 语义）；stub gateway 断言提交后状态为待审核。
- [ ] **Step 2:** 实现三工具；提交：

```bash
git add apps/mcp
git commit -m "feat(mcp): 写工具组——草稿提交强制入审核队列，actor 取会话身份"
```

### Task B5: 治理工具组（角色门控）

**Files:**
- Create: `apps/mcp/src/permissions.ts`
- Create: `apps/mcp/src/tools/review-queue.ts`
- Create: `apps/mcp/src/tools/review-detail.ts`
- Create: `apps/mcp/src/tools/review-decision.ts`
- Create: `apps/mcp/src/tools/remediation-complete.ts`
- Modify: `apps/mcp/src/tools/shared.ts`（handler 前置 `assertRole`）
- Modify: `apps/mcp/src/tools/registry.ts`
- Test: `apps/mcp/src/permissions.test.ts` + 各工具测试

**Interfaces:**

```ts
// permissions.ts
export type Role = 'viewer' | 'contributor' | 'reviewer' | 'operator';
export const ROLE_RANK: Record<Role, number> = { viewer: 0, contributor: 1, reviewer: 2, operator: 3 };
export class PermissionDeniedError extends Error {}
export function assertRole(actual: Role, required: Role): void; // deny-by-default
export async function resolveSessionRole(client: GatewayClient): Promise<Role>;
// 经 gateway whoami/auth context 解析；解析失败 → 'viewer'（最严默认）
```

工具 ↔ 最低角色：search/manifest/files/submit_* → `contributor`（submit 类）；review-queue/detail → `reviewer`；review-decision/remediation-complete → `operator`；纯读 search/manifest → `viewer`。

- [x] **Step 1:** 写失败测试：权限矩阵全组合断言；role 不足时工具返回结构化拒绝（不触达 gateway）。
- [ ] **Step 2:** 实现四工具 + assertRole 接线；提交：

```bash
git add apps/mcp
git commit -m "feat(mcp): 治理工具组与四级角色门控（deny-by-default）"
```

### Task B6: 审计日志与脱敏

**Files:**
- Create: `apps/mcp/src/audit.ts`
- Test: `apps/mcp/src/audit.test.ts`

**Interfaces:**
- Produces: 每次 tool call 输出一行结构化 JSON `{ ts, tool, correlationId, durationMs, outcome }` 到 stderr（stdio transport 下 stdout 属协议通道）；`correlationId = crypto.randomUUID()`；**永不**记录 token、文件内容、知识正文。

- [x] **Step 1:** 写脱敏失败测试（输入含 token 样式的字符串，断言日志行不含）。
- [ ] **Step 2:** 实现并在 `defineTool` 包装层接线；提交：

```bash
git add apps/mcp
git commit -m "feat(mcp): 工具调用审计日志（结构化、脱敏、correlationId）"
```

### Task B7: MCP 文档同步

**Files:**
- Modify: `docs/guides/CLIENT_INTEGRATION.md`（「与 MCP 的关系」重写为 apps/mcp 用法 + 工具表 + 配置 env 说明）
- Modify: `README.md`（接入方式小节补 MCP 一行）
- Modify: `docs/reference/api-surface.md`（MCP tool ↔ endpoint 映射表）
- Modify: `docs/reference/SYSTEM_TRUTH_SOURCES.md`（apps/mcp 启动/配置条目）
- Modify: `docs/architecture/DEPLOYMENT.md`（"不做 MCP 协议"限定为服务本体；agent 接入经 apps/mcp 外层封装）
- Modify: `docs/architecture/components/AI_PROVIDER.md`（getMcpServerStatus 占位注记指向 apps/mcp 后续接线，登记问题池）

- [x] **Step 1:** 完成上述回写；工具表覆盖 B3-B5 全部 10 个工具（名称/最低角色/映射端点/语义约束）。
- [ ] **Step 2:** 门禁：`pnpm check:docs` + `pnpm check:structure`。
- [ ] **Step 3:** 提交：

```bash
git add docs README.md
git commit -m "docs(mcp): agent 接入指南、工具映射表与真相源同步"
```

**Workstream B 门禁（合并 wt-b 前必跑）:** `pnpm --filter @trapmap/app-mcp test --run` 全部通过；`pnpm typecheck`；`pnpm exec fallow audit --base main`；`pnpm check:docs` / `check:structure`；`pnpm test:deployment-smoke`（gateway 面未变应全绿，作为回归证据）。

---

## Workstream C：微服务优化 → Level 3 平台化（worktree wt-c，基于 wt-b 合并后的 main）

顺序原则：先冻结决策（C1，人工门）→ 韧性硬化（C2-C5，无论编排选型都成立）→ 编排/隔离落地（C6-C8，依赖 C1 决策）→ 回归收口（C9）。DEPLOYMENT.md 现有冻结声明（"Level 2 固定"、"不做数据库按服务拆分"、"当前明确先不做"清单）由本主线显式解除，解除动作本身在 C1 落文档。

### Task C1: 平台化决策冻结（人工门）

**Files:**
- Create: `docs/superpowers/specs/2026-08-21-platformization-level3-design.md`
- Modify: `docs/architecture/DEPLOYMENT.md`（冻结段落替换为已冻结决策）
- Modify: `docs/architecture/SERVICE-DISCOVERY.md`、`docs/operations/ENVIRONMENT.md`（同步）

**Interfaces:**
- 设计规格必须显式冻结以下决策（每项一段，含理由与放弃项）：
  1. **编排目标：** Kubernetes ≥1.29 为目标平台；本地/CI 用 kind 验证；先 raw manifests（`k8s/base` + `k8s/overlays`），不引入 Helm。
  2. **消息通道：** PG `task_queue`/`domain_event_outbox` 仍是 transport of record（SKIP LOCKED/租约/幂等已验证）；broker（RabbitMQ，compose 已有 `mq` profile）仅作为 C7 特性开关适配器，不是默认路径。
  3. **服务发现：** Consul 保留；新增 k8s DNS adapter 位于 `DiscoveryPort` 之后（发现抽象不变）。
  4. **SLO 基线：** gateway 可用性 99.5%；内部 hop p99 ≤ 500ms；gateway 读 p99 ≤ 1s；RPO=0（共享 PG WAL）；单服务重启 RTO ≤ 60s（沿用 closeout 验证阈值口径并升格为 SLO）。
  5. **DB 隔离：** 选择性隔离（database-per-service 仅对有热点的 owner 逐个实施，首个试点 = job-runtime，见 C8）；不做全量拆分、不引入跨服务事务/XA。

- [x] **Step 1:** 撰写设计规格（含上述五项 + 各 service 资源预算推导，引用 pool budget seam）。
- [ ] **Step 2:** 更新 DEPLOYMENT.md：删除/替换 L101（Level 2 固定）、L126（不做 DB 拆分）、L149（先不做清单）为"已冻结决策 + 演进路径"；成熟度表述改为"Level 3 目标架构落地中（编排/隔离按 C6-C8 交付进度）"。
- [ ] **Step 3:** 向人类呈现五项决策等待批准（question 工具）。**此复选框在人类批准前不得勾选；C6/C7/C8 在批准前不得开工。**
- [ ] **Step 4:** 门禁：`pnpm check:docs` + `pnpm check:structure`；提交：

```bash
git add docs
git commit -m "docs(platform): Level 3 平台化决策冻结（编排/消息/发现/SLO/DB 隔离）"
```

### Task C2: internal-client 韧性硬化（重试 / 熔断 / 超时预算）

**Files:**
- Create: `packages/host-distributed/src/gateway/resilience.ts`
- Modify: `packages/host-distributed/src/gateway/internal-client.ts`（callInternalService 接线 resilience）
- Test: `packages/host-distributed/src/gateway/resilience.test.ts`（新增）、`internal-client.test.ts`（扩展）

**Interfaces:**

```ts
// resilience.ts
export interface RetryPolicy { maxAttempts: number; baseDelayMs: number; maxDelayMs: number }
export function resolveRetryPolicy(env: Record<string, string | undefined>): RetryPolicy;
// TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS 默认 1（=关闭重试）
export type BreakerState = 'closed' | 'open' | 'half-open';
export class CircuitBreaker {
  constructor(opts: { threshold: number; cooldownMs: number; now?: () => number });
  get state(): BreakerState;
  canAttempt(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
}
export class BreakerRegistry { for(key: string): CircuitBreaker } // key = InternalServiceUrls 的 urlKey
export async function withResilience<T>(opts: {
  retry: RetryPolicy;
  breaker: CircuitBreaker;
  retryable: (err: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
}, fn: () => Promise<T>): Promise<T>;
```

行为规格：
- 重试仅限幂等方法（GET）且错误为网络层错误或 HTTP 502/503/504；指数退避 + full jitter（baseDelayMs=100，maxDelayMs=2000）。
- 熔断阈值默认连续 5 次失败 → open；冷却默认 30000ms → half-open 放行一个探测请求；env：`TRAPMAP_INTERNAL_BREAKER_THRESHOLD`、`TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS`。
- breaker open 时立即失败，错误归一化为 canonical `unavailable` 信封（对齐 `InvocationError` kind 语义，不经网关打到下游）。
- 超时预算分级：`TRAPMAP_<SVC>_TIMEOUT_MS`（如 `TRAPMAP_KNOWLEDGE_READ_TIMEOUT_MS`）覆盖 `DEFAULT_INTERNAL_TIMEOUT_MS = 10_000`，在 `service-config.ts` 旁新增解析 helper。

- [x] **Step 1:** 写失败测试：fake clock 退避序列断言；breaker closed→open→half-open→closed 全迁移；POST 不重试而 GET 重试；open 时零网络调用；timeout override 解析。
- [ ] **Step 2:** 实现 resilience.ts 并接入 callInternalService（AbortController 超时语义保留，lib `timeout` 注释中的差异说明同步更新）。
- [ ] **Step 3:** 门禁：`pnpm --filter @trapmap/host-distributed test --run src/gateway` + `pnpm test:deployment-smoke` + `pnpm typecheck` + `pnpm exec fallow audit --base main`。
- [ ] **Step 4:** 回写 `docs/architecture/OBSERVABILITY.md`（熔断指标暴露，若 C5 未先行则此处只留 TODO 于问题池）；提交：

```bash
git add packages/host-distributed
git commit -m "feat(gateway): internal-client 韧性硬化——幂等重试/熔断/分级超时预算"
```

### Task C3: trace 跨 hop 透传

**Files:**
- Modify: `packages/host-distributed/src/gateway/internal-client.ts`（headers 合并透传）
- Modify: `packages/host-distributed/src/gateway/internal-observability.ts`（span parent 对齐，如需）
- Test: `internal-client.test.ts` 扩展

**Interfaces:**
- Produces: `callInternalService` 向下游转发入站 `traceparent`/`tracestate`/`x-request-id`；入站缺失时生成合法 W3C `traceparent`（随机 trace-id/span-id，flags=01）。

- [x] **Step 1:** 写失败测试：入站带头 → 原样转发；入站无头 → 生成且格式合法（正则断言）。
- [ ] **Step 2:** 实现；门禁同 C2 Step 3；提交：

```bash
git add packages/host-distributed
git commit -m "feat(gateway): W3C trace context 跨内部 hop 透传"
```

### Task C4: gateway 限流

**Files:**
- Create: `packages/host-distributed/src/gateway/rate-limit.ts`
- Modify: `packages/host-distributed/src/gateway/routes.ts`（pre-handler 接线，薄传输壳内）
- Test: `packages/host-distributed/src/gateway/rate-limit.test.ts`、`routes.test.ts` 扩展

**Interfaces:**

```ts
// rate-limit.ts
export interface RateLimitConfig { rps: number; burst: number } // 0 = 关闭
export function resolveRateLimitConfig(env: Record<string, string | undefined>): RateLimitConfig;
// TRAPMAP_GATEWAY_RATE_LIMIT_RPS 默认 50；TRAPMAP_GATEWAY_RATE_LIMIT_BURST 默认 100
export class TokenBucketRateLimiter {
  constructor(cfg: RateLimitConfig, now?: () => number);
  tryConsume(key: string): { allowed: boolean; retryAfterMs: number };
}
```

- key = 会话 actorId，缺省回退客户端 IP；超限返回 429 + `Retry-After`（秒，向上取整）；prometheus 计数器 `trapmap_gateway_rate_limited_total{actor_kind}`（actor_kind: session|ip）；测试环境默认关闭（env 未设且 NODE_ENV=test 时不启用）。

- [x] **Step 1:** 写失败测试：令牌桶补充数学；per-key 隔离；429 响应形状（status/header/body）；关闭模式直通。
- [ ] **Step 2:** 实现并接线；门禁同 C2 Step 3 + `pnpm test:observability-closeout`（计数器注册）；提交：

```bash
git add packages/host-distributed
git commit -m "feat(gateway): 会话级令牌桶限流（429/Retry-After/指标暴露）"
```

### Task C5: 健康/SLO 增强（readiness-liveness 分离 + 依赖摘要）

**Files:**
- Modify: `packages/contracts/src/domain/health.ts`（schema 扩展）
- Modify: 各 service 健康路由（经既有 RouteDef 面，逐 service 最小改动）
- Modify: startupChecks（校验 C2/C4 新增 env 配置合法性）
- Test: contracts health 测试 + 任一 service 示例 + `pnpm test:deployment-smoke`

**Interfaces:**
- Produces: health 契约区分 `liveness`（进程活着）与 `readiness`（可接流量：DB pool 饱和度、queue depth、breaker states 摘要）；`/healthz` 保持 liveness 语义，`/readyz` 新增 readiness 语义；依赖摘要 schema：

```ts
dependencySummary: z.object({
  dbPoolSaturation: z.number().min(0).max(1),
  queueDepth: z.number().int().nonnegative(),
  breakerStates: z.record(z.string(), z.enum(['closed', 'open', 'half-open'])),
}).optional(),
```

- [x] **Step 1:** contracts schema 先行 + 测试；[ ] **Step 2:** 逐 service 暴露 `/readyz`（RouteDef 工厂）；[ ] **Step 3:** startupChecks 校验新 env（非法值启动失败并给出可读错误）。
- [ ] **Step 4:** 门禁：`pnpm --filter @trapmap/contracts test --run src/domain/health.test.ts` + `pnpm test:observability-closeout` + `pnpm test:discovery-closeout` + `pnpm test:deployment-smoke`；提交：

```bash
git add packages/contracts packages/service-* packages/host-* 
git commit -m "feat(health): readiness/liveness 分离与依赖摘要契约"
```

### Task C6: k8s 编排资产

**Files:**
- Create: `k8s/base/namespace.yaml`、`k8s/base/configmap.yaml`、`k8s/base/secrets.template.yaml`
- Create: `k8s/base/gateway.deploy.yaml` + 7 个内部服务 deploy（ServiceName 一一对应）+ `k8s/base/services.yaml` + `k8s/base/hpa.yaml`（candidate-worker CPU target 70% 示例）
- Modify: `docs/architecture/DEPLOYMENT.md`（拓扑章节：compose → k8s 双形态说明）

**Interfaces:**
- Produces: 每个 deployment 的 probes：liveness `/healthz`、readiness `/readyz`（C5 契约）；resources requests/limits 与 service-config pool budget 推导一致；镜像复用 `apps/distributed/Dockerfile` 产物。

- [x] **Step 1:** 编写 manifests（image 引用统一变量化，便于 kind 加载本地镜像）。
- [ ] **Step 2:** 【环境门控】kind 集群冒烟：`kind create cluster && kind load docker-image <images> && kubectl apply -k k8s/base`，断言全部 pod Ready 且 gateway `/readyz` 200；环境不可用则在 DEPLOYMENT.md 明确标注"k8s 资产未经集群验证，验证步骤如下"。
- [ ] **Step 3:** 门禁：`pnpm test:deployment-smoke` + `pnpm check:docs`；提交：

```bash
git add k8s docs/architecture/DEPLOYMENT.md
git commit -m "feat(k8s): distributed profile 原生编排资产（probes/HPA/资源预算对齐）"
```

### Task C7: task transport broker 适配器（条件任务，依赖 C1 批准）

**Files:**
- Create: `packages/backend-core/src/job-runtime/task-transport/broker-adapter.ts`（实现既有 task transport port）
- Modify: 宿主装配点（assembly 节点处按 env 选择 adapter）
- Modify: `docker-compose.yml`（mq profile 接线说明）
- Test: `broker-adapter.test.ts`（stub broker）+【环境门控】live rabbitmq smoke

**Interfaces:**
- Produces: `TRAPMAP_TASK_TRANSPORT=pg|amqp`（默认 `pg`）；amqp adapter 实现与 pg 相同的 enqueue/claim/ack 语义（at-least-once + 幂等 handler 前提不变）；不改变 pg 默认路径的任何行为。

- [ ] **Step 1:** 写失败测试（内存 stub broker：投递语义/at-least-once/关停排空）。
- [ ] **Step 2:** 实现 amqp adapter（依赖只声明在消费宿主，遵循通用依赖规则）；装配点 env 开关。
- [ ] **Step 3:** 门禁：backend-core focused tests + `pnpm test:distributed-closeout` + `pnpm test:deployment-smoke`；【环境门控】compose mq profile live smoke 结果回填本任务复选框旁注。
- [ ] **Step 4:** 提交：

```bash
git add packages/backend-core packages/host-distributed docker-compose.yml
git commit -m "feat(job-runtime): amqp task transport 适配器（特性开关，pg 仍为默认）"
```

### Task C8: 选择性数据库隔离试点（条件任务 + 人工门，依赖 C1 批准）

**Files:**
- Create: `packages/service-job-runtime/drizzle/`（独立库迁移入口，表集合 = job-runtime owner 表）
- Modify: `packages/service-job-runtime/src/`（pool 装配读 `TRAPMAP_JOB_RUNTIME_DATABASE_URL`，缺省回退共享 `TRAPMAP_POSTGRES_URL`）
- Docs: `docs/archived/archived-plans/` 不动；更新 `docs/reference/DATA_MODEL.md`、`docs/operations/ENVIRONMENT.md`、DATABASE_OWNERSHIP 权威页（现位于 `docs/archived/architecture/DATABASE_OWNERSHIP.md`，若激活需迁回 `docs/architecture/` 并同步 REPO_STRUCTURE）

**Interfaces:**
- Produces: job-runtime 可独立指向 `trapmap_job_runtime` 库；回退语义保证单库部署零破坏；双跑验证脚本证明两形态 closeout 断言等价。

> **偏差记录：** 登记册原进入条件要求"先具备 Tranche 6 的 owner/migration/projection 证据"；用户 2026-08-21 裁决全量派发，本任务显式豁免该前置并将豁免记录在本任务与登记册回写中。

- [ ] **Step 1:** 向人类确认试点 owner = job-runtime（question 工具，可改选其他 service）。**未确认前不开工。**
- [ ] **Step 2:** 迁移拆分 + pool 装配回退语义 + 回滚方案（切回共享库的环境变量操作步骤）写入 DATA_MODEL.md。
- [ ] **Step 3:** 双跑验证：共享库形态跑 `pnpm test:distributed-closeout`；独立库形态（本地 PG 建第二库）跑同一套断言，两者全绿。
- [ ] **Step 4:** 门禁：service-job-runtime focused tests + `pnpm test:deployment-smoke` + `pnpm typecheck` + `pnpm check:docs`；提交：

```bash
git add packages/service-job-runtime docs
git commit -m "feat(persistence): job-runtime 选择性数据库隔离试点（回退语义保底）"
```

### Task C9: golden 回归与文档回写

**Files:**
- Modify: `docs/architecture/OBSERVABILITY.md`（熔断/限流指标）、`docs/operations/REGRESSION-COMMANDS.md`（新门禁命令）、`docs/operations/TESTING.md`（k8s/broker 验证章节）

- [ ] **Step 1:** 完成上述文档回写。
- [ ] **Step 2:** wt-c 全量门禁：`pnpm typecheck`；host-distributed/backend-core/contracts 包测试；`pnpm test:deployment-smoke` / `test:runtime-foundations` / `test:distributed-closeout` / `test:observability-closeout` / `test:discovery-closeout` / `test:cluster-ownership`；`pnpm eval:smoke`（离线）；`check:*` 全家；`pnpm exec fallow audit --base main`。
- [ ] **Step 3:** 提交：

```bash
git add docs
git commit -m "docs(platform): Level 3 交付物文档回写与回归命令更新"
```

---

## Tranche-2 剩余任务（2026-08-22 排期，主线保持 active）

已完成追加：A7（ffab7ebf，17+17+6 测试绿）、A9（e05f3065）。剩余：A3 web-panel 测试修复 · A10 web-panel admin 后端 · A11-A13 调查/基线报告 · C7 amqp 适配器实现 · C8 job-runtime 隔离试点实现 · C9 golden 回归 · A14/A15【环境门控：docker/kind】 · A16 登记册最终修剪与归档。

已获人类批准待实施：C8 试点 owner=job-runtime；C7 走 TRAPMAP_TASK_TRANSPORT 特性开关。

## 问题池（执行期新发现问题进这里，不进登记册）

- **search-by-content 死路径**：来源——B3 实现时发现 `POST /v1/retrieval/skills/search-by-content` 在 CLIENT_INTEGRATION.md 与 CLI 中引用，但 host-local/host-distributed gateway 均无该路由（仅 `/v1/retrieval/search` 真实存在）。影响：文档误导集成方。处置：B3 工具改用真实端点；CLIENT_INTEGRATION.md 的 curl 示例待 tranche-2 修正（check:docs 未覆盖路径存在性）。——执行期间按 `- 来源 / 影响 / 处置（当场修 / 转 deferred）` 格式追加；closeout 时逐条清空（当场修的删除，转 deferred 的进刷新后登记册）。

## Completion Gates（三 workstream 全部合并后在主仓库执行）

- [ ] `pnpm typecheck` 全绿
- [ ] 包级测试：contracts / backend-core / assembly / host-local / host-distributed / cli / web-panel / app-mcp 全绿
- [ ] `pnpm test:deployment-smoke` / `test:runtime-foundations` / `test:distributed-closeout` / `test:observability-closeout` / `test:discovery-closeout` / `test:cluster-ownership` 全绿
- [ ] `pnpm eval:smoke` ≥ main 基线（54/81，环境既有失败非回归）；A14 完整补跑结果已回填
- [ ] `pnpm check:imports` / `check:asserts` / `check:deps` / `check:docs` / `check:structure` 全绿；无新增断言豁免
- [ ] `pnpm exec fallow audit --base main` exit 0
- [ ] 登记册净收缩（A16 完成）；本细则归档三件套完成；根 `plan.md` 状态切换
- [ ] 两个人工门（A6 actorId 拍板、C1 平台化决策批准）均有留痕结论
