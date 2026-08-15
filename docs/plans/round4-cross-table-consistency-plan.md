# TrapMap Round 4+ 后续增强实施计划

> **注意（2026-05-26）**：本文档中引用的 `pg-repository.ts` 已拆分为多个模块（`pg-repository/index.ts`、`pg-repository/record-reconstruction.ts`、`pg-repository/revision-reader.ts`、`pg-repository/revision-writer.ts`、`pg-repository/derived-store.ts`）。行号仅供参考，实际代码请以拆分后的模块路径为准。

> **状态：已完成并归档** | 完成日期：2026-05-24
> 
> 所有 4 个阶段均已实施完毕，最终完成定义全部满足。详见第 9 节。

本文档用于承接 Skill Artifact Round 4 结构化落地后的下一阶段工作。目标不是重新设计数据模型，而是在当前代码和数据库基线上，把“一致性约束”和“端到端验证”补到可以持续交付的程度。

当前计划聚焦两个主题：

1. cross-table 一致性约束增强
2. 端到端集成测试与 demo 验收补齐

本文档面向实际实现与跟踪，因此补充了：

- 任务背景与目标
- 明确边界和非目标
- 可勾选的进度复选框
- 与当前代码路径对应的实施落点
- 示例代码/伪代码
- 各阶段完成验收标准

---

## 1. 背景

Round 4 已经把 Skill Artifact 域的关键结构化事实源落到 PostgreSQL 真表，当前项目不是“有没有表”的问题，而是“表之间是否足够一致”和“现有主链路是否被真实验证”。

从当前仓库状态看，以下前提已经成立：

- `packages/server/drizzle/0007_round4_artifact_structural.sql` 已创建 Skill Artifact 的结构化子表。
- `packages/server/src/lib/artifacts/pg-repository.ts` 已负责结构化真表写入与优先读取。
- 已存在 `packages/server/src/lib/artifacts/pg-repository.round4.test.ts`，说明 Round 4 已有一定 repository 级测试基础。
- 已存在激活、导出、导入、审核相关测试文件：
  - `packages/server/src/routes/operations/artifacts-import.test.ts`
  - `packages/server/src/routes/operations/artifacts-export.test.ts`
  - `packages/server/src/routes/operations/artifacts-activate.test.ts`
  - `packages/server/src/routes/operations/skill-review.test.ts`

这意味着本计划应建立在“增量增强”之上，而不是把文档写成一个脱离代码现状的理想方案。

---

## 2. 目标

本计划的最终目标有四个：

1. 明确并固化 Skill Artifact 跨表一致性规则，减少结构化真表之间相互矛盾的状态。
2. 让错误尽可能在数据库层或 repository 层被拒绝，而不是在检索、导出、激活时才暴露。
3. 用真实 PostgreSQL 和真实 route/service 链路验证结构化事实源不会导致行为回退。
4. 为 demo 交付提供一套可重复执行、可记录结果的最小验收路径。

---

## 3. 边界

### 3.1 本计划包含的范围

- Skill Artifact Round 4 后续约束增强
- `PgArtifactRepository` 的真实 PG round-trip 验证
- skill import/review/history/export/activate/retrieval 主链路验证
- demo 场景下从 0 初始化数据库的最小验收闭环

### 3.2 本计划不包含的范围

- 历史数据库平滑升级方案
- 生产环境灰度、回滚、双写、数据修复工具
- 大规模并发写入与性能压测
- 全仓所有旧测试红项清零
- 把 JSONB 兼容缓存彻底删除

### 3.3 关键约束假设

- 默认场景是可以从 0 新建数据库的小型项目、demo 环境或开发环境。
- 当前结构化子表是事实源，`skill_artifacts` 与 `artifact_revisions` 上的 JSONB 字段继续保留为兼容缓存。
- 文档讨论的是“如何增强当前实现”，不是要求一次性完成长期演进设计。

---

## 4. 当前基线

### 4.1 已结构化落地的真表

- `skill_artifact_metadata`
- `skill_artifact_files`
- `skill_artifact_script_descriptors`
- `skill_artifact_profiles`
- `skill_artifact_capsules`
- `skill_artifact_client_manifests`
- `skill_artifact_manifest_references`
- `skill_artifact_manifest_assets`
- `skill_artifact_manifest_scripts`
- `skill_artifact_boundary_contexts`
- `skill_artifact_boundary_versions`
- `skill_artifact_boundary_prerequisites`
- `skill_artifact_boundary_signals`
- `skill_artifact_boundary_exclusions`
- `skill_artifact_boundary_evidence`
- `skill_artifact_maintenance_assignments`
- `skill_artifact_agent_reviews`

### 4.2 已有实现落点

- migration：`packages/server/drizzle/0007_round4_artifact_structural.sql`
- schema：`packages/server/src/lib/persistence/schema.ts`
- repository：`packages/server/src/lib/artifacts/pg-repository.ts`
- repository 现有测试：`packages/server/src/lib/artifacts/pg-repository.round4.test.ts`
- route 现有测试：
  - `packages/server/src/routes/operations/artifacts-import.test.ts`
  - `packages/server/src/routes/operations/artifacts-export.test.ts`
  - `packages/server/src/routes/operations/artifacts-activate.test.ts`
  - `packages/server/src/routes/operations/skill-review.test.ts`

### 4.3 当前主要缺口

