# Task 8 Report: contracts 逻辑下沉（图算法 + parsing）

Date: 2026-08-15
Branch: sdd/task-8 (worktree `Trap-Map-wt-task8`)

## 完成内容

### Step 1: parsing 下沉到 @trapmap/lib

- 新增 `packages/lib/src/parsing.ts`：从 contracts 原样迁移 `parseMarkdownFrontmatter` / `parseSkillMarkdown` / `detectMediaType` / `isTextLikeMediaType`、`ParsedMarkdownFrontmatter` / `ParsedSkillMarkdown` / `FeedbackPrompt` 类型、MIME 覆写表（`MIME_OVERRIDES` / `BASENAME_MEDIA_TYPES`）与私有辅助（`isRecord` / `readString` / `readLabels` / `readFeedbackPrompts`）。零行为变更。
- 新增 `packages/lib/src/types/mime-types.d.ts`：随迁 mime-types 类型垫片（mime-types@3.0.2 无自带类型，垫片必需）。
- 新增 `packages/lib/src/parsing.test.ts`：原 contracts parsing.test.ts 原样迁移（13 用例），import 改 `./parsing.js`。
- `packages/lib/src/index.ts` 聚合导出 parsing 函数与类型；`packages/lib/package.json` 补 `gray-matter` / `mime-types` 依赖。
- 删除 `packages/contracts/src/domain/parsing.ts`、`parsing.test.ts`、`packages/contracts/src/types/mime-types.d.ts`（含空目录）；contracts index.ts 移除 `export * from './domain/parsing.js'`。
- 消费方改 import：
  - `packages/service-knowledge-write/src/artifact-derive/parse-content.ts`：`parseSkillMarkdown` 从 `@trapmap/contracts` → `@trapmap/lib`。
  - `packages/cli/src/lib/artifact-bundle.ts`：`detectMediaType` / `isTextLikeMediaType` / `parseSkillMarkdown` 从 `@trapmap/contracts` → `@trapmap/lib`。
  - **grep 补查发现额外消费方** `evals/fixtures/traps/index.ts`：原以相对路径 `../../../packages/contracts/src/domain/parsing.js` 直入 contracts src，改为 `@trapmap/lib`（tsx 运行时经 tsconfig paths 解析，vitest 经 alias）。

### Step 2: 图算法下沉到 service-knowledge-read

- 新增 `packages/service-knowledge-read/src/graph-query-core.ts`：迁移 4 个活函数 `buildGraphRuntimeSnapshot` / `expandSourcesOneHop` / `buildLocalExpansionView` / `calculateSourceRelationStrength`、`GraphRuntimeSnapshot` / `LocalExpansionParams` 类型、`buildGraphFromDocuments`（内部函数，不导出——fallow 会报 unused export）与私有辅助（`normalizeGraphLabel` / `edgeWeight` / `addToSetMap`）；graphology 三依赖的 import 随迁，原有 `// lib type gap:` 断言注释一并保留。
- `packages/contracts/src/domain/graph-query.ts` 改为纯 schema：仅保留 `GraphQueryBackend` 接口、`Graph` 接口、`GraphQueryNodeView` / `GraphQueryExpansionView` / `GraphQueryBackendHealth` / `GraphQueryRuntimeState` / `GraphNodeAttributes` / `GraphEdgeAttributes` 类型与 `GraphQueryBackendKind` / `GraphQueryMode` 枚举（后两个 attributes 类型随导出）。
- `packages/service-knowledge-read/src/graph-query.ts`：4 个函数改从 `./graph-query-core.js` 导入，contracts 仅保留类型导入；`MemoryGraphQueryBackend` 类逻辑不变。
- 测试迁移：contracts `graph-query.test.ts` → `packages/service-knowledge-read/src/graph-query-core.test.ts`（import 改 `./graph-query-core.js`，类型仍来自 contracts）。

### Step 3: contracts 依赖清理

- contracts package.json 移除 `gray-matter` / `mime-types` / `graphology` / `graphology-operators` / `graphology-shortest-path`，仅剩 `zod`（契约零运行时依赖）。
- lib package.json 补 `gray-matter` / `mime-types`；service-knowledge-read package.json 补 `graphology` / `graphology-operators` / `graphology-shortest-path`。
- `pnpm install` 更新锁文件（impoter 段三个包均正确落位；注意本地需 `CI=true pnpm install` 才能绕过 modules 目录 purge 的 TTY 确认）。

