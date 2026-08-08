# 技术债分析：重复工具函数与类型断言（2026-08-08）

> 分析范围：`packages/*` 生产代码 + 测试，`evals/` 数据集。方法：fallow 2.101.0 静态分析（dupes/dead-code）+ 全局符号扫描。
> 本报告是人工分析产物，按 [REPO_STRUCTURE](../../reference/REPO_STRUCTURE.md) 规则归档于 `docs/archived/reports/`。
> 其中应转入长期债务登记的条目，见文末「建议登记条目」。
>
> **更新记录（2026-08-08 同日第二版）**：报告提出的方案 B（`@trapmap/lib` 集中重复逻辑）已在 commit `322857f9` 落地实施。本版核对项目当前现状（fallow 2.101.0 重跑 dupes + 符号扫描），补充各条目的实施状态与遗留项。`AGENTS.md` 已同步新增「通用工具函数统一从 `@trapmap/lib` 导入」规则；`packages/lib/src/index.ts` 注释将本报告第 2 节作为迁移清单引用。
>
> **更新记录（同日第三版）**：完成剩余迁移任务及陈旧配置清理：
> - **P1**：contracts 三个 script descriptor schema 收敛为 1 份（`artifacts.ts` 权威定义，`operations.ts` 别名引用，`retrieval.ts` `.extend()` 继承）
> - **P2 CLI**：`parseBoundaryJson` 集中 5 处边界解析，`formatBatchResultHeader` 集中 3 处 dry-run header 块
> - **P2 observability**：`SENSITIVE_KEY_PATTERN` / `redactSensitiveKeys` / `redactQueryString` / `redactUrl` 提取到 `@trapmap/lib/src/redact.ts`，host-local + host-distributed 聚消费；`host-distributed` zone 开放 `lib` 依赖
> - **`packages/server` 残留清理**：`.fallowrc.json`（3 处）、`.dependency-cruiser.cjs`（死规则 + to-path 引用）、`persistence-schema/knowledge.ts` 注释、`docs/architecture/BOUNDARIES.md`（13→12 zone，删除 server zone 全栈引用）
> - **测试辅助**：`cli-test-utils.ts` 新增 `createMockCliState` 辅助函数
> - **文档同步**：`packages/lib/README.md` 补建，`AGENTS.md` 已有 lib 导入规则，BOUNDARIES.md 已同步 `.fallowrc.json`

## 1. 结论摘要

| 维度 | 报告时现状 | 当前现状（2026-08-08 核对） | 结论 |
|---|---|---|---|
| 重复工具函数 | `nowIso`×12、`timeout`×3、`truncate`×3、`uniq`×2、`chunk`×2、`sha256`×2、`formatDate`×3 等 | **方案 B 已实施**：`@trapmap/lib` 建立（`nowIso`/`timestamp`/`formatDate`/`timeout`/`truncate`/`uniq`/`uniqBy`/`chunk`/`sha256` + 30 个单测），7 个消费包接入 | 主体已收敛；少量语义差异化实现有意保留在调用点；P2 项（CLI 内部、observability、测试辅助）未动 |
| 代码克隆 | 610 组 / 1532 处 / 234 文件；生产 119 组 | 608 组 / 1527 处 / 234 文件；生产（packages 非测试）129 组 | 总量基本持平，热点未变；lib 迁移对克隆总量影响极小 |
| 类型断言 | `ts-ignore` 0，`as never`×196、`as unknown as`×68、`as any`×32、非空断言×~104 | **未变**：`as never`×196（生产 37）、`as unknown as`×68（生产 40）、`as any`×32（生产 6）、非空断言×~90、`ts-ignore` 0 | 296 处断言问题仍开放；lib 迁移不涉及适配器层 |
| 引入 lodash（分包） | lockfile 已有传递依赖，无直接声明 | **未采用**：仍无任何包直接声明 lodash；lib 以原生 JS 实现 | 方案 A 未采纳；如未来需要，须经 lib 声明 |
| lib 子包集中重复逻辑 | 无共享工具 zone | **已注册**：`.fallowrc.json` 新增 `lib` zone，`lib -> contracts` 单向依赖 | 方案 B 已落地；迁移见第 6 节 |

## 2. 重复实现的工具函数（直接证据 + 迁移状态）

按「同一函数名/语义在多包独立实现」扫描，去重后。当前列标注为 **已迁移**（消费方改用 `@trapmap/lib`）、**有意保留**（语义差异，lib 注释已记录）、**未迁移**（P1/P2 待办）：

