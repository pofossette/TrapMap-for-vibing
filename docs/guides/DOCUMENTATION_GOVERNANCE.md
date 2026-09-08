# 文档治理指南

> 状态：Active（2026-09-08）。本页定分层、回写触发与沉淀规则，守卫符号以 CI 实测为准。

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

- `pnpm check:table-schema`：表清单守卫。以 `packages/db/src/schema/` 的 `pgTable` 为权威，对照 `docs/reference/DATABASE_SCHEMA.md` 校验。新增表同步更新文档。
- `pnpm check:pgtable-single-source`：pgTable 单源守卫。`packages/service-*` src 禁止直接 `pgTable(...)`，schema 只 re-export `@trapmap/db`。
- `pnpm check:eval-imports`：eval import 边界守卫。evals 经 `@trapmap/*` 包名、`packages/contracts/**`、host-local eval allowlist 或 `@eval-only` 模块接入 packages，其余深路径直连失败。
- `pnpm check:eval-only`：`@eval-only` 标记守卫。只被 evals 引用、无产品消费者、不经包 index 导出的模块带头注释。
- `pnpm check:skills`：Skill 文档守卫，随 `doc-guardrails` job 运行。
- `pnpm check:imports`：跨目录相对引用守卫，随 `doc-guardrails` job 运行。

## 历史 marker 契约与冻结区豁免

双 marker 分工（单源：`scripts/docs-surface.ts` 的 `HISTORY_MARKERS`）：

- `（Wave-10 已删除）`：已删除包的存活引用。正文仍出现 `packages/server` 字样时，用它标注历史身份。
- `（已归档，路径冻结）`：指向冻结归档路径的引用，如 `docs/archived/archived-plans/compatibility-shell-retirement-runtime-infra-ownership.md（已归档，路径冻结）`，表示目标路径不再移动、不再更新。

豁免范围如实记录：

- 仅 reference guard（`scripts/check-doc-references.ts` 经 `containsHistoryMarker`）认这两个 marker，跳过 link target 与反引号路径的存在性校验。
- stale guard（`scripts/check-stale-package-refs.ts`）从同一 `HISTORY_MARKERS` 导入两个精确 marker，并保留行级模糊标记（如“兼容壳”“已于”“Wave-10”）以兼容既有标注行。字面整体替换会误报 `docs/guides/CODE_GUIDE.md:33`、`docs/operations/TESTING.md:61`、`docs/guides/CONTRIBUTING.md:64` 三处既有“兼容壳已于……删除”行（其所在节非历史节），故采用导入并集，行为不变。
- drift（`scripts/check-doc-drift.ts`，规则在 `scripts/doc-rules/*.json`）不覆盖 `docs/archived` 与 `docs/plans` 冻结区：全部 rule 的 `file` 均落在活跃面，冻结区正确性不设 guard。
- `docs/superpowers` 整目录退出 link 与 mermaid 扫描（冻结，见 `LINK_CHECK_EXCLUDED_REL` 与 `isExcludedDocsPath`）；`check:docs` 对其仅覆盖 `docs/superpowers/README.md` 的严格 lint（`CURRENT_LINT_GLOBS`，`md-lint:current`）。

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

历史闭环曾记录于 `docs/archived/archived-plans/badcase-feedback-loop.md（已归档，路径冻结）` ，当时配套了 `GET /v1/operations/badcases/:feedbackId/export` 与 `scripts/archived/export-badcase-to-eval.ts` 。

## 最小验证

文档、入口、结构规则改完后，你至少跑：

```bash
pnpm check:docs
pnpm check:structure
```

改动触及 truth source、架构事实或对应 smoke 用例时，再补相关最小测试。

## 统一文档结构标准

你 写新页面前先对齐本节模板，你 不复述权威页已有的事实。

### 页面模板

指南类页面用 目标 / 前置 / 步骤 / 验证 / 排错五段：

- 目标回答页面解决什么问题。
- 前置列出必读文档与仓库根前置命令。
- 步骤给出可执行动作序列。
- 验证给出闭环命令。
- 排错收敛已知失败与定位命令。

规范类页面用 目标 / 规则 / 执行方式 / 违反后果四段，实例见 `docs/guides/CODE_STYLE.md` 。

包级 README 用 职责 / 入口 / 行为 / 常见用法四段：

- 职责用一句话界定本包。
- 入口列出导出与命令。
- 行为给出与 `package.json` 一致的依赖与脚本表。
- 常见用法给出 2 到 3 个短配方，链到 `docs/` 对应层，不复制跨包结论。

架构页面在职责 / 入口 / 行为之外追加常见用法：

- 你 追加常见用法时只给链路与入口，不重述 `docs/reference/` 已有的端点、表、命令事实。
- 事实变化时，你 只改 `docs/reference/` 权威页，架构页跟随改链，不跟随抄数。

### 分目录上手要求

每个目录的入口文档与常见用法如下，你 接到对应任务时从入口进：

| 目录 | 入口文档 | 常见用法 |
| --- | --- | --- |
| `docs/reference` | `docs/reference/SYSTEM_TRUTH_SOURCES.md` | 你 先查裁决源，再读 `docs/reference/REPO_STRUCTURE.md` 、 `docs/reference/api-surface.md` |
| `docs/architecture` | `docs/architecture/ARCHITECTURE.md` | 你 先读总览，再按需进 `docs/architecture/BOUNDARIES.md` 、 `docs/architecture/OBSERVABILITY.md` 、 `docs/architecture/SERVICE-DISCOVERY.md` |
| `docs/guides` | `docs/guides/GETTING_STARTED.md` | 你 先走上手页，再读 `docs/guides/CODE_STYLE.md` 、 `docs/guides/DEV_WORKFLOW.md` 、 `docs/guides/CONTRIBUTING.md` |
| `docs/operations` | `docs/operations/TESTING.md` | 你 先读测试页，再按需进 `docs/operations/CI_CD.md` 、 `docs/operations/SECURITY.md` 、 `docs/operations/REGRESSION-COMMANDS.md` |
| `docs/todos` | `docs/todos/README.md` | 你 先确认执行面，再跟随其链接进入主线细则 |
| `evals` | `evals/retrieval/README.md` | 你 先读跑法与结果读法，再按需进 `evals/summary/README.md` |
| `packages/skills` | `packages/skills/README.md` | 你 先读 Skill 总表，再进 `packages/skills/workflow-with-trapmap/SKILL.md` |

你 新增目录时同步补齐该行，你 不留无入口目录。
