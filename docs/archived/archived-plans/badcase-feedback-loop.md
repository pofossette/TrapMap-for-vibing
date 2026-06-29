# Badcase 回流待办

## TODO

- [x] 定义 badcase 的统一分类：`recall-miss`、`ranking-error`、`summary-hallucination`、`governance-leak`、`stale-content`。
- [x] 在反馈提交中补齐 `queryId`、命中结果快照和期望结果。
- [x] 建立从 badcase 到 eval case 的标准转换流程。
- [x] 为回流后的 case 增加固定回归验证。

## 已落地部分（2026-06-09）

- [x] feedback 已支持 `trap` / `skill` 双类型条目
- [x] 当同一条目的未解决 feedback 达到阈值（当前 `10`）时，会进入 remediation 工作队列
- [x] remediation 队列会携带 trap 本体内容或 skill 派生内容快照
- [x] 达到阈值的条目会在当前检索链路中被硬过滤，避免继续命中坏内容
- [x] `skill edit` 会把 remediation 状态推进到 `in-remediation`
- [x] `trap review approve` / `skill review approve` 会把 remediation 状态推进到 `ready-to-reindex`
- [x] remediation complete 动作会批量 resolve 当前未解决 feedback

## 当前仍未闭合的部分

- [x] 检索响应已经统一暴露 `queryId`
- [x] feedback 记录已经保存 `queryId`、命中快照和正确预期
- [x] remediation complete 已复用 shared async follow-up 与索引刷新路径
- [x] badcase -> eval case 的自动转换脚本已落地：`scripts/export-badcase-to-eval.ts`

## 当前固定 taxonomy

- `recall-miss`
- `ranking-error`
- `summary-hallucination`
- `governance-leak`
- `stale-content`

旧值 `missing-recall`、`outdated-content` 仅作为兼容别名输入，持久化与导出统一回写 canonical taxonomy。

## 已闭环部分（2026-06-13）

- `GET /v1/operations/badcases/:feedbackId/export` 可返回 deterministic eval draft
- `scripts/export-badcase-to-eval.ts` 可把同一 draft 写入本地 JSON；script payload 只包含 deterministic `draft`，不携带 operator-only `debug`
- `evals/fixtures/badcases/example-retrieval-badcase-draft.json` 已作为首个导出样例入库
- 当前剩余人工边界只在“是否把 draft 正式提升为 eval fixture”的审核动作

## 什么是 badcase 回流

badcase 回流，最简单地说，就是把线上真实失败沉淀成以后必须通过的测试题。

完整闭环是：

`发现错误 -> 记录错误 -> 分析原因 -> 修复问题 -> 写成评测 case -> 后续持续回归`

## 为什么要做

如果没有回流，系统只是在重复犯错。

做了回流之后：

- 错误不会只停留在聊天记录里
- 修复不再依赖人记忆
- 每修一个问题，系统就多一道回归题

## 建议落点

建议先挂在现有反馈和评测体系上：

- 用户或评测发现 badcase
- 进入 feedback queue / remediation queue 或内部问题单
- 补齐 query、response、错误类型、正确预期
- 生成 `evals/retrieval` 或 `evals/summary` 的 case
- 修复后跑 smoke/core 验证

## 最小实现

第一版只做四件事：

1. 检索响应暴露 `queryId`
2. 反馈记录保存 `queryId` 和结果快照
3. 提供 badcase 转 eval case 的脚本
4. 把新 case 纳入评测集

## 结果目标

最终希望形成一个稳定机制：

- 线上 badcase 能被收集
- badcase 能被复现
- badcase 能进入测试集
- 同类问题不会反复回归
