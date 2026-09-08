# 待办索引

> 角色：`docs/todos/` 的薄索引，只做导航，不复述事实细节。
> 状态：Active（2026-09-08）。
> Owner：根 [`plan.md`](../../plan.md)；各细则的 owner 见下表。

## 活跃索引

下表与根 `plan.md` 的当前主线一一对应。根索引暂无 active mainline（2026-09-08 收口），所以本表 active 行为空，其余全部标 Queued 或登记册身份。

| 文件 | 角色 | 状态 |
|---|---|---|
| [cli-server-integration-mainline.md](cli-server-integration-mainline.md) | CLI 真实服务对接测试（Three-Artifact Live + Docker 资源观测） | Queued（2026-09-08；Phase 0-4 + Phase 5.1-5.2 已勾，仅剩 Phase 5.3 归档） |
| [web-panel-feature-and-ui-optimization.md](web-panel-feature-and-ui-optimization.md) | Web Panel 功能补全与 UI 美化优化 | Queued（2026-09-08；Phase2 路由覆盖已闭环，仅剩 audit 断言，已转债务） |
| [gene-retrieval-eval.md](gene-retrieval-eval.md) | Gene 检索评测扩展（spec，T0-T6 未 dispatch） | Queued spec（2026-09-06 落规格，代码实现尚未 dispatch；进入执行需根 `plan.md` 显式链接） |
| [open-debt-and-compromises.md](open-debt-and-compromises.md) | 长期工程债务与平台成熟度登记 | 长期登记册；非 active mainline |
| [assert-exemptions.md](assert-exemptions.md) | 裸类型断言豁免清单 | 由 `pnpm check:asserts` 门禁追踪；非 active mainline |

## Closeout 四件套

只剩收尾动作的排队项在这里登记目标达成、证据、残留落点、验证命令。Gene spec 尚未开工，开工后再补。

- CLI（仅剩归档动作）：目标达成见细则 Phase 勾选；证据在 `benchmarks/results/cli-integration/` 与 [evidence/cli-integration-2026-09-02/](evidence/cli-integration-2026-09-02/SUMMARY.md)；残留落点为 `git mv` 归档细则并更新本索引与根 `plan.md`；验证命令 `pnpm typecheck` + `pnpm check:docs` + `pnpm check:structure` + `pnpm check:complexity`。
- Web Panel（仅剩 audit 断言）：目标达成见细则 Phase 勾选；证据在 [evidence/web-panel-baseline-2026-09-02/](evidence/web-panel-baseline-2026-09-02/)；残留 audit 缺口已转 [open-debt-and-compromises.md](open-debt-and-compromises.md) 跟踪，恢复执行需 owner 另行确认；验证命令见细则 Acceptance Gates。

## 目录规则

- 未被根 `plan.md` 明确链接、且不承担当前 owner 执行职责的文档，不属于 active surface。
- 已完成主线、空白清单、历史 closeout 证据统一转入 `docs/archived/` 或 `docs/archived/archived-plans/`。
- 需要重启某个归档主题时，新建新的 active 细则，不把归档文档重新当 checklist 使用。
- `go-accelerator-mainline.md` 与 `skill-registry-mainline.md` 两份 scaffold 均已合入 `pre@a9b413b5`，在切换提交中删除，本轮不动。

## 当前状态说明

当前无 active mainline（2026-09-08 收口）。CLI 与 Web Panel 为排队项，Gene 为排队 spec（T0-T6 待 dispatch）。[open-debt-and-compromises.md](open-debt-and-compromises.md) 是唯一长期问题登记册；[assert-exemptions.md](assert-exemptions.md) 由断言守卫追踪。Dead Code and Architecture Order Cleanup 已完成并归档，细则原文存 `docs/archived/archived-plans/dead-code-and-architecture-order-cleanup.md（已归档，路径冻结）`（原 `docs/todos/dead-code-and-architecture-order-cleanup.md（已归档，路径冻结）`，全量重写时未迁移），残余 Task 11-13 回写见长期登记册。

完整归档表见 `docs/archived/README.md（已归档，路径冻结）`（全量重写时归档目录已删除，历史表冻结）。