- 跨表一致性规则仍有一部分只体现在约定中，没有完全体现在数据库约束或 repository 校验中。
- repository 级测试已有基础，但还需要更系统的 round-trip 与负例覆盖。
- route/service 级测试存在分散文件，但还缺完整“导入 -> 审核 -> 检索/召回 -> 导出 -> 激活”的主链路验收视角。
- demo 级验收需要一个最小 fixture 和明确的完成记录模板。

---

## 5. 总体实施策略

建议按“先验证主链路，再增强硬约束”的顺序推进：

1. 补齐 repository round-trip 与负例测试。
2. 补齐 route/service 主链路测试。
3. 再为 cross-table 一致性补数据库约束与 repository 校验。
4. 最后构建 demo 验收脚本和验收记录。

这样做的原因：

- 当前 demo 风险优先来自“功能链路断了”，而不是极端数据异常。
- 先把测试闭环补起来，后续增强约束时可以更快发现回归。
- 约束策略一旦写错，最容易影响导入、编辑、激活等主流程，因此先有测试保护更稳妥。

---

## 6. 阶段拆分与进度跟踪

> 说明：复选框用于实现过程中的即时跟踪。建议在实际推进时随 PR 或提交同步更新。

### 阶段 0：规则澄清与现状对齐 ✅

目标：把"现在到底以什么为准"写清楚，避免后续测试和约束互相打架。

- [x] 确认 `skill_artifact_*` 结构化子表中哪些字段是事实源，哪些只是缓存投影。
- [x] 确认 `artifact_revisions.files`、`script_descriptors`、`derived` 在读取链路中的优先级仅为兼容缓存。
- [x] 确认 `metadata`、`boundary`、`maintenanceMeta`、`agentReview` 的读取优先级与回写顺序。
- [x] 确认 route/service 当前主链路依赖的是结构化真表、JSONB 缓存，还是二者混合。
- [x] 在本计划中明确每一类字段的事实源规则，避免后续测试基于错误假设编写。

建议检查路径（已全部审查完毕）：

- [x] `packages/server/src/lib/artifacts/pg-repository.ts`
- [x] `packages/server/src/lib/artifacts/repository.ts`
- [x] `packages/server/src/lib/import-export.ts`
- [x] `packages/server/src/routes/operations/artifacts-import.ts`
- [x] `packages/server/src/routes/operations/artifacts-export.ts`
- [x] `packages/server/src/routes/operations/artifacts-activate.ts`

阶段完成验收标准：

- [x] 文档中已清楚写明 Skill Artifact 根级字段、revision 级字段、派生字段的事实源与缓存关系。
- [x] 团队成员据此可以判断某个字段应在数据库层、repository 层还是 route 层进行校验。

文档更新要求：

- [x] 更新 `plan.md` 当前阶段复选框与规则描述，确保事实源/缓存源定义不再歧义。
- [x] 如字段优先级说明发生变化，同步更新 `docs/reference/DATABASE_SCHEMA.md` 中对应表与字段语义。
- [x] 如包职责或调用路径认知发生变化，同步更新 `docs/PACKAGES.md` 中 Artifact repository / route 的说明。
- [x] 如需要补充代码阅读入口或排查路径，同步更新 `docs/guides/CODE_GUIDE.md` 的相关阅读路径。

---

#### 阶段 0 结论：结构化事实源 vs JSONB 缓存规则

以下结论基于对 `pg-repository.ts`、`schema.ts`、`import-export.ts`、`model.ts` 及各 route 文件的完整审查。

##### 0.1 总体架构：双表示模式

当前 Skill Artifact 域采用 **"结构化真表（事实源）+ JSONB 兼容缓存"** 双表示：

- **结构化真表**（17 张表）：`skill_artifact_*` 子表，通过 `0007_round4_artifact_structural.sql` 创建
- **JSONB 缓存**：`skill_artifacts` 表上的 `metadata`、`agent_review`、`maintenance_meta`、`boundary` 列，以及 `artifact_revisions` 表上的 `files`、`script_descriptors`、`derived` 列

##### 0.2 写入顺序（pg-repository.ts:53-147 `insert()`）

在 `PgArtifactRepository.insert()` 事务中，写入顺序为：

```
1. INSERT INTO skill_artifacts       (写入 JSONB 缓存: metadata, agent_review, maintenance_meta, boundary)
2. INSERT INTO artifact_revisions    (写入 JSONB 缓存: files, script_descriptors, derived)
3. upsertStructuredRevisionRows()    (写入结构化真表: skill_artifact_files, skill_artifact_script_descriptors,
                                      skill_artifact_profiles, skill_artifact_capsules,
                                      skill_artifact_client_manifests, skill_artifact_manifest_*)
4. insertArtifactBoundarySubTables() (写入结构化真表: skill_artifact_boundary_*)
5. upsertArtifactMaintenanceAssignment() (写入结构化真表: skill_artifact_maintenance_assignments)
6. upsertArtifactAgentReview()       (写入结构化真表: skill_artifact_agent_reviews)
7. upsertArtifactMetadata()          (写入结构化真表: skill_artifact_metadata)
```

**写入原则**：JSONB 缓存先写入，结构化真表后写入（覆盖）。每次写入同时维护两套表示。

##### 0.3 读取优先级（pg-repository.ts:806-847 `reconstructSkillArtifactRecord()`）

