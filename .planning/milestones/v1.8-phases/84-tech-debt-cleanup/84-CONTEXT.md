# Phase 84: Tech Debt Cleanup

## Context

项目累积的技术债务需要清理：

1. **过期 worktree** — `.claude/worktrees/` 有 16+ 个 agent worktree (约 574 MB)
2. **Knip 警告** — 未使用的导出和依赖
3. **死代码** — Phase 74 清理后仍有残留
4. **依赖更新** — 部分依赖版本过旧

## Problem

1. **磁盘空间浪费** — worktree 占用大量空间
2. **IDE 性能** — 过多文件影响索引
3. **代码质量** — 未使用的代码增加维护成本

## Goals

1. 清理过期 worktree
2. 解决 knip 报告的警告
3. 更新过旧依赖
4. 建立定期清理机制

## Tasks

### 1. Worktree 清理

```bash
# 检查当前 worktree
git worktree list

# 删除过期的 agent worktree
rm -rf .claude/worktrees/agent-*

# 或使用 git worktree remove
git worktree prune
```

### 2. Knip 警告修复

```bash
# 运行 knip
pnpm knip

# 修复未使用的导出
# - 移除未使用的函数
# - 移除未使用的类型
# - 更新 package.json exports
```

### 3. 依赖更新

```bash
# 检查过期依赖
pnpm outdated

# 更新非破坏性更新
pnpm update

# 手动更新破坏性更新 (评估后)
```

## Acceptance Criteria

- [ ] worktree 目录清理 (< 10 MB)
- [ ] knip 报告 0 warnings
- [ ] 依赖更新到最新稳定版
- [ ] `pnpm test` 通过
- [ ] `pnpm typecheck` 通过

## Dependencies

- Phase 86 (gitignore 清理后更易管理)

## Estimated Effort

Medium (3-4 hours)

## Risk

低 — 主要是清理工作，不涉及核心逻辑

## Prevention

建立定期清理机制：
- CI 检查 knip warnings
- worktree 自动过期策略
- Dependabot/Renovate 自动 PR
