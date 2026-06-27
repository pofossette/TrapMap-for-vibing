# TrapMap Component Replacement Plan Index

## 状态

- 状态：`已归档`
- 原根计划日期：`2026-06-27`
- 本文件角色：历史根级执行计划索引，仅保留归档参考
- 当时活跃细则：[`docs/todos/component-replacement-plan.md`](../../todos/component-replacement-plan.md)
- 替代它的现行根计划：[`../../../plan.md`](../../../plan.md)

## 目标

- 用成熟第三方包替换通用基础设施层里维护收益偏低的手搓实现。
- 保持 bounded-context 业务逻辑、治理契约、GraphRAG-lite 语义和 operator surface 不被误替换。
- 按“低风险立即替换、中风险封装替换、高风险单独迁移”的顺序推进。

## 总体要求

- 根 `plan.md` 只做索引；执行细节、候选清单、最小验证和结论统一写入 `docs/todos/component-replacement-plan.md`。
- 每个阶段勾选前，必须同时完成：实现或结论冻结、最小验证、相关文档回写、`pnpm check:docs-drift`、`pnpm check:structure`。
- 不允许把领域专属复杂度误判成“应该引包”。图计划编排、治理过滤、owner matrix、runtime contract 不在本轮替换范围。
- 当前冻结结论：
  - `@tanstack/react-query`、`liquidjs`、CLI 配置持久化包属于优先候选
  - `pg-boss` 已确定引入，不再停留在“只评估”状态
  - artifact/retrieval/governance 的领域语义不在本轮“买包替换”范围

## 已冻结的包引入结论

- `liquidjs`：保留为 prompt/template 渲染长期方案，后续实施时优先替换自定义 JSON/XML 模板拼装逻辑，而不是继续扩展自研 renderer。
- `pg-boss`：保留为任务队列长期方案，后续实施时以 `TaskQueuePort` / runtime seam 为边界接入，不需要为现有数据做额外迁移预留。
- 当前根计划已切换，因此这些结论只作为归档参考；真正实施仍应回到 `docs/todos/component-replacement-plan.md` 补齐执行细则与最小验证。

## 当前关键路径

- 当前主线阶段：`Phase 0 候选冻结 + Phase 3 pg-boss 迁移立项`
- 当前先做：
  - [ ] 冻结“值得替换 / 局部替换 / 明确不替换”清单
  - [ ] 将 `pg-boss` 迁移从方案评估提升为单独实施主线
  - [ ] 优先替换前端 remote state 和 prompt 模板渲染底座
  - [ ] 再推进 CLI 配置持久化和低风险工具类替换

## 阶段索引

### Phase 0 候选冻结 [进行中]

- [ ] 冻结“值得替换 / 只评估 / 明确不替换”三类清单
- [ ] 明确每类的验证入口和文档回写规则
- [ ] 记录已冻结结论：`pg-boss` 确定引入，其他候选继续按风险排序推进
- 细则：[`docs/todos/component-replacement-plan.md`](../../todos/component-replacement-plan.md)

### Phase 1 前端与模板底座替换 [待开始]

- [ ] 评估并引入 `@tanstack/react-query`
- [ ] 评估并引入 `liquidjs`
- [ ] 保留 `zustand` 处理 UI / local state，不把 server state 继续堆到 store request lifecycle
- [ ] 统一 prompt/template DSL，不再继续扩展自定义 JSON/XML 模板语法
- 细则：[`docs/todos/component-replacement-plan.md`](../../todos/component-replacement-plan.md)

### Phase 2 CLI 与低风险工具替换 [待开始]

- [ ] 评估并引入 `confbox` 或 `conf`
- [ ] 评估并引入 `fast-glob`
- [ ] 评估并引入 `slugify` 或 `@sindresorhus/slugify`
- [ ] 收敛 CLI 配置持久化、skill 目录扫描与 slug 生成逻辑
- 细则：[`docs/todos/component-replacement-plan.md`](../../todos/component-replacement-plan.md)

### Phase 3 pg-boss 迁移 [待开始]

- [ ] 以 `TaskQueuePort`/runtime seam 为边界引入 `pg-boss`
- [ ] 映射现有能力：dedupe、lease reclaim、retry/backoff、dead-letter、operator snapshot、runtime metrics
- [ ] 明确 queue 与 outbox 的迁移边界，不允许半替换 runtime truth surface
- [ ] 补齐 `task-queue`、`outbox`、runtime foundations、deployment smoke 验证
- 细则：[`docs/todos/component-replacement-plan.md`](../../todos/component-replacement-plan.md)

### Phase 4 缓存能力替换 [待开始]

- [ ] 评估并引入 `lru-cache`
- [ ] 保留 TrapMap cache metrics / invalidation wrapper
- [ ] 确认现有 operator cache surface 不变
- 细则：[`docs/todos/component-replacement-plan.md`](../../todos/component-replacement-plan.md)

## 文档回写要求

- 技术栈事实变化：更新 `docs/README.md`
- 包职责或 helper 落点变化：更新 `docs/reference/REPO_STRUCTURE.md`
- 测试入口或验证矩阵变化：更新 `docs/operations/TESTING.md`
- 根计划切换或归档变化：更新 `docs/archived/README.md`、必要时更新 `docs/todos/README.md`

## 完成定义

- 根 `plan.md` 只保留当前组件替换主线的索引职责。
- `docs/todos/component-replacement-plan.md` 成为唯一活跃细则入口。
- 已冻结的优先候选有明确顺序与最小验证。
- `pg-boss` 迁移拥有单独阶段、明确边界和回归集合。
- 明确不替换的领域复杂度有冻结结论，避免“引包重构”外溢。
