# TrapMap Component Replacement Plan Index

## 状态

- 状态：`执行入口已切换`
- 日期：`2026-06-26`
- 本文件角色：根级执行计划索引，只保留目标、优先级、进度勾选和细则入口
- 当前活跃细则：[`docs/todos/component-replacement-plan.md`](docs/todos/component-replacement-plan.md)
- 刚归档的上一份根计划：[`docs/archived/archived-plans/plan-2026-06-26-nestjs-service-evolution-phase4-index-archived.md`](docs/archived/archived-plans/plan-2026-06-26-nestjs-service-evolution-phase4-index-archived.md)

## 目标

- 用成熟第三方包替换通用基础设施层里维护收益偏低的手搓实现。
- 保持 bounded-context 业务逻辑、治理契约、GraphRAG-lite 语义和 operator surface 不被误替换。
- 按“低风险立即替换、中风险封装替换、高风险先评估”的顺序推进。

## 总体要求

- 根 `plan.md` 只做索引；执行细节、候选清单、最小验证和结论统一写入 `docs/todos/component-replacement-plan.md`。
- 每个阶段勾选前，必须同时完成：实现或结论冻结、最小验证、相关文档回写、`pnpm check:docs-drift`、`pnpm check:structure`。
- 不允许把领域专属复杂度误判成“应该引包”。图计划编排、治理过滤、owner matrix、runtime contract 不在本轮替换范围。

## 当前关键路径

- 当前主线阶段：`Phase 1 通用工具替换`
- 当前先做：
  - [ ] 冻结候选清单与非目标边界
  - [ ] 优先替换 skill 导入链路里的目录扫描与 slug 生成
  - [ ] 评估缓存内核是否切到 `lru-cache`
  - [ ] 仅对队列产品化做方案评估，不直接开做迁移

## 阶段索引

### Phase 0 候选冻结 [进行中]

- [ ] 冻结“值得替换 / 只评估 / 明确不替换”三类清单
- [ ] 明确每类的验证入口和文档回写规则
- 细则：[`docs/todos/component-replacement-plan.md`](docs/todos/component-replacement-plan.md)

### Phase 1 通用工具替换 [待开始]

- [ ] 评估并引入 `fast-glob`
- [ ] 评估并引入 `slugify` 或 `@sindresorhus/slugify`
- [ ] 收敛 skill 目录扫描与 slug 生成逻辑
- 细则：[`docs/todos/component-replacement-plan.md`](docs/todos/component-replacement-plan.md)

### Phase 2 缓存能力替换 [待开始]

- [ ] 评估并引入 `lru-cache`
- [ ] 保留 TrapMap cache metrics / invalidation wrapper
- [ ] 确认现有 operator cache surface 不变
- 细则：[`docs/todos/component-replacement-plan.md`](docs/todos/component-replacement-plan.md)

### Phase 3 队列产品化评估 [待开始]

- [ ] 对比 `pg-boss` 与 `graphile-worker`
- [ ] 冻结“继续自研”或“单独立项迁移”的结论
- [ ] 不允许半替换 queue/outbox runtime truth surface
- 细则：[`docs/todos/component-replacement-plan.md`](docs/todos/component-replacement-plan.md)

## 文档回写要求

- 技术栈事实变化：更新 `docs/README.md`
- 包职责或 helper 落点变化：更新 `docs/reference/REPO_STRUCTURE.md`
- 测试入口或验证矩阵变化：更新 `docs/operations/TESTING.md`
- 根计划切换或归档变化：更新 `docs/archived/README.md`、必要时更新 `docs/todos/README.md`

## 完成定义

- 根 `plan.md` 只保留当前组件替换主线的索引职责。
- `docs/todos/component-replacement-plan.md` 成为唯一活跃细则入口。
- 低风险替换项有明确顺序与最小验证。
- 高风险替换项有明确“不做”或“单独立项”的冻结结论。