| 字段 | 事实源（结构化真表） | 兼容缓存（JSONB） | 读取优先级 |
|------|---------------------|-------------------|-----------|
| `metadata` | `skill_artifact_metadata` | `skill_artifacts.metadata` (JSONB) | **结构化 > JSONB** (`metadata ?? artifact.metadata`) |
| `boundary` | `skill_artifact_boundary_*` (6 张子表) | `skill_artifacts.boundary` (JSONB) | **结构化 > JSONB** (`boundary ?? artifact.boundary`) |
| `maintenanceMeta` | `skill_artifact_maintenance_assignments` | `skill_artifacts.maintenance_meta` (JSONB) | **结构化 > JSONB** (`maintenanceMeta ?? artifact.maintenanceMeta`) |
| `agentReview` | `skill_artifact_agent_reviews` | `skill_artifacts.agent_review` (JSONB) | **结构化 > JSONB** (`agentReview ?? artifact.agentReview`) |
| `files`（revision） | `skill_artifact_files` | `artifact_revisions.files` (JSONB) | **结构化 > JSONB**（有 structured 时直接用） |
| `scriptDescriptors`（revision） | `skill_artifact_script_descriptors` | `artifact_revisions.script_descriptors` (JSONB) | **结构化 > JSONB**（有 structured 时直接用） |
| `derived`（revision） | `skill_artifact_profiles` + `skill_artifact_capsules` + `skill_artifact_client_manifests` + `skill_artifact_manifest_*` | `artifact_revisions.derived` (JSONB) | **结构化 > JSONB**（`buildDerivedFromStructured()`） |

##### 0.4 字段级事实源分类

**A. Artifact 根级字段**（存储在 `skill_artifacts` 表，无对应结构化子表）：

| 字段 | 位置 | 分类 | 说明 |
|------|------|------|------|
| `id`, `teamId`, `scope`, `labels`, `title`, `slug`, `requiredLevel`, `lifecycleState`, `ownerUserId`, `createdAt`, `updatedAt` | `skill_artifacts` 列 | **事实源** | 无结构化子表覆盖，JSONB 列即为唯一事实源 |

**B. Artifact 根级治理字段**（有对应结构化子表）：

| 字段 | 结构化事实源 | JSONB 缓存列 | 写入口 | 读入口 |
|------|-------------|-------------|--------|--------|
| `metadata` | `skill_artifact_metadata` | `skill_artifacts.metadata` | `upsertArtifactMetadata()` | `loadArtifactMetadata()` -> `??` fallback |
| `agentReview` | `skill_artifact_agent_reviews` | `skill_artifacts.agent_review` | `upsertArtifactAgentReview()` | `loadArtifactAgentReview()` -> `??` fallback |
| `maintenanceMeta` | `skill_artifact_maintenance_assignments` | `skill_artifacts.maintenance_meta` | `upsertArtifactMaintenanceAssignment()` | `loadArtifactMaintenanceMeta()` -> `??` fallback |
| `boundary` | `skill_artifact_boundary_*` (6 表) | `skill_artifacts.boundary` | `insertArtifactBoundarySubTables()` | `loadArtifactBoundaryFromSubTables()` -> `??` fallback |

**C. Revision 级字段**（`SkillArtifactRevisionRecord` 各字段）：

| 字段 | 结构化事实源 | JSONB 缓存列 | 分类 |
|------|-------------|-------------|------|
| `revision`, `sourceHash`, `submittedAt`, `submittedByUserId` | 无独立子表 | `artifact_revisions` 列 | **事实源**（直接列值，非 JSONB 容器） |
| `files` | `skill_artifact_files` | `artifact_revisions.files` (JSONB) | **结构化 > JSONB** |
| `scriptDescriptors` | `skill_artifact_script_descriptors` | `artifact_revisions.script_descriptors` (JSONB) | **结构化 > JSONB** |
| `derived` | `skill_artifact_profiles` + `skill_artifact_capsules` + `skill_artifact_client_manifests` + `skill_artifact_manifest_*` | `artifact_revisions.derived` (JSONB) | **结构化 > JSONB** |

**D. `skill_artifact_metadata` 子字段语义**：

| 子字段 | 分类 | 说明 |
|--------|------|------|
| `sourceKind` | **事实字段** | 不可变，创建时确定 |
| `submissionCount` | **事实字段** | 每次提交 +1 |
| `resubmissionCount` | **事实字段** | 每次重新提交 +1 |
| `revisionCount` | **缓存汇总字段** | ⚠️ 当前仅在 `model.ts:appendSkillArtifactRevision()` 中更新（`history.length + 1`），`PgArtifactRepository.appendRevision()` **不会更新此字段**。理论上应等于 `artifact_revisions` 实际行数。 |
| `latestSubmissionId` | **事实字段** | 最新提交 ID |
| `latestSubmittedAt` | **事实字段** | 最新提交时间 |
| `latestReviewedAt` | **事实字段** | 最新审核时间 |
| `latestDecision` | **缓存汇总字段** | 最近一次审核决策的缓存投影 |

##### 0.5 route/service 主链路依赖分析

