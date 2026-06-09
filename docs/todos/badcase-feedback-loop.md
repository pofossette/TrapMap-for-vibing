# Badcase 回流待办

## TODO

- [ ] 定义 badcase 的统一分类：召回缺失、排序错误、摘要幻觉、治理泄漏、内容过时。
- [ ] 在反馈提交中补齐 `queryId`、命中结果快照和期望结果。
- [ ] 建立从 badcase 到 eval case 的标准转换流程。
- [ ] 为回流后的 case 增加固定回归验证。

## 已落地部分（2026-06-09）

- [x] feedback 已支持 `trap` / `skill` 双类型条目
- [x] 当同一条目的未解决 feedback 达到阈值（当前 `10`）时，会进入 remediation 工作队列
- [x] remediation 队列会携带 trap 本体内容或 skill 派生内容快照
- [x] 达到阈值的条目会在当前检索链路中被硬过滤，避免继续命中坏内容
- [x] `skill edit` 会把 remediation 状态推进到 `in-remediation`
- [x] `trap review approve` / `skill review approve` 会把 remediation 状态推进到 `ready-to-reindex`
- [x] remediation complete 动作会批量 resolve 当前未解决 feedback

## 当前仍未闭合的部分

- [ ] 检索响应还没有统一暴露 `queryId`
- [ ] feedback 记录还没有保存完整命中快照和正确预期
- [ ] remediation complete 目前主要 resolve active feedback，尚未真正复用索引摘除/重建运维动作
- [ ] badcase -> eval case 的自动转换脚本还没落地

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
