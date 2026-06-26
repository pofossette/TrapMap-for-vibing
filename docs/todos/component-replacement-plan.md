# 组件替换计划

> 当前角色：组件/依赖替换执行细则。根级索引见 [`plan.md`](../../plan.md)。

## 背景

当前仓库已经在若干通用基础设施层出现“手搓实现大于必要复杂度”的情况，但并非所有复杂代码都适合引入第三方包替换。

本计划只覆盖三类事项：

- 纯通用工具替换：文件扫描、路径匹配、slug 生成
- 通用缓存能力替换：LRU + TTL + eviction 机制
- 异步底座评估：是否值得把当前 PG queue/outbox 演进为现成任务队列产品

本计划明确排除以下内容：

- GraphRAG-lite 检索编排
- trap-first plan compiler
- 治理过滤、owner matrix、运行时契约
- bounded-context 业务逻辑

## 目标

- 优先替换低风险、低耦合的手搓通用组件。
- 缩小基础设施层的维护面，而不破坏既有 domain contract、operator surface 和测试矩阵。
- 把“值得替换”和“不该替换”的边界写清楚，避免后续广义“引包重构”失控。

## 替换优先级

### Phase 0 盘点与冻结 [待开始]

- [ ] 冻结当前候选清单：文件扫描/slug、缓存、任务队列
- [ ] 在细则中逐项标明：预期收益、替换成本、非目标、最小验证
- [ ] 明确“不替换”范围：图查询、GraphRAG-lite、治理/契约逻辑

### Phase 1 通用工具替换 [建议先做]

- [ ] 评估并引入 `fast-glob`
- [ ] 评估并引入 `slugify` 或 `@sindresorhus/slugify`
- [ ] 把 skill 目录扫描、文件分类收集和 slug 生成规则统一到共享 helper
- [ ] 删除重复的手写遍历和重复 slug 逻辑

重点落点：

- `packages/cli/src/lib/artifact-bundle.ts`
- 若后续出现服务端同类扫描逻辑，优先复用共享 helper，而不是继续复制

最小验证：

- `rtk pnpm --filter @trapmap/cli test --run src/lib/artifact-bundle.test.ts`
- 若 shared contract/helper 进入 `contracts`，补 `rtk pnpm --filter @trapmap/contracts test --run <path>`

### Phase 2 缓存能力替换 [有条件推进]

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

### Phase 3 任务队列产品化评估 [单独决策]

- [ ] 对比 `pg-boss` 与 `graphile-worker`
- [ ] 逐项映射当前能力：dedupe、lease reclaim、dead-letter、operator snapshot、runtime metrics
- [ ] 判断是“保持自研”还是“单独立项迁移”，不允许无结论半替换
- [ ] 若迁移价值不足，明确记录继续自研的理由

重点原则：

- 当前 queue/outbox 不是简单工具函数，而是已进入 runtime/operator truth surface
- 只有在接受重新实现可观测性、失败语义和迁移验证的前提下，才允许替换

最小验证：

- 若只是方案评估：文档校验即可
- 若进入实现：至少补 `rtk pnpm test:file -- packages/server/src/lib/queue/task-queue.test.ts`
- 若进入实现：至少补 `rtk pnpm test:file -- packages/server/src/lib/lifecycle/outbox.test.ts`
- 若进入实现：补 `rtk pnpm test:runtime-foundations`
- 若进入实现且影响运行时 surface：补 `rtk pnpm test:deployment-smoke`

## 当前结论

### 值得优先引包

- `fast-glob`
- `slugify` 或 `@sindresorhus/slugify`
- `lru-cache`

### 只做评估，不直接替换

- `pg-boss`
- `graphile-worker`

### 明确不替换

- `graphology` 上层的业务语义组装
- trap-first plan compiler
- retrieval governance / owner / operator 契约

## 文档回写要求

- 若新增依赖并改变技术栈事实：更新 `docs/README.md`
- 若改变包职责或 helper 落点：更新 `docs/reference/REPO_STRUCTURE.md`
- 若改变测试入口或验证矩阵：更新 `docs/operations/TESTING.md`
- 若只是结论冻结：保持根 `plan.md` 与本页一致即可

## 完成定义

- 根 `plan.md` 只保留“当前做哪一类替换”的索引。
- `docs/todos/component-replacement-plan.md` 成为唯一活跃细则入口。
- 低风险替换项有明确实施顺序和最小验证。
- 高风险替换项有明确“不做”或“单独立项”的结论。
