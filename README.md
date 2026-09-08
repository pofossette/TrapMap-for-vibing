# TrapMap

TrapMap 是面向 AI 编程工作流的知识与 Skill 治理基础设施。团队把踩坑经验与 Skill 工件提交到服务端做审核与结构化存储，客户端按问题检索相关结果并只激活当前任务需要的文件，避免把全部 Skill 注入上下文。

## 当前状态

暂无 active 主线（2026-09-08）：依赖升级与 AI SDK 统一已完成并归档（2026-09-08）。以下 3 项为 Queued，顺序与根 `plan.md` 一致。

- CLI 真实服务对接测试 Phase 5.3 归档：Queued
- Web Panel 功能补全与 UI 美化：Queued
- Gene 检索评测扩展 spec：Queued

进展与排队细节以根 `plan.md` 为准。

## 快速开始

本地搭建与首次运行见 [快速上手指南](docs/guides/GETTING_STARTED.md)。你在本仓库执行 agent 任务时先读 `AGENTS.md`。

## 文档地图

- [TrapMap 文档](docs/README.md)：五层导航与当前状态，文档总索引。
- [系统权威事实源](docs/reference/SYSTEM_TRUTH_SOURCES.md)：架构事实、入口文件与引用规则，事实冲突时以它为准。
- [TrapMap 架构](docs/architecture/ARCHITECTURE.md)：宿主、内核与服务边界的完整说明。
- [TrapMap 执行计划索引](plan.md)：当前主线状态与排队项。
- [TrapMap 智能体入口](AGENTS.md)：任务路由、最小验证与回写要求。

## 技术栈

| 维度 | 事实 |
|---|---|
| 运行时 | Node 24 |
| 语言 | TypeScript 6.0.3 |
| 数据库 | PostgreSQL |
| AI 接入 | Vercel AI SDK，唯一接入面为 `packages/ai-providers/src/adapters/aisdk.ts` |
