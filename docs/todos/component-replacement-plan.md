# 组件替换计划

> 当前角色：组件/依赖替换执行细则。根级索引见 [`plan.md`](../../plan.md)。

## 背景

当前仓库已经在若干通用基础设施层出现“手搓实现大于必要复杂度”的情况，但并非所有复杂代码都适合引入第三方包替换。

本计划当前覆盖四类事项：

- 前端 remote state 与数据获取层替换
- prompt/template 底座替换
- 纯通用工具替换：文件扫描、路径匹配、slug 生成、CLI 配置持久化
- 通用缓存能力替换：LRU + TTL + eviction 机制
- 异步底座迁移：把当前 PG queue 演进为 `pg-boss`

本计划明确排除以下内容：

- GraphRAG-lite 检索编排
- trap-first plan compiler
- 治理过滤、owner matrix、运行时契约
- bounded-context 业务逻辑

## 目标

- 优先替换低风险、低耦合的手搓通用组件。
- 缩小基础设施层的维护面，而不破坏既有 domain contract、operator surface 和测试矩阵。
- 把“值得替换”和“不该替换”的边界写清楚，避免后续广义“引包重构”失控。
- 对任务队列收敛出单独迁移主线，避免继续长期维护半产品化自研队列。

## 替换优先级

### Phase 0 盘点与冻结 [进行中]

- [ ] 冻结当前候选清单：前端 remote state、模板渲染、CLI 配置、文件扫描/slug、缓存、任务队列
- [ ] 在细则中逐项标明：预期收益、替换成本、非目标、最小验证
- [ ] 明确“不替换”范围：图查询、GraphRAG-lite、治理/契约逻辑

当前冻结结论：

- 已确定优先候选：`@tanstack/react-query`、`liquidjs`
- 已确定低风险候选：`confbox` 或 `conf`、`fast-glob`、`slugify` 或 `@sindresorhus/slugify`
- 已确定迁移项：`pg-boss`
- 暂缓但可继续评估：`lru-cache`
- 明确不做全盘替换：artifact/retrieval/governance 的领域语义层

### Phase 1 前端 remote state 替换 [建议先做]

- [ ] 引入 `@tanstack/react-query`
- [ ] 保留 `zustand` 处理 filters、theme、纯本地交互态
- [ ] 逐步移除各 feature store 内自定义 request lifecycle 逻辑
- [ ] 不改变 mapper、view-model、service context 的领域接口

重点落点：

- `packages/web-panel/src/stores/*.ts`
- `packages/web-panel/src/features/**`
- `packages/web-panel/src/services/api/http-client.ts`

最小验证：

- `rtk pnpm --filter @trapmap/web-panel test --run src/app/router/router.test.tsx`
- `rtk pnpm --filter @trapmap/web-panel test --run src/features/review-detail/service.test.ts`
- `rtk pnpm --filter @trapmap/web-panel test --run src/stores/review-queue-store.test.ts`

### Phase 2 Prompt 模板底座替换 [建议先做]

- [ ] 引入 `liquidjs`
- [ ] 统一 JSON/XML/text prompt 模板语法
- [ ] 停止继续扩展自定义 `_if_` / `#list` / 手动修补 JSON 逗号 的模板能力
- [ ] 保留 provider 选择、slot 组织、最终 prompt contract

重点落点：

- `packages/server/src/lib/ai/providers/json-renderer.ts`
- `packages/server/src/lib/ai/providers/xml-renderer.ts`
- 相关 provider template loader / test

最小验证：

- `rtk pnpm test:file -- packages/server/src/lib/ai/providers/index.test.ts`
- 若无聚焦测试，至少补对应 renderer 测试并运行

### Phase 3 CLI 与通用工具替换 [建议先做]

- [ ] 评估并引入 `fast-glob`
- [ ] 评估并引入 `slugify` 或 `@sindresorhus/slugify`
- [ ] 评估并引入 `confbox` 或 `conf`
- [ ] 把 skill 目录扫描、文件分类收集和 slug 生成规则统一到共享 helper
- [ ] 收敛 CLI 配置持久化，减少手写路径/读写/默认值拼装逻辑
- [ ] 删除重复的手写遍历和重复 slug 逻辑

重点落点：

