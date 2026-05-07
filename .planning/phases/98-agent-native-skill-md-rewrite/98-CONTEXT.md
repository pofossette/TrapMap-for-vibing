# Phase 98: Agent-Native SKILL.md Rewrite

## Background

将现有 SKILL.md 从详细命令式教学重写为精简版，核心变更为：
- Control Path 简化为 3 步：`trapmap load --phase planning` -> `trapmap load --phase implementation` -> 验证
- 删除被 `trapmap load` 封装的 reference 文件（`retrieval.md`, `artifacts.md`）
- 保留不受影响的 reference 文件（`accumulation.md`, `registration.md`, `review.md`）

## Scope

- 重写 `packages/skills/trapmap-knowledge-workflow/SKILL.md`
- 删除 `packages/skills/trapmap-knowledge-workflow/references/retrieval.md`
- 删除 `packages/skills/trapmap-knowledge-workflow/references/artifacts.md`
- 同步更新 `.claude/skills/trapmap-knowledge-workflow/` 下的对应文件

## Dependencies

- Phase 96 (`trapmap load` 命令实现) — SKILL.md 需要引用已实现的命令