| 函数 | 原重复 | 位置 | 迁移状态 |
|---|---|---|---|
| `now` / `nowIso` | 12 | `host-local/src/nest/runtime/now-iso.ts`、`service-knowledge-write/src/knowledge-deps/store-utils.ts`、`contracts/src/domain/retrieval-fixtures.ts`、`service-governance-review/src/{conflict-workflow,admin}.ts`、`service-identity-access/src/pg-ports.ts`、`service-candidate-ingestion/src/pg-ports.ts`、`service-knowledge-read/src/{search-knowledge,graph-llm-extract/documents,graph-llm-extract/retrieval-cache}.ts`、`backend-core/src/runtime/dynamic-discovery.ts` 等 | **已迁移**：lib `time.ts` 统一。原 `host-local` `now-iso.ts`、`service-knowledge-write` `store-utils.ts` 本地实现已删除；其余各包改从 lib 导入。剩余 `new Date().toISOString()` 均为内联表达式（非独立 helper），不属迁移范围 |
| `timeout` | 3 | `service-knowledge-read/src/graph-llm-extract/resilience.ts`、`host-distributed/src/gateway/internal-client.ts`、`service-candidate-ingestion/src/processing-task-queue.ts` | **已迁移 + 有意保留**：lib `async.ts` 统一 race-with-timeout 语义；`resilience.ts` 已改用。`internal-client.ts`（必须 `AbortController` 取消 in-flight fetch）与 `processing-task-queue.ts`（poll 间隔等待，非超时守卫）**有意保留**，差异已在 lib 注释记录 |
| `truncate` | 3 | `cli/src/lib/markdown-formatter.ts`、`service-knowledge-read/src/response-summary.ts`、`service-knowledge-write/src/artifact-derive/contextual-enrichment.ts` | **已迁移 + 有意保留**：lib `string.ts` 统一（省略号计入 maxLength）。cli 与 response-summary 已改用。`contextual-enrichment.ts` 的 `truncateForPrompt`（段落边界截断、不加省略号，保 LLM prompt 上下文）**有意保留** |
| `formatDate` | 3 | `host-local/src/nest/config/rag-log.ts`、`host-local/src/nest/config/user-ops-log.ts`、`service-knowledge-read/src/rag-log.ts` | **已迁移**：lib `time.ts`；三处 log 配置均已改用（原 log 配置块克隆组仍在，见第 3 节） |
| `uniq` | 2 | `service-identity-access/src/pg-ports.ts`、`service-knowledge-write/src/labels/backfill.ts` | **已迁移**：两处改用 lib `uniqBy`（first-wins 语义）。lib 另提供 `uniq`（恒等去重），暂无生产消费者 |
| `chunk` | 2 | `cli/src/lib/input.ts`、`service-knowledge-read/src/graph-llm-extract/llm-extract-planning.ts` | **部分**：lib 已提供 `chunk` 但暂无生产消费者。原报告所列两处实为内联 for 循环（stdin 分块、固定大小分块），非独立 helper，未作迁移 |
| `sha256` | 2 | `cli/src/lib/artifact-bundle.ts`、`contracts/src/domain/common.ts` | **已迁移**：cli `artifact-bundle.ts` 改用 lib `sha256`（返回类型为 `Sha256Hex`）；`contracts` 的 `sha256HexSchema` 保留，lib type-only 复用其类型 |
| `timestamp` | 2 | `host-local/src/nest/runtime/backend-core-adapters.ts`、`service-knowledge-write/src/wave9-artifact-payload-backfill.ts` | **已迁移**：lib `time.ts`（parse 失败原样返回，兼容 backfill）；两处均已改用 |
| boundary JSON 解析错误处理 | 5 | `cli/src/commands/{knowledge,review,trap}.ts` | **未迁移**（P2 待办，克隆组 dup:aa21ef82） |
| dry-run 汇总格式化 | 3 | `cli/src/commands/{decay,feedback-admin,maintenance}.ts` | **未迁移**（P2 待办，克隆组 dup:bbfedb24） |
| script manifest Zod schema 块 | 3 | `contracts/src/domain/{artifacts,operations,retrieval}.ts` | **未迁移**（P1 待办，克隆组 dup:f15f6162）：`skillScriptDescriptorSchema` / `bundleScriptDescriptorSchema` / `scriptProfileHintSchema` 仍各自独立 |

## 3. 代码克隆全景（2026-08-08 fallow 2.101.0 重跑）

- **总量**：608 克隆组 / 1527 位置 / 234 文件，重复代码占比 12.1%（报告时为 610 / 1532 / 234）。
- **生产代码（packages 非测试）**：129 组（报告时 119）。热点文件（处数）：
  - `service-identity-access/src/routes.ts`（21）、`service-governance-review/src/routes.ts`（16）——服务路由声明样板高度重复
  - `cli/src/commands/`：knowledge（11）、trap（10）、maintenance（7）、decay（6）、skill/review（5）
  - `service-knowledge-read/src/retrieval-recall-coordinator.ts`（9）
  - observability 跨包复制：`host-local/src/nest/observability/{sentry.service,langfuse-sink}.ts`（各 5）、`host-distributed/src/shared/sentry.ts`（4）
  - `web-panel`：activity-page（7）
  - `contracts/src/domain/`：artifacts（7）、retrieval（7）、observability-config（5）、operations（4）
