# TrapMap 执行计划索引

根 `plan.md` 只作为当前主线目录：说明任务背景、总体要求和验收边界；不承载 tranche checklist 或实施细节，执行步骤、复选框、证据和回写记录全部维护在链接的 active detail 中。

## 计划使用方式

- 根索引只允许链接一个 active mainline；当前主线的任务顺序、owner、证据和回写记录以主细则为准。
- 主细则中的复选框只有在代码或文档变更、focused test、事实守卫和必要的 closeout 都有证据后才能勾选；根索引不复制这些复选框。
- 新发现的问题先进入主细则的问题池或 [长期债务登记册](docs/todos/open-debt-and-compromises.md)，不得因为“仍有参考价值”而创建第二条并行主线。
- 主线范围、入口或验收边界发生变化时，先更新主细则，再同步本索引；所有阶段完成并留存证据后才归档主细则。

## 当前主线

- **主题：** Dead Code and Architecture Order Cleanup
- **目标：** 删除全仓确认的死代码/死路径（约 3000+ 行），修复双份表定义与循环依赖，落地防复发守卫，守住 RouteDef/domain/pg-owner 架构秩序。
- **状态：** `进行中`
- **主细则：** [Dead Code and Architecture Order Cleanup](docs/todos/dead-code-and-architecture-order-cleanup.md)
- **设计规格：** [Dead Code and Architecture Order Cleanup Design](docs/superpowers/specs/2026-08-15-dead-code-and-architecture-order-cleanup-design.md)
- **状态口径：** `进行中` 只表示该主细则仍是 active execution surface；任务完成度、阻塞项和证据以主细则复选框与 closeout 记录为准。

## 执行路线图

| 阶段 | 主细则任务 | 阶段交付 | 放行条件 |
|---|---|---|---|
| 1. 纯删除 | Task 1-6 | 全仓确认零消费者的死代码/死路径删除（backend-core、contracts、service-*、hosts、web-panel、evals） | 删除后全仓 grep 零残留（除 dist 陈旧产物），typecheck 全绿 |
| 2. 结构修复 | Task 7-11 | candidates 表单源、contracts 逻辑下沉、循环依赖解除、SQL 落位、表清单校准 | 单源表定义、无 write↔read 环、domain 零 SQL、文档与代码表一致 |
| 3. 守卫落地 | Task 12-13 | 表清单 diff、pgTable 双份、eval import 边界、@eval-only 标记四类守卫接入 CI；回归验证与 closeout | 守卫可阻断；全量 typecheck/测试/fallow 全绿；debt register 回写 |

阶段必须按顺序推进；任一阶段未通过放行条件，不得用后续阶段的实现掩盖前置事实或守卫失败。具体步骤和证据位置见[主细则](docs/todos/dead-code-and-architecture-order-cleanup.md)。

## 任务背景

2026-08-15 全仓六路并行架构审查（backend-core / hosts / service-* / contracts+persistence / cli+client-core+web-panel / evals+ai-providers+lib）确认了约 3000+ 行零消费者死代码、一批结构性漂移（candidates 表双份、knowledge-write↔knowledge-read 循环依赖、SQL 落进 backend-core domain、DATABASE_SCHEMA.md 62→64 漂移）与 eval 白盒 import 无边界。本主线先做零风险删除、再修结构、最后把"防复发"变成可验证的 CI 守卫，避免同类漂移再次发生。

## 范围边界

本轮纳入：

- 全仓确认死代码/死路径删除（backend-core use-cases/ 四文件、telemetry-ports、runtime/status|topology|route-surface、contracts async.ts/operations.ts/graph-query.ts 死段与死函数、service-* eval-only 模块标记与孤儿 schema/drizzle.config 清理、hosts 死依赖与死文件、web-panel 误提交构建产物、evals 双轨 runner 合并）；
- candidates 表双份合并、contracts 逻辑下沉（图算法/parsing）、write↔read 循环依赖解除、SQL 移出 domain、DATABASE_SCHEMA 校准；
- 表清单 diff、pgTable 双份、eval import 边界、@eval-only 标记四类防复发守卫接入 CI；
- debt register 回写与大重构项登记。

本轮不纳入：

- 大规模重构：capability-model 拆分、OTel/Consul 双份收敛、EvalSeedPort 收窄、web-panel real 路径实现、internal-client review/governanceReview 合并、shared/ports.ts 业务下沉——全部登记为长期 debt 带进入条件；
- 任何运行时语义变更；不重开已归档主线。

## 总体要求

- **行为不变是硬约束：** 纯删除任务不得改变保留代码语义；删除前全仓 grep 验证零消费者。
- **契约包纯净：** `contracts` 只留 schema + 纯类型；可执行逻辑下沉到消费方。
- **domain 纯净：** backend-core domain 零框架、零 DB、零 SQL。
- **eval-only 标记：** 产品零消费、仅 eval 引用的模块统一标记并从产品导出面移除。
- 禁止新增断言；禁止为压低指标引入大规模抽象。
- 每任务包含 focused test、typecheck、必要的 fallow audit 与文档回写；跨包边界变化必须运行 Fallow audit。

## 验证门禁

- 每任务至少运行相关包 focused tests 与 `rtk pnpm typecheck`。
- 跨包导入或边界变化必须运行 `rtk pnpm exec fallow audit --base main`。
- 检索、摘要、治理、feedback、fixtures 或 eval runner 受影响时，至少运行 `rtk pnpm eval:smoke`。
- 文档变化至少运行 `rtk pnpm check:docs` 和 `rtk pnpm check:structure`。
- 收尾运行 `rtk pnpm exec knip` 并记录新基线。

## 验收边界

- 全仓确认死代码/死路径已删除，knip unused files/exports 显著下降。
- contracts 无图算法/parsing/worker 运行时逻辑；六包 schema.ts 只 re-export persistence-schema；无 service-* 之间实现级 import；backend-core domain 零 SQL。
- DATABASE_SCHEMA.md 与 persistence-schema 一致（64 表）。
- 四类防复发守卫接入 CI 且可阻断；eval-only 模块带标记。
- 全量 typecheck、受影响包测试全绿；fallow audit 无 changed-file issue；debt register 已回写。

完成主线还必须满足：所有 active detail completion gates 均有命令输出或测试证据，CI 中的文档守卫为 blocking，未完成事项已在主细则或长期债务登记册中标明后续落点。

## 长期债务与历史入口

- [长期 open debt 与触发条件](docs/todos/open-debt-and-compromises.md)：不构成第二条 active mainline。
- [已归档 Documentation Validation and Observability Platform 主线](docs/archived/archived-plans/documentation-validation-and-observability-platform-archived.md)：上一轮完成主线的历史证据。
- [历史归档总表](docs/archived/README.md)。
