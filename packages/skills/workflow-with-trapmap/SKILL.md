---
name: workflow-with-trapmap
description: 用于规划或实施 TrapMap 工作，并将 TrapMap 检索、陷阱约束、知识沉淀、反馈和维护流程作为硬性门控。需要具体命令签名时再加载 trapmap-cli-usage-guide。
---

# Workflow With TrapMap

## 控制路径

1. 优先解析 CLI 调用：首选 `trapmap`；在此 monorepo 中，当内置二进制不可用时使用 `pnpm --filter @trapmap/cli dev -- <command>`。
2. 在规划前，阅读 [references/retrieval.md](references/retrieval.md) 并使用任务种子检索匹配的技能。使用 `trapmap load "<seed>"` 获取预格式化的代理上下文，或使用 `trapmap search` 获取原始检索。仅使用 1-3 个最匹配的针对性结果作为规划控制。
3. 在实现前，使用风险/实现种子检索匹配的陷阱。在应用任何技能指导之前，将匹配的陷阱视为约束。
4. 编译陷阱优先计划：列出阻塞的陷阱，然后是直接缓解它们的技能/胶囊，最后是验证命令。将额外匹配项保留为引用，而不是全部加载到上下文中。如果计划涉及提交或编辑知识，查阅 [references/registration.md](references/registration.md) 获取精确的标志语法。
5. 如果任务范围发生重大变化，使用与新范围匹配的种子重新运行检索。
6. 如果 TrapMap 检索因认证、服务器或安装状态而受阻，记录确切的阻塞器。不要声称没有相关的陷阱或技能。
7. 解决问题后，仅在经验紧凑、已验证且不包含敏感信息时，才保存可复用的经验。使用 [references/accumulation.md](references/accumulation.md)。
8. 解决问题后，如果检索到的陷阱或技能不准确、过时或不匹配上下文，在继续之前使用 `trapmap feedback` 提交反馈。参见 [references/feedback.md](references/feedback.md)。
9. 使用可能老化的陷阱或技能前，通过 `trapmap decay-search` 或 `trapmap decay-stale` 检查其衰减状态。如果是 stale 或 expired，优先寻找更新的替代或报告反馈。参见 [references/maintenance.md](references/maintenance.md)。
10. 仅在需要具体命令签名、标志或命令族映射时，加载 `trapmap-cli-usage-guide`，不要把 CLI 索引与当前工作流引用一并整体读入。

## 引用地图

仅加载当前操作所需的引用：

- [references/retrieval.md](references/retrieval.md)：认证预检、精确搜索命令、陷阱优先选择规则。
- [references/registration.md](references/registration.md)：陷阱提交、技能导入和紧凑技能形状。
- [references/review.md](references/review.md)：审核队列、批准/拒绝标准、重复解决方案。
- [references/artifacts.md](references/artifacts.md)：导出、选择性激活、脚本策略。
- [references/accumulation.md](references/accumulation.md)：策略基因风格的 `MATCH/GOAL/STRATEGY/AVOID/VERIFY` 捕获。
- [references/feedback.md](references/feedback.md)：反馈提交、队列查看、批量处理。
- [references/maintenance.md](references/maintenance.md)：衰减生命周期、维护操作、代理使用指引。

## 护栏

- 使用 `trapmap --help` 或 `trapmap <command> --help` 验证不确定的命令；CLI 源码/帮助是权威来源。
- 代理对代理/工具解析时优先使用 JSON 输出。
- 不要将原始聊天日志、秘密、访问密钥、私有路径或庞大的文档粘贴到可复用知识中。
- 不要天真地组合许多技能。单一针对性技能加上显式 `AVOID` 警告通常比大量部分相关指导的捆绑更强大。
- 输出配置不确定时，使用 `trapmap output profile set --tool <tool>` 匹配代理环境；具体标志查 `trapmap-cli-usage-guide` 或 CLI 帮助。