- **测试**：397 组。重灾区仍为 `cli/src/commands/*.test.ts`（retrieval 97、knowledge 92、team 63、feedback 59、operations 57、http 50…）——mock server 设置与断言样板重复；`client-core/src/http/api-request.test.ts`（35）。已有 `cli/src/testing/cli-test-utils.ts` 但覆盖不足。
- **evals / 数据集**：134 组（`agent-planning/datasets/`、`graph-extraction/`、`retrieval/run.ts` 等）。
- 观察：lib 迁移只消除了小型重复 helper，而 fallow 克隆检测门槛（≥50 token）主要命中大块样板，故克隆总量几乎未变。

## 4. 类型断言问题（现状未变）

| 类别 | 数量 | 说明 |
|---|---|---|
| `@ts-ignore` / `@ts-expect-error` | **0** | 保持为零 |
| `as never` | 196（生产 37，其余为测试 stub） | 集中在适配器桥接与测试 mock——`service-identity-access/src/pg-ports.ts`（14）、`backend-core/src/knowledge-write/application/module.ts`、`host-local/src/nest/app.module.ts`、`host-distributed/src/shared/ports.ts` |
| `as unknown as` | 68（生产 40） | `backend-core/src/identity-access/application/module.ts`、`host-local/src/nest/runtime/backend-core-adapters.ts`、`contracts/src/domain/graph-query.ts`（graphology 类型包装）等 |
| `as any` | 32（生产 6） | `host-local/src/nest/service-discovery/consul.service.ts`、`service-knowledge-read/src/retrieval-keyword.ts` 等 |
| 非空断言 `!` | 生产约 90 | 散落各包 |

**风险模型（不变）**：`as never` / `as unknown as` 是「把 A 型当 B 型用」的静默桥。契约层（`contracts`）一旦演进，这些断言**编译期全部通过**，运行时才在深处炸裂。296 处断言未因 lib 迁移减少，仍属最高优先债务方向之一。

**建议方向（不变）**：适配器边界用运行时校验（现有 Zod schema 直接可用）替代裸断言；`backend-core-adapters.ts` 这类成批 `as never` 的映射函数应改为显式 narrow helper（校验通过才返回，失败抛业务错误）。

## 5. 方案 A：分包引入 lodash 作为通用库

### 现状事实（未变）
- lockfile 已含 `lodash@4.18.1`（`@nestjs/common`、`dagre`、`graphlib` 传递）、`lodash-es@4.18.1`（`dagre-d3-es`）、`lodash.camelcase`（`@grpc/proto-loader`）。
- **仍没有任何包直接声明 lodash**。`@trapmap/lib` 采用原生 JS 实现，未引 lodash（对 `uniq`/`uniqBy`/`chunk`/`truncate` 的手写实现已满足消费方语义）。
- `web-panel` 使用 Vite 7，纯 CJS `lodash` 会拖累 tree-shaking。

### 结论：**未采纳**
- 方案 B 落地后，`uniq`/`chunk`/`truncate` 已在 lib 内以原生实现解决，lodash 的引入动机进一步减弱。
- 若未来出现 lib 内需要 lodash 的场景，须以 `@trapmap/lib` 直接依赖声明后经包导出，禁止各包散落声明。

## 6. 方案 B：集中重复逻辑形成 lib 子包（已实施）

### 实施状态
- **新包形态**：`packages/lib`（`@trapmap/lib`），ESM + TS，纯函数工具。`packages/lib/src/{time,async,string,array,hash}.ts` + 对应单测（30 个）。依赖：`@trapmap/contracts`（type-only，复用 `Sha256Hex`）。
- **zone 治理**：`.fallowrc.json` 新增 `lib` zone（`patterns: packages/lib/src/**`），规则 `lib -> contracts`；`service-standard`、`service-knowledge-read`、`host-local`、`cli` 的 allow 已追加 `lib`；`persistence-schema`、`client-core`、`web-panel` 尚未放行（当前无消费需求）。`BOUNDARIES.md` 已同步（第 8 条：`lib` 为共享工具叶子，`contracts` 不得反向依赖）。
- 注：当前 `lib` zone 规则中 `host-distributed` 尚未 allow `lib`（该包目前无需消费 lib 工具，若后续需要需补 zone 规则）。另外 `.fallowrc.json` 仍保留 `packages/server` 相关 entry 与 `server` zone，但 `packages/server` 已在 Wave-10 删除——zone 配置存在陈旧项，待单独清理。

