# Phase 84: Tech Debt Cleanup - Context

**Gathered:** 2026-05-05
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

清理项目中的技术债务，包括过期 worktree、knip 警告、重复导出等。

**Key Tasks:**
1. Worktree 清理 — 执行 `git worktree prune` 清理过期引用，释放 574 MB
2. 死代码清理 — 清理 knip 检测到的未使用 interface/type
3. 重复导出修复 — 修复 `boundary.ts` 中的重复导出

**Success Criteria:**
- `git worktree list` 只显示有效 worktree
- `pnpm knip` 无未使用导出警告
- 释放至少 500 MB 磁盘空间
- 所有测试通过

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use SPEC.md scope, success criteria, and codebase conventions to guide decisions.

**Key constraints from SPEC.md:**
- Out of Scope: TypeScript 配置变更, 依赖升级
- Risk: 确认无引用后再删除类型

</decisions>

<code_context>
## Existing Code Insights

**Files to modify:**
- `packages/server/src/lib/retrieval/graph-extract.ts` — unused types
- `packages/server/src/lib/retrieval/merge.ts` — unused Config interface
- `packages/server/src/lib/retrieval/recall/*.ts` — unused Config interfaces
- `packages/server/src/lib/retrieval/rerank.ts` — unused types
- `packages/server/src/lib/retrieval/types.ts` — unused types
- `packages/contracts/src/domain/boundary.ts` — duplicate exports

Codebase context will be gathered during plan-phase research.

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss phase skipped. Refer to SPEC.md for scope and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.

</deferred>