- `packages/cli/src/lib/artifact-bundle.ts`
- `packages/cli/src/lib/config.ts`
- 若后续出现服务端同类扫描逻辑，优先复用共享 helper，而不是继续复制

最小验证：

- `rtk pnpm --filter @trapmap/cli test --run src/lib/artifact-bundle.test.ts`
- `rtk pnpm --filter @trapmap/cli test --run src/lib/config.test.ts`
- 若 shared contract/helper 进入 `contracts`，补 `rtk pnpm --filter @trapmap/contracts test --run <path>`

### Phase 4 pg-boss 迁移 [已确定方向]

- [ ] 引入 `pg-boss`
- [ ] 明确迁移边界：优先替换 `task_queue` 的 claim/retry/schedule/dead-letter 能力
- [ ] 保留现有 runtime metrics、operator snapshot、route surface、worker bootstrap contract
- [ ] 评估 outbox 是保持现状还是与 queue 迁移解耦推进
- [ ] 不允许在未完成 truth-source、测试矩阵、operator surface 映射前半替换上线

重点原则：

- 当前 [task-queue.ts](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/src/lib/queue/task-queue.ts:1) 已承担半产品化职责，继续自研维护成本偏高
- `pg-boss` 只替换“任务存储/调度/重试/领取”内核，不替换 bounded-context 任务语义
- 优先保持 `TaskQueuePort` 兼容，让迁移落在 infrastructure seam 而不是 route / application 层

重点落点：

- `packages/server/src/lib/queue/task-queue.ts`
- `packages/server/src/bootstrap/bootstrap-workers.ts`
- `packages/server/src/bootstrap/run-worker-sequence.ts`
- `packages/server/src/lib/lifecycle/outbox.ts`
- `packages/host-local/src/bootstrap/server.ts`
- `packages/host-distributed/src/**/server.ts`

最小验证：

- `rtk pnpm test:file -- packages/server/src/lib/queue/task-queue.test.ts`
- `rtk pnpm test:file -- packages/server/src/lib/lifecycle/outbox.test.ts`
- `rtk pnpm test:runtime-foundations`
- `rtk pnpm test:deployment-smoke`

### Phase 5 缓存能力替换 [有条件推进]

- [ ] 评估并引入 `lru-cache`
- [ ] 保留一层 TrapMap wrapper，继续暴露现有 metrics / invalidation 语义
- [ ] 确认 `intent-cache`、`retrieval-read-model-cache`、query embedding cache 不需要改调用协议
- [ ] 仅替换 LRU/TTL/eviction 内核，不重写 operator status cache contract

重点落点：

- `packages/server/src/lib/cache/retrieval-cache.ts`
- `packages/server/src/lib/retrieval/capsules/intent-cache.ts`
- `packages/server/src/lib/cache/retrieval-read-model-cache.ts`

最小验证：

- `rtk pnpm test:file -- packages/server/src/lib/cache/retrieval-cache.test.ts`
- `rtk pnpm test:file -- packages/server/src/lib/retrieval/capsules/intent-cache.test.ts`
- `rtk pnpm test:file -- packages/server/src/routes/operations/status.test.ts`

## 当前结论

### 值得优先引包

- `@tanstack/react-query`
- `liquidjs`
- `confbox` 或 `conf`
- `fast-glob`
- `slugify` 或 `@sindresorhus/slugify`

### 已确定引入 / 迁移

- `pg-boss`

### 有条件推进

- `lru-cache`

### 明确不替换

- `graphology` 上层的业务语义组装
- trap-first plan compiler
- retrieval governance / owner / operator 契约
- artifact/profile/capsule 派生策略本身

## 文档回写要求

- 若新增依赖并改变技术栈事实：更新 `docs/README.md`
- 若改变包职责或 helper 落点：更新 `docs/reference/REPO_STRUCTURE.md`
- 若改变测试入口或验证矩阵：更新 `docs/operations/TESTING.md`
- 若只是结论冻结：保持根 `plan.md` 与本页一致即可

## 完成定义

- 根 `plan.md` 只保留“当前做哪一类替换”的索引。
- `docs/todos/component-replacement-plan.md` 成为唯一活跃细则入口。
- 低风险替换项有明确实施顺序和最小验证。
- `pg-boss` 迁移有独立阶段、明确边界和回归集合。
- 高耦合领域复杂度有明确“不替换”的冻结结论。