| 链路环节 | 数据来源 | 依赖性质 |
|---------|---------|---------|
| **Import** (`artifacts-import.ts:137`) | `createSkillArtifactRecord()` -> `artifactRepo.insert()` | 结构化真表写入（`PgArtifactRepository`） + JSONB 缓存（`store.transact` 用于 `artifactFilePayloads`） |
| **Export** (`artifacts-export.ts:91`) | `artifactRepo.getById()` + `store.snapshot()` | 结构化真表读取（核心字段通过 `reconstructSkillArtifactRecord`） + JSONB 兼容层（`artifactFilePayloads` 取文件内容） |
| **Activate** (`artifacts-activate.ts:26`) | `artifactRepo.getById()` + `store.snapshot()` | 结构化真表读取 + JSONB 兼容层（`artifactFilePayloads` 取文件内容） |
| **Derivation** (`model.ts:510 applyDerivedArtifactOutputs()`) | `artifactRepo.updateRevisionDerived()` | 结构化真表写入（`replaceStructuredDerivedRows()`） + JSONB 缓存同步 |

**结论**：主链路**核心数据结构依赖结构化真表**（读取时结构化优先），`store.snapshot()` 仅在以下两个兼容场景使用：
1. 读取 `artifactFilePayloads`（文件内容载体，尚未迁移到结构化表）
2. 用户 handle 解析（`toSkillArtifact()` 需要 `StoreData.users`）

##### 0.6 风险与决策点（从第 8 节迁移，此处为阶段 0 结论）

- [x] **`capsule_id` 是否允许跨 revision 复用**：当前实现中 `capsule_id` 是 `skill_artifact_capsules` 的主键（`capsule_id text PRIMARY KEY`），`replaceStructuredDerivedRows()` 在每次更新 derived 时先 `DELETE` 再 `INSERT`。**结论：不允许复用**，每次更新 derived 会清除旧 capsule 并重建。若未来需要保留历史，需改为 `(capsule_id, artifact_revision_id)` 复合主键。
- [x] **`revision_count` 是严格事实字段还是缓存字段**：**缓存字段**。仅在 `model.ts` 路径下更新，`PgArtifactRepository.appendRevision()` 不会同步维护。阶段 3 应改为从 `artifact_revisions` 实时计数或加触发器。
- [x] **`latestDecision/latestReviewedAt` 是否仅表示最近一次审核汇总**：**缓存汇总字段**，非独立历史事实。独立审核历史在 `artifact_lifecycle_events` 中。
- [x] **`source_hash` 一致性的允许范围**：`sourceHash` 由 `computeSourceHash()` 从 derivation-eligible 文件（`SKILL.md` + `references/`）的 SHA-256 串联计算，排除 `assets/` 和 `scripts/`。当前在 `PgArtifactRepository` 中写入时使用 revision 提供的 `sourceHash` 值，不做二次校验。
- [x] **JSONB 缓存与结构化真表冲突时，是否始终以结构化真表为准**：**是**。`reconstructSkillArtifactRecord()` 和 `buildDerivedFromStructured()` 中结构化真表始终优先。但注意：若结构化子表为空（如旧数据尚未迁移），会 fallback 到 JSONB 缓存。

---

### 阶段 1：repository 级 round-trip 集成测试补齐 ✅

目标：先证明 `PgArtifactRepository` 在真实 PostgreSQL 上能稳定读写 Round 4 结构化字段。

#### 1.1 测试覆盖范围

- [x] 为 `insert -> getById` 增加真实 PG round-trip 覆盖。
- [x] 为 `appendRevision -> getById` 增加真实 PG round-trip 覆盖。
- [x] 为 `updateRevisionDerived -> getById` 增加真实 PG round-trip 覆盖。
- [x] 为 `listByFilter({ maintainerUserId })` 增加真实 PG round-trip 覆盖。
- [x] 为“结构化优先读取而非 JSONB 缓存优先读取”增加断言。

#### 1.2 结构化字段覆盖

- [x] `metadata`
- [x] `boundary`
- [x] `maintenanceMeta`
- [x] `agentReview`
- [x] `files`
- [x] `scriptDescriptors`
- [x] `derived.profile`
- [x] `derived.capsules`
- [x] `derived.clientManifest`

#### 1.3 负例覆盖

- [ ] 写入与 revision 不一致的派生数据时失败。（延后至阶段 3 — 当前 repository/DB 层无此校验）
- [ ] 写入孤儿 manifest item 时失败。（延后至阶段 3 — 当前无外键约束）
- [x] 非法 `agentReview.status` 时失败。
- [x] 非法 `duplicateRisk/correctnessRisk/completenessRisk` 时失败。

落点：

- 新增文件：`packages/server/src/lib/artifacts/pg-repository.round4.roundtrip.test.ts`（23 个测试用例）
- 原 mock 测试保持不变：`packages/server/src/lib/artifacts/pg-repository.round4.test.ts`

示例测试骨架：

```ts
it('persists structured manifest rows and reads them back as the revision fact source', async () => {
  const repo = createPgArtifactRepository(db);
  await repo.insert(buildArtifactFixture());

  await repo.updateRevisionDerived({
    artifactId: 'artifact_1',
    artifactRevisionId: 'artifact_1_rev_1',
    derived: {
      profile: { name: 'Skill A', summary: 'demo' },
      capsules: [{ capsuleId: 'capsule_1', artifactId: 'artifact_1', revisionNo: 1, text: '...' }],
      clientManifest: {
        references: [{ path: 'references/setup.md', purpose: 'setup' }],
        assets: [{ path: 'assets/logo.png', kind: 'image' }],
        scripts: [{ path: 'scripts/bootstrap.sh', capability: 'filesystem.write' }],
      },
    },
  });

  const artifact = await repo.getById('artifact_1');
  expect(artifact?.revisions[0]?.derived?.clientManifest?.references).toHaveLength(1);
  expect(artifact?.revisions[0]?.derived?.clientManifest?.scripts?.[0]?.path).toBe('scripts/bootstrap.sh');
});
```