### 文档同步

- `docs/PACKAGES.md`：contracts 模块表移除 `parsing` 行，新增 `graph-query` 纯类型说明行（实现指向 graph-query-core.ts）。
- `packages/lib/src/object.ts` 注释：`isRecord` 引用位置从 contracts `domain/parsing.ts` 更新为 `@trapmap/lib` `parsing.ts`。

## 验证摘要

| 验证 | 结果 |
|---|---|
| `rtk pnpm --filter @trapmap/lib test --run` | 8 files / 55 tests 通过 |
| `rtk pnpm --filter @trapmap/service-knowledge-read test --run` | 20 files / 80 tests 通过（含 graph-query-core.test.ts） |
| `rtk pnpm --filter @trapmap/cli test --run` | 28 files / 537 tests 通过 |
| `rtk pnpm --filter @trapmap/contracts test --run` | 34 files / 891 tests 通过 |
| `rtk pnpm --filter @trapmap/service-knowledge-write test --run` | 10 files / 94 tests 通过（parse-content 消费方） |
| `rtk pnpm typecheck` | 通过（见疑虑 1） |
| `rtk pnpm eval:smoke` | **无法运行：本机无 Docker daemon**（`run-postgres-coordinated.ts` 连接 docker.sock 失败）→ **CI 需补跑** |
| `rtk pnpm exec fallow audit --base main` | 见疑虑 2（exit 1 全部为迁移动代码继承项；实际 CI 门禁 `pnpm check:fallow` exit 0） |
| `rtk pnpm exec fallow list --boundaries` | 无违规：lib → contracts；service-knowledge-read → backend-core/contracts/persistence-schema/lib；cli → client-core/contracts/lib 均符合 zone 规则 |
| `rtk pnpm check:docs` | PASS（doc-references WARN 非阻断，预存） |
| `rtk pnpm check:structure` | PASS |
| `rtk pnpm check:asserts` | PASS（0 裸断言；迁移的 `// lib type gap:` 注释保留） |
| `rtk pnpm test:file -- evals/agent-planning/runner.test.ts` | 8/8 通过（evals fixtures 消费方） |
| 契约导出完整性 `contracts/src/index.test.ts` | 162 用例通过 |

## 疑虑

1. **`rtk` 包装器与 pnpm/tsc 交互异常（环境问题）**：`rtk pnpm install` 静默吞掉输出且实际未执行（锁文件未更新）；`rtk pnpm typecheck` 打印 "TypeScript: No errors found" 但未产出 dist（tsc -b 未 emit）。改用直接 `pnpm install`（CI=true）与 `pnpm typecheck` 后正常。**注意：本 worktree 为全新检出、无 dist 目录，CLI 测试需先 `pnpm typecheck`（tsc -b 产出各包 dist）才能通过 vite 的 package-entry 解析**——vitest 的 `@trapmap/lib` alias 未拦截 bare specifier 的 node 解析，dist 缺失时 CLI 测试必失败（已在 HEAD 复现同一失败，与本次改动无关；主 worktree 因已有 dist 而正常）。
2. **`fallow audit --base main` exit 1**：全部 5 条 complexity 发现（`calculateSourceRelationStrength`、`readFeedbackPrompts`、`buildSummaryFromText`、`buildArtifactBundle`、`scanDir`）+ 3 组 duplication 均为**原样迁移/预存代码**——fallow 无法跨文件跟踪 move，新路径（graph-query-core.ts、lib/parsing.ts）视为新发现。其中 `calculateSourceRelationStrength` 与 `readFeedbackPrompts` 在 contracts 旧位置同样超阈值，`buildArtifactBundle` / `scanDir` 未动。报告自身输出 "audit gate excluded 5 inherited findings"。CI 实际门禁为全仓 `check:fallow`（`fallow --ci --fail-on-issues`），本 worktree 与主 worktree 均 exit 0。未对迁移代码添加 fallow-ignore 或重构（超出"行为不变"的迁移范围）。
3. **eval:smoke 本地无法验证**：无 Docker/Postgres，仅记录失败原因；语义面（retrieval/graph 相关）改动已由 service-knowledge-read 全量测试与 agent-planning runner 覆盖，smoke 需 CI 补跑。
4. 锁文件差异仅涉及三个包 importer 段的依赖声明调整，无新解析版本引入。
