# 文档治理指南

> 状态：Active。本页定分层、回写触发与沉淀规则，守卫符号以 CI 实测为准。

## 文档分层

- `README.md`：给人读的项目入口，讲背景、价值、快速开始、主要导航
- `AGENTS.md`：给 agent 读的执行入口，讲任务分流、最小验证、回写要求
- `CLAUDE.md`：Claude Code 兼容入口，只指向 `AGENTS.md`
- `docs/reference/*`：权威事实源，定义什么是真的
- `docs/guides/*`：开发、贡献、集成、文档治理的操作流程
- `docs/operations/*`：测试、CI、环境、安全、部署运维规则
- `docs/architecture/*`：架构说明、组件职责、接口设计

事实冲突时以 `docs/reference/SYSTEM_TRUTH_SOURCES.md` 与具体权威源码入口为准。

## 什么时候必须回写文档

以下任一类变更发生时，你判断并更新对应文档：

- 新增、删除或重命名启动、开发、测试、评测命令
- 新增目录、包职责变化、文档落点变化、归档规则变化
- 新增或修改 API、共享契约、状态枚举、数据模型、持久化事实
- 新增或修改环境变量、权限模型、安全等级、部署默认值、运行时 profile
- 新增工程强约束，如测试入口规则、目录结构守护、类型组织约定
- 修了一次真实且可能复发的问题，判断是否沉淀为测试、文档规则、Skill 或 badcase

## 回写到哪里

- 影响项目认知与使用：`README.md`
- 影响 agent 路由与任务入口：`AGENTS.md`
- 影响架构、目录、命令、数据事实：`docs/reference/*` 或对应权威页
- 影响开发与集成步骤：`docs/guides/*`
- 影响测试、CI、安全、环境、运维规则：`docs/operations/*`
- 影响组件边界与运行时行为：`docs/architecture/*`

## 回写顺序

1. 先更新权威事实源或源码真相
2. 再更新二级说明文档
3. 最后更新入口索引（`README.md`、`AGENTS.md`、`docs/README.md`）

某类漂移反复出现时，你优先补守卫而不是只补文字：

- 文本漂移：补 `pnpm check:docs`
- 目录落点漂移：补 `pnpm check:structure`
- 事实一致性漂移：补 truth smoke 或对应测试

## 数据与架构防复发守卫

以下守卫已接入 CI `doc-guardrails` job 与 `scripts/run-ci.ts`。你新增表、改表清单、改 evals 或服务包导入关系时保持它们通过：

- `pnpm check:table-schema`：表清单守卫。以 `packages/db/src/schema/` 的 `pgTable`（42 张）为权威，diff `docs/reference/DATABASE_SCHEMA.md`。新增表同步更新文档。
- `pnpm check:pgtable-single-source`：pgTable 单源守卫。`packages/service-*` src 禁止直接 `pgTable(...)`，schema 只 re-export `@trapmap/db`。
- `pnpm check:eval-imports`：eval import 边界守卫。evals 经 `@trapmap/*` 包名、`packages/contracts/**`、host-local eval allowlist 或 `@eval-only` 模块接入 packages，其余深路径直连失败。
- `pnpm check:eval-only`：`@eval-only` 标记守卫。只被 evals 引用、无产品消费者、不经包 index 导出的模块带头注释。
- `pnpm check:skills`：Skill 文档守卫，随 `doc-guardrails` job 运行。
- `pnpm check:imports`：跨目录相对引用守卫，随 `doc-guardrails` job 运行。

## 复发性问题沉淀规则

真实问题同时满足可复现或可稳定描述、未来可能再犯、影响结果正确性或治理安全或流程稳定时，你判断沉淀去向：

- 测试用例：防代码或契约回归
- 文档规则：防操作方式与流程约定漂移
- Skill 或 Trap 条目：沉淀工作流、经验、复发坑点
- badcase：沉淀 retrieval、summary、governance、feedback 的真实失败样本

判断不沉淀时，在 PR 描述或变更说明里写原因。

## Badcase 回流

retrieval、summary、governance、remediation、feedback 的真实失败走这个闭环：

```text
发现问题 -> 记录反馈 -> 补齐 query / 命中快照 / 期望结果 -> 判断是否导出 eval draft -> 纳入回归验证
```

参考 `docs/archived/archived-plans/badcase-feedback-loop.md（已归档，路径冻结）`、`GET /v1/operations/badcases/:feedbackId/export`、`scripts/archived/export-badcase-to-eval.ts`。

## 最小验证

文档、入口、结构规则改完后，你至少跑：

```bash
pnpm check:docs
pnpm check:structure
```

改动触及 truth source、架构事实或对应 smoke 用例时，再补相关最小测试。
