# Task 5 Report: web-panel 误提交构建产物清理

## Status

DONE. Commit: `6781644` (`chore(web-panel): remove committed build artifacts and ignore d.ts maps`).

## Changes

- `git rm` 删除 4 个被 git 跟踪的 tsc 构建产物：
  - `packages/web-panel/vite.config.d.ts`、`vite.config.d.ts.map`
  - `packages/web-panel/vitest.config.d.ts`、`vitest.config.d.ts.map`
- 根 `.gitignore` 在 "TS emit that leaks into src" 段落补充防复发规则：
  - `*.d.ts.map`（全局规则：d.ts 的 source map 不可能是源码）
  - `packages/*/*.d.ts`（包根层的 tsc config 构建产物；不做全局 `*.d.ts`，避免误伤已跟踪的源声明文件）
- `packages/web-panel/src/vite-env.d.ts` 保留（源文件，未改动、未被 ignore）。

## Verification

- `git status`：干净（nothing to commit, working tree clean）。
- `git check-ignore packages/web-panel/vite.config.d.ts`（及 `.map`、vitest 两个变体）：均输出该路径（exit 0），ignore 生效。
- `git check-ignore packages/web-panel/src/vite-env.d.ts`：无输出（exit 1），源声明文件未被误伤。
- `rtk pnpm --filter @trapmap/web-panel test --run`：`9 failed | 4 passed (13 files)` / `5 failed | 10 passed (15 tests)` —— **预先存在**：在干净 HEAD（stash 后）复跑得到完全一致的失败画像（`admin-panel-service-context.test.ts` 等 stubEnv/MODE 相关），与本次改动无关，未引入回归。
- `rtk pnpm --filter @trapmap/web-panel typecheck`：`TypeScript: No errors found`，删除 d.ts 不影响编译。

## 疑虑 / 备注

- **brief 路径不符**：任务指定的 `.superpowers/sdd/dead-code-and-architecture-order-cleanup/task-5-brief.md` 不存在；该目录整体缺失。现有 `.superpowers/sdd/task-5-brief.md` 是另一已完成的 AI provider 任务（非本任务）。本任务按用户消息中的完整需求 + `docs/todos/dead-code-and-architecture-order-cleanup.md`（第 162-177 行，含本任务的 git rm / .gitignore / commit message 约定）执行，两份来源一致。
- **commit 修正**：首次 commit 因 stash/pop 导致 `git rm` 的删除变为未暂存，只包含 .gitignore；本地未推送，已 `commit --amend` 补入 4 个删除，最终单 commit 完整（5 files changed, 4 insertions(+), 8 deletions(-)）。
- web-panel 既有 5 个测试失败（环境相关）建议另开问题跟进，不在本任务范围。