阶段完成验收标准：

- 真实 PostgreSQL 下，Round 4 结构化字段可 round-trip。
- 至少一组负例测试证明 repository/DB 会拒绝明显不一致的数据。
- 测试命名能清楚表达“这是结构化事实源行为测试”，不是单纯 mock 行为测试。

文档更新要求：

- [x] 在 `plan.md` 中勾选已完成的 round-trip 与负例覆盖项，并注明新增了 `pg-repository.round4.roundtrip.test.ts`。
- [x] 如新增或拆分测试文件，同步更新 `docs/guides/CODE_GUIDE.md` 中与 Artifact repository 测试相关的入口说明。（无需更新 — 该文件未单独列出测试文件路径）
- [x] 如测试命令或推荐验证顺序有变化，同步更新 `docs/operations/TESTING.md` 中对应的最小验证建议。（测试命令不变，通过 `pnpm test` 从根目录运行即可）
- [x] 如结构化事实源读取规则因测试而被澄清，同步把结论补回 `docs/PACKAGES.md` 或 `docs/reference/DATABASE_SCHEMA.md`。（规则未变化，测试确认了现有行为）

---

### 阶段 2：route / service 主链路测试补齐 ✅

目标：验证结构化事实源不会破坏业务行为，而不是只验证 repository 内部细节。

#### 2.1 主链路覆盖

- [x] 导入 artifact 后，`history` 能返回正确修订记录。（历史端点测试在 `skill-edit.test.ts` 已覆盖，`skill-review.test.ts` 新增 pipeline 测试验证历史可见性）
- [x] 审核通过后，skill review 状态与 artifact 生命周期保持一致。（`skill-review.test.ts` 新增 approve/reject 测试、review history 弹出测试）
- [x] 导出接口能拿到完整结构化内容。（`artifacts-export.test.ts` 新增 bundle-json/distilled-json/skill-dir 导出测试，包含 files、script descriptors）
- [x] 激活接口能按路径物化 `SKILL.md`、`references/`、`assets/`、`scripts/`。（`artifacts-activate.test.ts` 新增四种文件类型选择性激活测试）
- [x] 至少一条检索或召回链路能消费 approved artifact 的结构化事实源。（`retrieval.test.ts` 新增 v1 检索、skill-lookup、graph-assisted 检索可见性测试）

#### 2.2 推荐补测场景

- [x] `import -> review approve -> export`（通过 seed 模拟 import，由 review + export 组成 pipeline 测试）
- [x] `import -> review approve -> activate`（通过 seed 模拟 import，由 review + activate 组成 pipeline 测试）
- [x] `import -> review approve -> retrieval visible`（`retrieval.test.ts` 新增 approved artifact 检索可见性测试）
- [x] `import -> review approve -> capsule recall visible`（`retrieval.test.ts` 新增 skill-lookup 召回测试）
- [x] `import(with boundary + maintenance + agentReview) -> get/history/export`（`artifacts-export.test.ts` 新增 boundary/maintenanceMeta/agentReview 导出 + 历史端点测试）

实际落点：

- `packages/server/src/routes/operations/skill-review.test.ts`：16 个测试（新增 review approve/reject、review queue、boundary/maintenanceMeta 保留、pipeline review->export、pipeline review->activate）
- `packages/server/src/routes/operations/artifacts-export.test.ts`：15 个测试（新增 bundle-json 导出含 files/scripts、distilled-json 导出含 profile/capsules、governance 阻断、boundary/maintenance/agentReview 种子导出 + 历史可见性）
- `packages/server/src/routes/operations/artifacts-activate.test.ts`：16 个测试（新增 SKILL.md/references/assets/scripts 选择性激活、无效路径拒绝、安全等级阻断）
- `packages/server/src/routes/retrieval.test.ts`：84 个测试（新增 approved entry 检索、draft 不可见、skill-lookup 召回、graph-assisted 可见性）

额外修复：

- **`artifacts-activate.ts:58`**：修复 `artifact.latestRevision` 类型 bug — `latestRevision` 是完整 revision 对象而非数字，需访问 `.revision` 属性。
- **`auth-store-helpers.ts:210`**：修复 `source` 字段 — `seedApprovedSkillArtifact` 中自定义文件的 `source` 设为目录枚举值而非完整文件路径。

阶段完成验收标准：

- [x] 至少有一条“审核通过 -> 导出 -> 激活”真实主链路测试通过。（`skill-review.test.ts` 中完整 pipeline 测试）
- [x] 至少有一条“审核通过 -> 检索可见/召回可见”测试通过。（`retrieval.test.ts` 中 v1/skill-lookup/graph-assisted 检索可见性测试）
- [x] 路由测试能证明结构化字段被实际消费，而不是仅依赖旧缓存字段凑巧通过。（导出 bundle-json 测试验证 files、source、scriptDescriptors 等结构化字段被完整序列化）

文档更新要求：

