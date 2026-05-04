# Phase 86: Gitignore Cleanup

## Context

当前项目存在以下问题：

1. **dist/ 目录被跟踪** — 编译产物纳入版本控制
2. **.claude/worktrees/ 累积** — agent worktree 未清理 (约 574 MB)
3. **packages/server 体积过大** — 61MB 主要来自 dist/

## Current State

```
packages/server/dist/          # 编译产物，应排除
packages/cli/dist/             # 编译产物，应排除
packages/contracts/dist/       # 编译产物，应排除
.claude/worktrees/             # agent 工作树，应排除或定期清理
```

## Problem

1. **仓库体积膨胀** — dist/ 占用大量空间
2. **合并冲突** — 编译产物的合并冲突无意义
3. **历史污染** — 每次构建产生大量提交

## Goals

1. 更新 .gitignore 排除编译产物
2. 清理历史中的 dist/ (可选，使用 git-filter-repo)
3. 建立 CI/CD 构建 convention

## Proposed Changes

### .gitignore 更新

```gitignore
# Build outputs
dist/
*.tsbuildinfo

# Agent worktrees (transient)
.claude/worktrees/

# Logs
logs/
*.log
```

### 清理步骤

1. 更新 .gitignore
2. `git rm -r --cached packages/*/dist/`
3. 提交变更
4. (可选) 使用 `git filter-repo` 清理历史

## Acceptance Criteria

- [ ] .gitignore 包含 dist/、worktrees/
- [ ] `git status` 不显示 dist/ 变更
- [ ] CI 构建流程验证 (build step 存在)
- [ ] 更新 CONTRIBUTING.md 说明构建约定

## Dependencies

- None

## Estimated Effort

Low (1-2 hours)

## Risk

低 — 仅影响版本控制，不影响代码功能

## Note

如果需要保留 dist/ 用于某些场景 (如 npm publish)，可在 CI 中处理：
```yaml
# .github/workflows/release.yml
- run: pnpm build
- run: pnpm publish
```
