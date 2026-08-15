# Dead Code And Architecture Order Cleanup Design

> **状态：** active mainline design spec（与主细则 `docs/todos/dead-code-and-architecture-order-cleanup.md` 配套）
> **日期：** 2026-08-15
> **来源：** 全仓架构审查（2026-08-15 多 subagent 并行审查：backend-core / hosts / service-* / contracts+persistence / cli+client-core+web-panel / evals+ai-providers+lib）

## 问题背景

2026-08-15 的六路并行架构审查确认了以下事实（全部经全仓 grep 验证零消费者，或经 diff 确认双份定义）：

### 死代码 / 死路径（删除零回归风险）

| 位置 | 内容 | 规模 |
|---|---|---|
| `backend-core/src/use-cases/` | command-handling / review-flows / retrieval-orchestration / job-scheduling 四文件 | ~600 行 |
| `backend-core/src/invocation/invocation-config.ts` | InvocationConfig/buildInProcessConfig | ~80 行 |
| `backend-core/src/ports/telemetry-ports.ts` | SpanHandle/MetricsPort/TracingPort/LoggingPort | ~110 行 |
| `backend-core/src/runtime/status.ts` / `topology.ts` / `route-surface.ts` | 运行时状态快照/拓扑/路由面（含 `'server'` 残留包名） | ~250 行 |
| `backend-core/src/governance-review/application/conflict-scheduler.ts` | createGovernanceConflictTaskScheduler | ~60 行 |
| `backend-core/src/testing/test-utils.ts` | 19 个导出仅 3 个有消费者 | ~460 行 |
| `contracts/src/domain/async.ts` | ~800/875 行为死代码（注册表+payload） | ~800 行 |
| `contracts/src/domain/operations.ts` | stats/badcase/async-snapshot 死组 + 20+ 死 RequestSchema | ~500 行 |
| `contracts/src/domain/graph-query.ts` | 11 个死函数（仅 dist 陈旧产物引用） | ~200 行 |
| service-* 的 `llm-dedup.ts` / `llm-conflict.ts` / `graph-llm-extract.ts` | 产品零消费、仅 eval 引用 | ~150 行 |
| 六包 `schema.ts` 孤儿 re-export + 六包 `drizzle.config.ts` 孤儿（根无 drizzle 脚本） | 无源码引用 | 6+6 文件 |
| hosts：`validation.pipe.ts` / `@sentry/node`(host-distributed) / `@trapmap/client-core`(两 host) / `/v1/auth/register` 死允许项 | knip 确认 unused | 4 项 |
| web-panel：`vite.config.d.ts`+`.map` / `vitest.config.d.ts`+`.map` 误提交构建产物 | git 跟踪 | 4 文件 |
| evals：`baselines/` 孤儿目录 / eval-ci 与 eval-all 双轨 runner | 重复 + 孤儿 | 2 项 |

### 结构/界限问题（需修复）

1. **candidates 表双份定义**：`persistence-schema/src/candidates.ts`（7 表）与 `service-candidate-ingestion/src/schema.ts`（本地 7 表，未声明依赖）已漂移。
2. **契约包逻辑污染**：`contracts` 含图算法（graphology 4 包运行时依赖）、parsing（gray-matter/mime-types）、worker 控制器、投影构建函数——"共享 Zod Schema" 包变成算法库。
3. **循环依赖**：`service-knowledge-write` 4 处 import `@trapmap/service-knowledge-read/store.js`，read 的 devDeps 又声明 write——声明级环；共享 record 类型双份重写。
4. **SQL 进 domain**：`backend-core/src/job-runtime/domain/policy.ts:79` 含 12+ SQL 方言字符串。
5. **internal-client 双组重复**：review/governanceReview 7 方法逐字重复（同一服务两个 URL key）。
6. **宿主业务泄漏**：`host-distributed/src/shared/ports.ts:109-302` 宿主手写检索/队列/outbox SQL；host-local 网关内联状态机。
7. **DOC 漂移**：`DATABASE_SCHEMA.md` 写 62 表实际 64 表；`docs/README.md:264` LLM 图提取已归档但仍标"进行中"。

## 目标

- **删除所有确认死代码/死路径**（约 3000+ 行），净化 `export *` 导出面，恢复 knip/fallow 信号可用性。
- **修复双份表定义与循环依赖**，消除数据事故风险与依赖环。
- **落地防复发守卫**：表清单 diff 守卫、pgTable 双份守卫、eval import 边界、`@eval-only` 标记、knip entry 完整化。
- 全程保持行为不变：纯删除任务零语义变化；结构任务以 focused test + typecheck + fallow audit 验证。

## 架构约束

- **contracts**：只留 schema + 纯类型；可执行逻辑（图算法、解析）下沉到消费方（service-knowledge-read / lib）。
- **backend-core**：`<context>/domain/` 零框架、零 DB、零 SQL；SQL 常量留在 service 包。
- **service-***：pg-ports 只留 SQL+行映射；业务判断（分类/过滤/状态机）进 domain 或 contracts 常量。
- **宿主**：只做装配；不写业务规则、不重复 service 包能力。
- **eval-only 模块**：产品零消费的模块统一标记 `@eval-only` 并从产品导出面移除。
- 禁止新增断言；禁止为压低指标引入大规模抽象。

## 验证门禁

- 每任务：focused tests + `rtk pnpm typecheck`。
- 跨包边界变化：`rtk pnpm exec fallow audit --base main`。
- 检索/摘要/治理改动：`rtk pnpm eval:smoke`。
- 文档变化：`rtk pnpm check:docs` + `rtk pnpm check:structure`。
- 收尾：全仓 typecheck + 受影响包全量测试 + knip/fallow 复跑记录新基线。

## 非目标

- 不做大规模重构（capability-model 拆分、OTel 双份收敛、Consul 双份收敛、EvalSeedPort 收窄、web-panel real 路径实现）——均进入 debt register 记录后续落点，不在本轮实施。
- 不改变任何运行时语义；不重开已归档主线。

## 执行组织

按"纯删除（最大并行）→ 结构修复（按包并行）→ 守卫落地（顺序）"三波推进，由主细则按任务组织，使用 subagent-driven development 并行执行。
