# Task 9 Report: 循环依赖解除（store.ts 类型下沉 contracts）

Date: 2026-08-15
Branch: sdd/task-9 (worktree `Trap-Map-wt-task9`)

## 完成内容

### Step 1: 汇总共享 record 类型到 contracts

新建 `packages/contracts/src/domain/knowledge-records.ts`，从 `service-knowledge-read/src/store.ts` 原样下沉（纯 interface/type，非 zod，字段零改动）21 个类型：

- **knowledge 记录族**（store.ts 133-161 的 `KnowledgeRecord` 及其传递依赖）：`AdapterSyncState`、`KnowledgeKeywordPersistedState`、`KeywordAdapterSyncState`、`KnowledgeIndexStateRecord`、`KnowledgeReviewNoteRecord`、`AgentReviewRecord`、`KnowledgeReviewDecisionRecord`、`KnowledgeSubmissionRecord`、`KnowledgeLifecycleEventRecord`、`KnowledgeMetadataRecord`、`EmbeddingCacheRecord`、`MaintenanceMetaRecord`、`KnowledgeRevisionRecord`、`KnowledgeRecord`
- **skill 派生记录族**（write 包同样消费，不下沉则 write→read 依赖残留）：`StoredScriptActivationPolicy`、`ClientManifestReferenceRecord`、`ClientManifestAssetRecord`、`ClientManifestScriptRecord`、`ClientManifestRecord`、`DerivedSkillProfileRecord`、`DerivedSkillCapsuleRecord`

字段差异核对：`review-queue-projection.ts:90-115` 的 `KnowledgeRecord` 为 store.ts 版本的子集（缺 `embeddingCache`/`indexState`/`decayMeta`），统一为 store.ts 全量版本；governance 侧只读消费，结构兼容，无字段变化。`agentReview` 统一为 store.ts 的 `AgentReviewRecord`（与 contracts 已有 zod `AgentReviewResult` 结构兼容，governance 映射处可赋值）。

`contracts/src/index.ts` 新增 `export * from './domain/knowledge-records.js'`。

### Step 2: 三包改 import

- `service-knowledge-read/src/store.ts`：删除 21 个本地定义（-242 行），改为从 `@trapmap/contracts` import（本地仍引用的 7 个名字）+ 全量 `export type { ... } from '@trapmap/contracts'` 再导出（保持 store.js 对外 export surface 不变，read 包内 14 个文件 `from './store.js'` 消费方零改动）。
- `service-governance-review/src/review-queue-projection.ts`：删除本地重复定义的 8 个 interface（-110 行），改从 contracts 导入 `KnowledgeRecord`/`KnowledgeRevisionRecord`/`KnowledgeReviewNoteRecord`/`KnowledgeReviewDecisionRecord`。
- `service-knowledge-write` 4 处 `@trapmap/service-knowledge-read/store.js` 全部改为 `@trapmap/contracts`：`knowledge-record-mutations.ts`（5 个名字，并入已有 contracts import）、`artifact-derive/types.ts`（3 个）、`artifact-derive-from-payloads.ts`（2 个，并入已有 contracts import）、`artifact-derive/contextual-enrichment.ts`（1 个）。

### Step 3: 移除反向依赖声明

- `service-knowledge-read/package.json`：移除 devDependencies 中 `@trapmap/service-knowledge-write`（经核实 read 包 src 中零处 import write，纯残留声明）。
- `service-knowledge-write/package.json`：移除 dependencies 中 `@trapmap/service-knowledge-read`（brief 未列但"无 write→read 依赖"目标要求，pnpm-lock.yaml 同步更新，-6 行）。
- 验证：`rg "@trapmap/service-knowledge-read" packages/service-knowledge-write` 零命中；`rg "service-knowledge-read/store" packages` 零命中；lockfile 中 write→read、read→write 链接均已消失（仅 host-local/host-distributed 仍合法消费两服务）。

### 命名冲突处理（必要偏离）

contracts 的 `knowledge.ts` 已有 zod 推导别名 `KnowledgeSubmissionRecord`（`knowledgeSubmissionRecordSchema`，actorRef 形状，**零消费者、零内部使用**），与下沉的 store 版 `KnowledgeSubmissionRecord`（userId 形状）同名。两处 `export *` 触发 TS2308。解决：zod 别名改名为 `KnowledgeSubmissionRecordWithActorRef`（knowledge.ts 一行改动，schema 名未动，无任何消费方受影响）；store 版保留 `KnowledgeSubmissionRecord` 原名（brief 明确要求该名字下沉）。

## 验证摘要

| 验证 | 结果 |
|---|---|
| `rtk pnpm --filter @trapmap/contracts test` | 36 files / 905 tests 通过 |
| `rtk pnpm --filter @trapmap/service-knowledge-read test` | 19 files / 79 tests 通过 |
| `rtk pnpm --filter @trapmap/service-knowledge-write test` | 10 files / 94 tests 通过 |
| `rtk pnpm --filter @trapmap/service-governance-review test` | 9 files / 51 tests 通过 |
| `rtk pnpm typecheck` | 通过（No errors found） |
| `rtk pnpm exec fallow audit --base main` | 通过（0 issues in 13 changed files；7 项复杂度告警均为 inherited 预存项） |
| `rtk pnpm exec fallow list --boundaries` | write/governance 位于 service-standard zone（只依赖 backend-core/contracts/persistence-schema/lib），read 独立 zone，规则合规 |
| `rtk pnpm eval:smoke` | **无法运行**：本机无 Docker daemon（postgres 起不来，`run-postgres-coordinated.ts` 失败）。本次改动为纯类型搬移（零运行时行为变化），四包测试 + typecheck + fallow 均过，风险可控 |

## 疑虑

1. `eval:smoke` 因本机无 Docker 未能执行（环境限制，非代码问题）；如 CI 环境具备 PG service 建议补跑一次确认。
2. contracts `knowledge.ts` 的 `KnowledgeSubmissionRecordWithActorRef` 改名是 contracts 公开类型名的（微小）变化，零消费者；如需完全避免 API surface 变动，替代方案是 store 版在 contracts 内用别名名并经 store.ts 别名回原名，但会引入更丑的命名且违背 brief 对 `SubmissionRecord` 下沉的要求，故未采用。
3. `service-knowledge-read/README.md` 有一行旧描述称 write 用于"图 LLM 抽取 canonical label alignment（动态导入）"，经查 read 包已无对 write 的任何 import，该行已过期但不在本任务文件清单内，未动；建议后续文档任务清理。
4. 下沉文件命名为 `knowledge-records.ts`，内含 skill 派生记录族（语义上偏 skill 域）；brief 只指定创建该文件，且 write 4 处 import 必须全部脱离 read，故按 brief 单一新文件放置。若后续想更贴合领域可拆 `skill-artifact-records.ts`。