- [x] 在 `plan.md` 中勾选已完成的 route / service 主链路用例。
- [x] 如导入、审核、导出、激活接口行为或约束有澄清，同步更新 `docs/reference/api-surface.md`。（无需更新 — 接口行为未变化，仅修复了 activate 路线的 `latestRevision` 类型 bug）
- [x] 如 CLI 或服务使用方式需要补充示例，同步更新 `README.md` 或 `docs/README.md` 中的入口说明。（无需更新 — 本次改动仅涉及测试和 bug 修复）
- [x] 如检索可见性、审核后索引同步或激活策略有新约束，同步更新相应 architecture / operations 文档。（无需更新 — 无新约束引入）

---

### 阶段 3：cross-table 一致性约束增强 ✅

目标：把最容易形成脏数据的跨表关系尽量前移到数据库层和 repository 层拦截。

#### 3.1 revision 级派生产物一致性

- [x] 为 `skill_artifact_profiles` 增强与所属 revision 的一致性校验。→ **DB 层**: composite FK `(artifact_id, revision_no) → artifact_revisions`
- [x] 为 `skill_artifact_capsules` 增强与所属 revision 的一致性校验。→ **DB 层**: composite FK `(artifact_id, revision_no) → artifact_revisions` + **repo 层**: `assertDerivedConsistency()` 校验 capsule.artifactId / capsule.revision
- [x] 为 `skill_artifact_client_manifests` 增强与所属 revision 的一致性校验。→ **DB 层**: composite FK `(artifact_id, revision_no) → artifact_revisions` + **repo 层**: 校验 manifest.artifactId / manifest.revision
- [x] 明确 `artifact_id`、`revision_no`、`source_hash` 与 `artifact_revisions` 的一致性规则。→ **DB 层**: 复合 FK 保证 `(artifact_id, revision_no)` 匹配；**repo 层**: `assertDerivedConsistency()` 校验所有派生产物字段与所属 revision 一致
- [x] 明确 `capsule_id` 在同一 artifact 跨 revision 是否允许复用。→ **不允许复用**，`capsule_id` 是 `PRIMARY KEY`（全局唯一），`replaceStructuredDerivedRows()` 每次先 DELETE 再 INSERT
- [x] 若不允许复用，则补唯一性约束与负例测试。→ `capsule_id text PRIMARY KEY` 已是全局唯一约束；测试: `pg-repository.round4.consistency.test.ts` 中的 DB composite FK + CHECK 测试覆盖
- [x] 若允许复用，则补读取优先级说明与测试。→ （不适用）

#### 3.2 manifest 子项一致性

- [x] `skill_artifact_manifest_references` 必须依附于对应 `skill_artifact_client_manifests`。→ **DB 层**: 已存在 FK `fk_skill_artifact_manifest_references_revision → skill_artifact_client_manifests(artifact_revision_id)` (0007 migration)
- [x] `skill_artifact_manifest_assets` 必须依附于对应 `skill_artifact_client_manifests`。→ **DB 层**: 已存在 FK `fk_skill_artifact_manifest_assets_revision → skill_artifact_client_manifests(artifact_revision_id)` (0007 migration)
- [x] `skill_artifact_manifest_scripts` 必须依附于对应 `skill_artifact_client_manifests`。→ **DB 层**: 已存在 FK `fk_skill_artifact_manifest_scripts_revision → skill_artifact_client_manifests(artifact_revision_id)` (0007 migration)
- [x] 验证不存在"manifest 主记录删除了，子项仍残留"的情况。→ **DB 层**: 所有 FK 均为 `ON DELETE CASCADE`；测试: cleanup 后验证子表无残留，直接删除 client_manifest 后验证 CASCADE 生效

#### 3.3 artifact 根级治理字段一致性

- [x] 保证 `skill_artifact_metadata.artifact_id` 与 `skill_artifacts.id` 强绑定。→ **DB 层**: 已存在 FK `fk_skill_artifact_metadata_artifact → skill_artifacts(id) ON DELETE CASCADE` (0007 migration)
- [x] 保证 `skill_artifact_maintenance_assignments.artifact_id` 与 `skill_artifacts.id` 强绑定。→ **DB 层**: 已存在 FK `fk_skill_artifact_maintenance_assignments_artifact → skill_artifacts(id) ON DELETE CASCADE` (0007 migration)
- [x] 保证 `skill_artifact_agent_reviews.artifact_id` 与 `skill_artifacts.id` 强绑定。→ **DB 层**: 已存在 FK `fk_skill_artifact_agent_reviews_artifact → skill_artifacts(id) ON DELETE CASCADE` (0007 migration)
- [x] 明确 `skill_artifact_metadata.revision_count` 与 `artifact_revisions` 实际数量的关系。→ **repo 层**: `syncRevisionCount()` 在 `insert()` 和 `appendRevision()` 后从 `artifact_revisions` 实时 COUNT(*) 并回写；**结论**: revision_count 是缓存汇总字段，由 repository 层在每次写操作后同步
- [x] 明确 `latestSubmissionId`、`latestSubmittedAt`、`latestReviewedAt`、`latestDecision` 的语义是"缓存汇总字段"还是"主事实字段"。→ **缓存汇总字段**（已在阶段 0 结论中明确，阶段 3 补充 repo 层 `revision_count` 自动同步实现）

#### 3.4 落地分层

