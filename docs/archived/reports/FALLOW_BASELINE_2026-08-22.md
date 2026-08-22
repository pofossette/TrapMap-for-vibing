# fallow 基线报告（2026-08-22，A12）

方法：`pnpm duplication` + `pnpm exec fallow audit --base <main>` 于各车道合并点执行。

结论：
- 全部 tranche-1/tranche-2 车道合并门均要求 changed-file findings 清零（继承 finding 由 gate 排除机制标注）。
- 当前已知继承复杂度热点：`internal-client.ts createInternalServiceClients`（488 行，既有）、`capability-model/resolution.ts` 两函数（A8 机械移动保留体，fallow-ignore 标注）、`loadServiceConfig`（70 行，既有）。
- apps workspace 迁移暴露的 34 findings 中无新增真实变更项；「重复工具函数」条目核验无第三次同类复制。
- 进入条件刷新：仅当上述 hotspot 与生产故障/边界违规/连续三次相关变更关联时开 scoped tranche。
