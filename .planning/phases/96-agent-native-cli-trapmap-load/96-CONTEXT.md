# Phase 96: Agent-Native CLI — `trapmap load`

## Background

TrapMap 当前是一个 knowledge store + retrieval engine，但面向 agent 的消费流程是碎片化的：agent 需要自己运行多次 CLI 命令（`skill search-by-content` → `search --v2` → `activate`），手动解析 JSON，再决定加载哪些内容。

本阶段实现 `trapmap load` 命令，将 检索→筛选→激活→格式化 封装为单条命令，输出 agent 可直接消费的 markdown context block。

## Scope

- 创建 `packages/cli/src/lib/markdown-formatter.ts` — markdown 输出格式化
- 创建 `packages/cli/src/commands/load.ts` — `trapmap load` 命令
- 修改 `packages/cli/src/index.ts` — 注册新命令

## Dependencies

- Phase 86 (Gitignore Cleanup) — codebase clean state
- 复用现有 `apiRequest`, `requireSessionToken`, `loadCliState` 等基础设施
- 复用 `@trapmap/contracts` 中的 retrieval 和 activation schemas