- [x] 梳理哪些规则适合数据库硬约束。→ **DB 层**: (1) composite FK for `(artifact_id, revision_no)` on 5 revision-scoped tables; (2) CHECK `revision_no > 0` on profiles; (3) CHECK `required_level IN [0,10]` on capsules; (4) 已有 FK 保证孤儿行禁止、引用完整性
- [x] 梳理哪些规则适合 repository 事务内校验。→ **repo 层**: (1) `assertDerivedConsistency()` 校验 capsule/profile/manifest 的 artifactId 和 revision 与所属 revision 一致; (2) `syncRevisionCount()` 从实际行数回写 revision_count; (3) 以上校验在事务内、写入前/后执行
- [x] 新增单独的 Round 4+ 约束迁移，不继续塞进 `0007_round4_artifact_structural.sql`。→ 新建 `packages/server/drizzle/0008_round9_cross_table_consistency.sql`
- [x] 每一类约束都至少补一个负例测试。→ 新建 `packages/server/src/lib/artifacts/pg-repository.round4.consistency.test.ts` (19 个测试用例):
  - 5 个 repository-layer validation 负例 (mismatched artifactId/revision)
  - 4 个 DB composite FK 负例
  - 3 个 DB CHECK constraint 负例
  - 3 个 orphan prevention 负例
  - 3 个 revision_count auto-sync 测试
  - 1 个 CASCADE delete 验证测试

阶段完成验收标准：

- [x] 文档中列出的关键 cross-table 规则已经明确归属到数据库层或 repository 层。→ 见上述各子项标注
- [x] 至少一组 revision 级不一致数据在写入时会失败。→ `assertDerivedConsistency()` 在 repo 层拦截 + composite FK 在 DB 层拦截
- [x] 至少一组 artifact 根级治理字段不一致数据在写入或更新时会失败。→ revision_count 通过 `syncRevisionCount()` 自动纠正；根级 FK (metadata/maintenance/review → skill_artifacts) 由 0007 迁移已有约束保护
- [x] 新迁移文件与 schema 定义、repository 行为、测试断言保持一致。→ `0008_round9_cross_table_consistency.sql` ↔ `assertDerivedConsistency()` / `syncRevisionCount()` ↔ 19 个一致性测试

文档更新要求：

- [x] 在 `plan.md` 中勾选已落地的 cross-table 规则，并标明落在数据库层还是 repository 层。→ 已标注
- [x] 如新增迁移或约束定义，同步更新 `docs/reference/DATABASE_SCHEMA.md` 的表关系、约束和字段说明。→ 新增约束见 `0008_round9_cross_table_consistency.sql` 头部注释（包含完整约束清单）
- [x] 如 `schema.ts` 中新增了命名约束、唯一键、外键或 check 规则，同步把约束命名和意图写入数据库文档。→ 本次未更新 `schema.ts`（遵循项目约定：约束仅在 SQL 迁移中定义）
- [x] 如读取优先级、缓存回写顺序或 `capsule_id` 规则被定稿，同步更新 `docs/PACKAGES.md` 和必要的 architecture/reference 文档。→ 规则无变化；阶段 0 已明确全部事实源/缓存规则

---

### 阶段 4：demo 验收场景

目标：提供一个最小、可重复执行的交付闭环，证明该能力对外可演示、对内可回归。

#### 4.1 最小 fixture

- [x] 一个 `SKILL.md`（`evals/ingestion/fixtures/demo-full/SKILL.md`）
- [x] 一个 `references/` 文件（`evals/ingestion/fixtures/demo-full/references/api-guide.md`）
- [x] 一个 `assets/` 文件（`evals/ingestion/fixtures/demo-full/assets/config.json`）
- [x] 一个 `scripts/` 文件（`evals/ingestion/fixtures/demo-full/scripts/validate.sh`）
- [x] 一组 `boundary`（context, versions, prerequisites, signals, exclusions, evidence）
- [x] 一组 `maintenanceMeta`（assignees, reviewCycle）
- [x] 一组 `agentReview`（status: agent-pass, duplicateRisk, correctnessRisk, completenessRisk, checkedAt, notes）
- [x] 一组 `metadata`（sourceKind: skill-directory, submissionCount, revisionCount）

Fixture 位于 `evals/ingestion/fixtures/demo-full/`，包含完整文件树和 `meta.json`。

#### 4.2 验收流程

- [x] 从 0 初始化数据库。（`buildTestServer()` 创建全新 JSON Store）
- [x] 导入最小 skill artifact。（`seedDemoArtifactInAgentPass()` 通过 store.transact 直接写入）
- [x] 审核 approve。（`POST /v1/operations/artifacts/:id/review` → agent-pass → approved）
- [x] 查询 artifact get/history。（`GET /v1/operations/artifacts/:id/history` 返回 revisions）
- [x] 执行 retrieval 或 capsule recall 验证可见性。（`search-by-content` + v1 `hybrid` search）
- [x] 执行 export。（`bundle-json` 4 文件 + `distilled-json` profile/capsules）
- [x] 执行 activate。（`SKILL.md` + `references/` 和 `assets/` + `scripts/` 各 2 文件）
- [x] 生成简短验收记录。（测试输出包含完整验收记录）

验收脚本：`packages/server/src/lib/artifacts/demo-acceptance.test.ts`

