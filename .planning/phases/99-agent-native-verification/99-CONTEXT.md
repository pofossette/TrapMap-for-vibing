# Phase 99: Agent-Native Verification

## Background

验证 Phase 96-98 的所有实现：`trapmap load` 命令端到端正确性、`trapmap init` 命令功能、SKILL.md 重写一致性，以及 scripts/assets 在 markdown 输出中的正确消费。

## Scope

- 扩展 markdown-formatter 测试覆盖 scripts/assets edge cases
- 验证全量 CLI 测试通过
- 验证 TypeScript 编译通过
- 验证 SKILL.md 重写完整性

## Dependencies

- Phase 96 (trapmap load)
- Phase 97 (trapmap init)
- Phase 98 (SKILL.md rewrite)
