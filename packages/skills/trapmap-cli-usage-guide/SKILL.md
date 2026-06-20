---
name: trapmap-cli-usage-guide
description: TrapMap CLI 的紧凑使用指南。仅在需要确认命令签名、标志、命令族映射或输出配置时加载。
---

# TrapMap CLI Usage Guide

## 何时加载

1. 你已经决定要用 TrapMap CLI，但不确定具体子命令或标志。
2. 你需要快速确认认证、检索、导入、审核、反馈、衰减或管理命令的签名。
3. 你需要检查输出配置、JSON 模式或代理兼容设置。
4. 命令仍不确定时，立即运行 `trapmap --help` 或 `trapmap <command> --help`，不要猜测。

## 使用方式

- 将本 Skill 视为命令索引，而不是工作流策略。
- 先用更高层的 workflow skill 决定“为什么做、何时做、做多少”，再用本 Skill 确认“命令怎么敲”。
- 默认优先 `--json`，便于代理或工具消费。

## 引用地图

- [references/cli-index.md](references/cli-index.md)：按工作流阶段组织的 TrapMap CLI 紧凑索引。

## 护栏

- CLI 帮助文本和源码比本 Skill 更权威。
- 不要因为索引里存在某个命令，就跳过认证预检、陷阱检索、审核或反馈流程。
- 如果当前工作更偏向检索门控、知识沉淀或治理判断，优先加载 `workflow-with-trapmap`。