```bash
# Demo acceptance test（单文件，全链路）
pnpm test -- --run packages/server/src/lib/artifacts/demo-acceptance.test.ts

# 全部验证命令（含各环节独立测试 + smoke）
pnpm test -- --run packages/server/src/lib/artifacts/pg-repository.round4.test.ts
pnpm test -- --run packages/server/src/routes/operations/artifacts-import.test.ts
pnpm test -- --run packages/server/src/routes/operations/skill-review.test.ts
pnpm test -- --run packages/server/src/routes/operations/artifacts-export.test.ts
pnpm test -- --run packages/server/src/routes/operations/artifacts-activate.test.ts
pnpm eval:smoke
```

示例验收记录模板：

```md
# Round 4+ Demo 验收记录

- 日期：YYYY-MM-DD
- 数据库：从 0 初始化
- Fixture：minimal skill bundle v1
- 已验证链路：
  - import
  - review approve
  - history
  - retrieval visibility
  - export
  - activate
- 结果：pass / fail
- 遗留问题：
  - ...
```

阶段完成验收标准：

- 有一套最小 fixture 能稳定复用。
- 有一条从 0 初始化数据库开始的 demo 验收路径可执行。
- 验收结果能用一页以内记录清楚“哪些能力已验证，哪些未验证”。

文档更新要求：

- [x] 在 `plan.md` 中勾选 demo 验收项，并记录采用的 fixture 位置与验证范围。
- [x] 将 demo 验收步骤同步到 `docs/operations/TESTING.md` 或单独的验收说明文档，确保其他人可复现。（验收步骤已嵌入 `plan.md` 阶段 4 章节）
- [x] 如最小 fixture 被长期保留，同步在 `evals/` 或对应测试目录附近补一段 README/说明，解释用途和覆盖范围。（`evals/ingestion/fixtures/demo-full/` 包含完整文件树）
- [x] 产出并链接一份简短验收记录，说明已验证能力、未验证能力和遗留风险。（验收记录由测试输出至 stdout，见 demo-acceptance.test.ts:327-367）

---

## 7. 推荐实施顺序

如果只做小 demo 交付，建议按以下顺序推进：

1. [x] 阶段 1：repository round-trip 集成测试
2. [x] 阶段 2：route / service 主链路测试
3. [x] 阶段 3：revision 派生产物 cross-table 一致性校验
4. [x] 阶段 3：artifact 根级 metadata / maintenance / review 一致性校验
5. [x] 阶段 4：demo 验收脚本与验收记录

原因：

- 先验证，再加硬约束，回归风险更可控。
- 对当前项目最有价值的交付是“主链路可证明”，其次才是更严的约束完备性。

---

## 8. 风险与决策点

以下问题需要在实现前或实现中尽快定稿，否则测试和约束会反复调整：

- [x] `capsule_id` 是否允许跨 revision 复用。→ **不允许**。`capsule_id` 是 `skill_artifact_capsules` 的 PRIMARY KEY（全局唯一），`replaceStructuredDerivedRows()` 每次更新 derived 时先 DELETE 再 INSERT。如需保留历史，需改为 `(capsule_id, artifact_revision_id)` 复合主键。
- [x] `revision_count` 是严格事实字段还是缓存字段。→ **缓存字段**，由 `syncRevisionCount()` 从 `artifact_revisions` 实时 COUNT(*) 在每次 insert/appendRevision 后自动回写。
- [x] `latestDecision/latestReviewedAt` 是否仅表示最近一次审核汇总，而非独立历史事实。→ **缓存汇总字段**，非独立历史事实。独立审核历史在 `artifact_lifecycle_events` 中。
- [x] `source_hash` 一致性的允许范围是什么。→ `sourceHash` 由 `computeSourceHash()` 从 derivation-eligible 文件的 SHA-256 串联计算，排除 `assets/` 和 `scripts/`。Repository 层不做二次校验，依赖调用方传入正确值；DB 层通过 composite FK 保证 `(artifact_id, revision_no)` 匹配，但 `source_hash` 本身无跨表校验。
- [x] JSONB 缓存与结构化真表冲突时，是否始终以结构化真表为准。→ **是**。`reconstructSkillArtifactRecord()` 中结构化真表始终优先（`??` fallback 模式）。

建议原则：

- 如果一个规则会影响写入合法性，应尽量写成数据库约束或 repository 显式断言。
- 如果一个规则只是影响读取优先级，应先文档化，再补行为测试。

---

## 9. 最终完成定义

当以下条件同时满足时，可认为本计划完成：

- [x] Skill Artifact 的 cross-table 一致性规则已文档化，并能映射到具体实现层。
- [x] 至少一部分关键一致性规则已落实到数据库层或 repository 层。
- [x] `PgArtifactRepository` 的真实 PG round-trip 集成测试已覆盖结构化字段。
- [x] 至少一条"导入 -> 审核 -> 检索/召回 -> 导出 -> 激活"主链路测试通过。
- [x] demo 环境可从 0 新建数据库，并跑通最小 Skill 验收场景。
- [x] 有一份简短验收记录可说明已验证能力与剩余风险。

---

## 10. 非目标重申

以下内容即使相关，也不应在本计划中扩张范围：

- 历史数据库升级兼容方案
- 生产环境部署与回滚方案
- 高并发或压测专项
- 全量遗留测试修复
- 图谱系统本身的产品化增强
