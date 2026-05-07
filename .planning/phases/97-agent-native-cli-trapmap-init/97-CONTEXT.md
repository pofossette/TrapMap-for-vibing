# Phase 97: Agent-Native CLI — `trapmap init`

## Background

本阶段实现 `trapmap init` 命令，通过 `npx skills add` 将精简版 skill 安装到目标 agent 环境。支持自动检测已安装的 agent（`.claude/`, `.cursor/`, `.codex/`），交互式选择，以及手动指定 `--agent` 参数。

## Scope

- 创建 `packages/cli/src/commands/init.ts` — `trapmap init` 命令
- 修改 `packages/cli/src/index.ts` — 注册新命令

## Dependencies

- 独立于 Phase 96（可与 load 命令并行开发）
