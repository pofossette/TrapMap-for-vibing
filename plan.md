# TrapMap Round 4 后续增强计划

本文档用于承接 Round 4 完成后的两项后续工作：

1. cross-table 一致性约束增强
2. 端到端集成测试补齐

边界说明：
- 不考虑历史数据库升级路径。
- 不考虑部署、上线、灰度、回滚方案。
- 默认场景是“可以从 0 新建数据库”的小型项目或 demo 环境。
- 现有结构化真表已经是事实源，`skill_artifacts` 与 `artifact_revisions` 上的 JSONB 字段仅作为兼容缓存保留。

## 当前基线

Skill Artifact 域已经完成以下结构化真表落地：

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

`PgArtifactRepository` 已接入上述真表的写入与优先读取。当前剩余问题不在“有没有结构化表”，而在“数据库层约束是否足够强”和“端到端读写链路是否被完整验证”。

## 一、Cross-Table 一致性约束

目标：
- 降低“结构化表存在，但跨表字段值互相打架”的风险。
- 让错误尽可能在数据库层或 repository 层被拒绝，而不是在下游检索、导出、激活时才暴露。

### 1. revision 级派生产物一致性

要做的内容：
- [ ] 为 `skill_artifact_profiles`、`skill_artifact_capsules`、`skill_artifact_client_manifests` 建立更强的一致性校验，确保：
  - `artifact_id` 与所属 `artifact_revision_id` 对应的 `artifact_revisions.artifact_id` 一致
  - `revision_no` 与所属 `artifact_revision_id` 对应的 `artifact_revisions.revision_no` 一致
  - `source_hash` 与所属 revision 的 `source_hash` 在允许范围内保持一致
- [ ] 为 `skill_artifact_manifest_references/assets/scripts` 增补约束，保证它们不能脱离对应 `skill_artifact_client_manifests` 单独存在。
- [ ] 明确 `capsule_id` 的稳定性规则：
  - 是否允许同一 artifact 不同 revision 复用同一 `capsule_id`
  - 若不允许，补唯一性约束与测试
  - 若允许，明确“跨 revision 复用”的含义与读取优先级

建议方案：
- 优先选择 repository 侧断言 + 数据库约束的组合方式。
- 对小 demo，避免引入过重的触发器系统；优先考虑：
  - 复合唯一键
  - 复合外键
  - 插入前 repository 校验
  - 必要时少量 trigger 做最终兜底

完成标准：
- 任意 profile/capsule/manifest 如果声称属于某个 revision，但字段与 `artifact_revisions` 不一致，应在写入时失败。

### 2. artifact 根级治理字段一致性

要做的内容：
- [ ] 保证 `skill_artifact_metadata.artifact_id`、`skill_artifact_maintenance_assignments.artifact_id`、`skill_artifact_agent_reviews.artifact_id` 与 `skill_artifacts.id` 强绑定。
- [ ] 检查 `skill_artifact_metadata.revision_count` 与 `artifact_revisions` 实际数量的关系，明确规则：
  - 是否要求严格相等
  - 若只是缓存值，repository 更新时如何保证同步
- [ ] 明确 `latestSubmissionId`、`latestSubmittedAt`、`latestReviewedAt`、`latestDecision` 是否完全来自 artifact 根元数据缓存，还是需要进一步拆为独立历史表。
- [ ] 明确 `boundary`、`maintenance_meta`、`agent_review` 的 JSONB 缓存列和结构化子表之间的优先级规则，并写入注释/文档。

完成标准：
- repository 对 artifact 根级治理数据的读取顺序、覆盖顺序、缓存回写顺序必须固定且可解释。

### 3. 约束落地方式

要做的内容：
- [ ] 梳理哪些一致性适合数据库层硬约束，哪些适合 repository 层校验。
- [ ] 新增一个专门的 Round 4+ 约束迁移，避免把增强约束继续塞进 `0007_round4_artifact_structural.sql`。
- [ ] 为每一类约束补“允许失败”的负例测试，而不是只测 happy path。

建议分层：
- 数据库层：
  - 孤儿行禁止
  - 引用对象不存在禁止
  - 枚举值/范围非法禁止
- repository 层：
  - `artifact_id` / `revision_no` / `source_hash` 三元一致性
  - metadata 汇总字段与 revision 计数同步

## 二、端到端集成测试

目标：
- 验证 Skill Artifact 从写入到读取、审核、检索、导出、激活的链路在结构化真表模式下仍然正确。
- 不只验证“写了某张表”，而是验证“功能行为没有回退”。

### 1. repository 集成测试

要做的内容：
- [ ] 新增面向真实 PostgreSQL 的 `PgArtifactRepository` 集成测试文件，对以下链路做 round-trip：
  - insert -> getById
  - appendRevision -> getById
  - updateRevisionDerived -> getById
  - listByFilter(maintainerUserId) -> 返回正确工件
- [ ] 对以下结构化字段补 round-trip：
  - metadata
  - boundary
  - maintenanceMeta
  - agentReview
  - files
  - scriptDescriptors
  - derived.profile
  - derived.capsules
  - derived.clientManifest
- [ ] 增加负例：
  - 写入不一致 revision 数据
  - 缺失依赖 manifest 的子项
  - 非法 review risk/status

### 2. route / service 级端到端测试

要做的内容：
- [ ] 导入一个 artifact 后，验证：
  - `GET history`
  - `POST review`
  - `POST edit`
  - `POST export`
  - `POST activate`
  都仍能得到正确结果
- [ ] 补一条“审核通过 -> 检索可见 -> activation hint 可见”的完整链路测试。
- [ ] 补一条“有 boundary / maintenance / agent review 的 artifact 被读取与导出”的完整链路测试。
- [ ] 验证 graph-plan fallback、capsule recall、skill lookup 仍能消费当前结构化事实源，不因缓存存在而行为漂移。

### 3. demo 验收测试

要做的内容：
- [ ] 构造一个最小 skill fixture：
  - 一个 `SKILL.md`
  - 一个 `references/` 文件
  - 一个 `assets/` 文件
  - 一个 `scripts/` 文件
  - 一组 boundary / maintenance / agent review / metadata
- [ ] 从 0 初始化数据库后，跑一条 demo 验收脚本，覆盖：
  - import
  - review approve
  - artifact get/history
  - retrieval / capsule recall
  - export
  - activate
- [ ] 输出一份简短验收记录，说明 demo 级交付时依赖哪些能力、哪些能力已被验证。

## 三、优先级建议

如果只做小 demo 交付，建议顺序如下：

1. repository 级 round-trip 集成测试
2. route 级审核/导出/激活链路测试
3. revision 派生产物 cross-table 一致性校验
4. metadata 汇总字段一致性校验
5. demo 验收脚本

理由：
- demo 风险主要来自“功能链路断了”，不是来自极端并发或历史升级。
- 所以先补集成测试，再补更硬的一致性约束，收益更高。

## 四、完成标准

- [ ] Skill Artifact 的 cross-table 一致性规则已文档化。
- [ ] 至少一部分关键一致性规则已落实到数据库层或 repository 层。
- [ ] `PgArtifactRepository` 的真实 PG round-trip 集成测试已覆盖结构化字段。
- [ ] 导入/审核/检索/导出/激活至少有一条端到端主链路测试通过。
- [ ] demo 环境可从 0 新建数据库，并跑通最小 Skill 验收场景。

## 五、非目标

以下内容不属于本计划：

- 历史数据库平滑升级
- 生产环境部署与回滚
- 大规模并发压测
- graphify 权限问题修复
- 全仓所有旧测试红项清零