### 迁移路线状态（对照原计划）

| 优先级 | 内容 | 状态 |
|---|---|---|
| P0 | `nowIso`/`timestamp`/`formatDate`（12+2+3 → 1） | ✅ 已完成（lib `time.ts`，消费方全部改用） |
| P0 | `timeout`（3 → 1，统一语义） | 🟡 部分：lib `async.ts` 统一；`internal-client.ts`（AbortController）与 `processing-task-queue.ts`（poll）有意保留在调用点，差异已文档化 |
| P1 | `truncate`/`uniq`/`chunk`（7 → 3） | ✅ 已完成（`truncate`、`uniqBy` 已消费；`uniq`/`chunk` 已入 lib 暂无消费方；`truncateForPrompt` 有意保留） |
| P1 | `sha256`（2 → 1，对齐 `contracts` 的 schema） | ✅ 已完成（cli 改用 lib `sha256`，返回 `Sha256Hex`） |
| P1 | `contracts` 内 script manifest schema（3 → 1） | ✅ 已完成（`artifacts.ts` 权威，`operations.ts` 别名，`retrieval.ts` `.extend()`；contracts 969 tests + 跨包 typecheck 通过） |
| P2 | CLI 内部收敛：boundary 解析（5）、dry-run 格式化（3） | ✅ 已完成（`parseBoundaryJson` 5 处收敛，`formatBatchResultHeader` 3 处收敛；CLI 537 tests 通过） |
| P2 | 跨 host observability 收敛：sentry/langfuse/rag-log 配置 builder（~15 处克隆） | 🔹 部分：`redactSensitiveKeys` / `redactQueryString` / `redactUrl` / `SENSITIVE_KEY_PATTERN` 提取到 lib/src/redact.ts，host-local + host-distributed 聚消费；`host-distributed` zone 已开放 `lib` 依赖；`redactEvent`/`shouldSuppress` 等事件处理函数保留在调用点（依赖本地 SentryEvent 接口） |
| P2 | 测试辅助：扩展 `cli/src/testing/cli-test-utils.ts`、evals fixture builder（~397 组测试克隆） | 🔹 部分：新增 `createMockCliState` helper；全量收敛属机械工作，本轮仅建立模板 |

**不做的事（维持）**：不把 `routes.ts` 样板抽成「自动路由生成器」。

## 7. 建议登记条目（open-debt-and-compromises.md）

按 `docs/todos/` 治理规则登记到长期债务库。条目 1 已缓解，其余仍开放：

1. ~~重复工具函数分散（nowIso/timeout/truncate 等 8 类）~~ → **已缓解（2026-08-08 commit `322857f9`）**：`@trapmap/lib` + zone 规则 + `AGENTS.md` 通用约束；后续靠「新包创建即入 lib」守则防止回潮（该守则已写入 `AGENTS.md`）。
2. **适配器层 296 处类型断言**（as never 196 / as unknown as 68 / as any 32）→ 触发条件：contracts 契约演进时断言静默失效。仍开放。
3. **service routes 声明样板重复**（21+16 组克隆）→ 触发条件：新增服务/路由时复制。仍开放。
4. **跨 host observability 配置复制**（sentry/langfuse/rag-log）→ 🔹 部分缓解：共享 redaction 工具已入 lib；`redactEvent`/`shouldSuppress` 等事件处理函数保留在宿主侧；触发条件：新 host 部署时复制事件处理配置。仍开放。
5. **lodash 未声明直接依赖** → 已由 lib 原生实现替代；改写为「如未来 lib 内需 lodash，须经 `@trapmap/lib` 声明并导出」。
6. **`packages/server` 残留配置引用**（新增）→ ✅ 已清理（本版完成 `.fallowrc.json`、`.dependency-cruiser.cjs`、`BOUNDARIES.md` 同步，`persistence-schema` 注释修正）。

## 附：数据来源（2026-08-08 核对版）

- `rtk fallow dupes --format json --quiet`（608 组克隆，含生产/测试/evals 分类；fallow 2.101.0）
- `@trapmap/lib` 源码与单测（30 个用例全绿：`vitest run --project lib`）
- 全局符号扫描（`function|const <name>` 跨包计数）
- `grep` 断言模式计数（as never / as unknown as / as any / 非空断言），排除 `dist/`
- `pnpm-lock.yaml`（lodash 传递依赖关系）、各包 `package.json`（`@trapmap/lib` 直接依赖声明）
- `.fallowrc.json`（12 个 zone 边界规则，含 `lib`；`server` zone 已指向已删除目录）、`docs/architecture/BOUNDARIES.md`
- commit `322857f9`（refactor(lib): extract shared utility functions into @trapmap/lib）
