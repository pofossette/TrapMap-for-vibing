# TrapMap Backend Build Targets Plan Index

## 状态

- 状态：`执行入口已切换`
- 日期：`2026-06-27`
- 本文件角色：根级执行计划索引，只保留目标、总体要求、阶段勾选和细则入口
- 当前活跃细则：[`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md)
- 刚归档的上一份根计划：[`docs/archived/archived-plans/plan-2026-06-27-component-replacement-index-archived.md`](docs/archived/archived-plans/plan-2026-06-27-component-replacement-index-archived.md)

## 目标

- 将 TrapMap 后端收敛为更优雅、更易管理的两种构建目标：`light` 与 `heavy`
- 保持 `contracts + backend-core + service assembly` 的实现复用，不维护第二套业务真相
- 将轻重差异收敛到宿主、connector、bootstrap、deployment wiring，而不是散落到业务实现
- 为客户端增加一个显式配置项，用于区分目标后端形态，同时继续保持 `gateway only` 接入模型

## 总体要求

- 根 `plan.md` 只做索引；执行细节、冻结结论、最小验证和回写清单统一写入 [`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md)
- 每个阶段勾选前，必须同时完成：实现或结论冻结、聚焦测试、相关文档回写、`pnpm check:docs-drift`、`pnpm check:structure`
- 不允许把 `light/heavy` 做成新的业务真相分叉；共享实现必须继续落在 `contracts`、`backend-core`、`service-*` 主实现与明确的 host-agnostic seam
- 客户端新增配置项只能表达目标后端形态，不得演化成第二套 URL、第二套认证模型或内部服务直连能力
- 兼容壳清理以“尽可能清除”为默认方向：已经有真实替代实现的壳层优先删除，尚无替代实现的部分必须先抽离职责再删，禁止继续向兼容壳写入新的 authoritative 业务逻辑

## 当前关键路径

- 当前主线阶段：`Phase 0 术语与映射冻结`
- 当前先做：
  - [x] 冻结 `light` / `heavy` 的正式命名和与现有 profile 的映射关系
  - [x] 明确哪些差异属于 host / connector / deployment，哪些仍是统一业务实现
  - [x] 规划客户端后端形态配置项的命名、值域、默认值与兼容迁移
  - [x] 盘点兼容壳清单，并按“立即清除 / 替换后删除 / 真实实现保留”三类冻结
  - [x] 补齐对应的文档入口和最小验证矩阵

## 阶段索引

### Phase 0 术语与映射冻结 [已完成]

- [x] 冻结 `light` / `heavy` 构建目标术语和适用范围
- [x] 写清与 `local-agent`、`team-monolith`、`distributed`、`gateway only` 的映射关系
- [x] 明确仍以现有 capability/profile truth source 为准，不制造第二套事实源
- 细则：[`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md)

### Phase 1 后端构建目标收敛 [待开始]

- [ ] 冻结 `light` 与 `heavy` 的正式边界、共享实现面和宿主差异面
- [ ] 明确是否需要新的 build/startup 入口或脚本别名
- [ ] 冻结当前兼容壳判定：哪些属于过渡层，哪些其实已经是默认轻宿主真实实现
- [ ] 回写 package/host/deployment 叙事，避免多套描述并存
- 细则：[`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md)

### Phase 2 connector、装配与兼容壳清理 [待开始]

- [ ] 收敛轻重路径的 connector / invocation / transport glue
- [ ] 保留本地 connector 与远端 connector 两套 adapter，但统一依赖同一组 port
- [ ] 明确失败语义、重试、超时、trace/header 传播的负责层
- [ ] 优先删除“只有转发或 501 语义”的兼容壳与 facade
- [ ] 将 `@trapmap/server` 中仍被默认轻宿主依赖的真实职责迁到明确宿主或共享 seam，再删除残余 compatibility route
- 细则：[`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md)

### Phase 3 客户端后端形态配置项 [待开始]

- [ ] 在客户端状态中新增后端形态配置项
- [ ] 明确它对 CLI / client-core / web-panel 的影响边界
- [ ] 补齐配置兼容迁移、文档和最小测试
- 细则：[`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md)

### Phase 4 closeout 与守卫 [待开始]

- [ ] 冻结最终术语、入口文档和 truth source
- [ ] 必要时补 docs drift / smoke 守卫，避免旧叙事回流
- [ ] 关闭本轮索引与细则中的所有未决项
- 细则：[`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md)

## 文档回写要求

- 架构概览、快速开始或对外叙事变化：更新 `README.md`、`docs/README.md`
- 包职责、宿主职责、目录落点变化：更新 `docs/PACKAGES.md`、`docs/reference/REPO_STRUCTURE.md`
- 真相源、术语映射、执行索引变化：更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- 兼容壳清单、默认入口和退役顺序变化：更新 `docs/todos/nestjs-service-evolution-04-data-runtime-and-cutover.md`、必要的 host/server README
- 客户端配置、接入模型或状态结构变化：更新 `docs/architecture/components/CLIENT.md`、`packages/cli/README.md`、必要时更新 `packages/client-core/README.md`
- 根计划切换或归档变化：更新 `docs/archived/README.md`、`docs/todos/README.md`

## 测试回写要求

- 仅调整计划/索引文档：至少运行 `pnpm check:docs-drift` 与 `pnpm check:structure`
- 涉及客户端配置项：补 `packages/cli` 配置读写/兼容迁移相关测试
- 涉及 client-core contract：补对应包的最小测试
- 涉及构建目标映射、宿主选择、runtime/deployment surface：补 `pnpm test:deployment-smoke`
- 涉及 bootstrap/runtime/connector foundations：补 `pnpm test:runtime-foundations`
- 涉及兼容壳删除、入口切换或 facade 清理：补受影响包最小测试，并确认 `pnpm test:deployment-smoke` 覆盖新默认路径

## 完成定义

- 根 `plan.md` 只保留当前“轻重后端构建目标”主线的索引职责
- [`docs/todos/backend-build-targets-plan.md`](docs/todos/backend-build-targets-plan.md) 成为唯一活跃细则入口
- `light` / `heavy` 的术语、映射关系、共享实现边界和宿主差异边界已冻结
- 客户端后端形态配置项有明确语义、兼容迁移和最小测试要求
- 入口文档、truth source、结构索引和最小守卫与实现一致
