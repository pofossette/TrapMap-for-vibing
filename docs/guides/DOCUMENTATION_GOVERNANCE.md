# 文档治理指南

本文档定义 TrapMap 的文档分层、回写触发条件，以及真实问题如何沉淀为长期资产。

## 文档分层

- [`README.md`](../../README.md)：给人读的项目入口，负责背景、价值、快速开始、主要导航
- [`AGENTS.md`](../../AGENTS.md)：给 agent 读的执行入口，负责任务分流、最小验证、回写要求
- [`CLAUDE.md`](../../CLAUDE.md)：Claude Code 兼容入口，只指向 `AGENTS.md`
- `docs/reference/*`：权威事实源，负责定义“什么是真的”
- `docs/guides/*`：开发、贡献、集成、文档治理等操作流程
- `docs/operations/*`：测试、CI、环境、安全、部署运维规则
- `docs/architecture/*`：架构说明、组件职责、API/CLI/部署设计

出现事实冲突时，以 [`docs/reference/SYSTEM_TRUTH_SOURCES.md`](../reference/SYSTEM_TRUTH_SOURCES.md) 和具体权威源码入口为准。

## 什么时候必须回写文档

以下任一类变更发生时，必须判断并更新对应文档：

- 新增、删除或重命名启动命令、开发命令、测试命令、评测命令
- 新增目录、包职责变化、文档落点变化、归档规则变化
- 新增或修改 API、共享契约、状态枚举、数据模型、持久化事实
- 新增或修改环境变量、权限模型、安全等级、部署默认值、运行时 profile
- 新增工程强约束，例如测试入口规则、目录结构守护、类型组织约定
- 修复一次真实且可能复发的问题，需要判断是否沉淀为测试、文档规则、Skill 或 badcase

## 回写到哪里

- 影响项目认知、使用方式、快速开始：更新 [`README.md`](../../README.md)
- 影响 agent 路由、最小验证、任务入口：更新 [`AGENTS.md`](../../AGENTS.md)
- 影响架构事实、目录事实、命令真相、数据真相：更新 `docs/reference/*` 或对应权威页
- 影响具体开发/贡献/集成步骤：更新 `docs/guides/*`
- 影响测试、CI、安全、环境、部署运维规则：更新 `docs/operations/*`
- 影响组件边界、运行时行为、接口设计：更新 `docs/architecture/*`

## 回写顺序

1. 先更新权威事实源或源码真相
2. 再更新二级说明文档
3. 最后更新入口索引，例如 `README.md`、`AGENTS.md`、`docs/README.md`

如果某类文档漂移可能反复出现，优先补守卫而不是只补文字说明：

- 文本漂移：优先补 `pnpm check:docs-drift`
- 目录落点漂移：优先补 `pnpm check:structure`
- 事实一致性漂移：优先补 truth smoke 或对应测试

## 复发性问题沉淀规则

当一次真实问题同时满足以下条件时，提交者必须判断其是否需要沉淀：

- 可以复现或可以稳定描述触发条件
- 未来有较大概率再次发生
- 会影响结果正确性、治理安全性、开发流程稳定性或文档判断

需要显式判断沉淀到哪一类资产：

- 测试用例：适合防止代码或契约回归
- 文档规则：适合防止操作方式、流程约定或入口判断再次漂移
- Skill / Trap 条目：适合沉淀工作流、经验或复发坑点
- badcase：适合沉淀 retrieval、summary、governance、feedback 等真实失败样本

如果判断“不需要沉淀”，在 PR 描述或变更说明中写出原因。

## Badcase 回流

对 retrieval、summary、governance、remediation、feedback 相关真实失败，优先遵循现有 badcase 闭环：

`发现问题 -> 记录反馈 -> 补齐 query/命中快照/期望结果 -> 判断是否导出为 eval draft -> 纳入回归验证`

参考：

- [`docs/archived/archived-plans/badcase-feedback-loop.md`](../archived/archived-plans/badcase-feedback-loop.md)
- `GET /v1/operations/badcases/:feedbackId/export`
- `scripts/export-badcase-to-eval.ts`

## 最小验证

文档、入口、结构规则变更完成后，至少运行：

```bash
pnpm check:docs-drift
pnpm check:structure
```

如果改动触及 truth source、架构事实或对应 smoke 用例，再补跑相关最小测试。
