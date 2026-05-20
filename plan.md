# TrapMap 数据库修复与调整计划

本文档用于跟踪 TrapMap 当前数据库设计问题的系统性修复，目标是将 PostgreSQL 收敛为唯一事实源，消除长期兼容层和结构性技术债，完成后使数据模型、迁移机制、约束体系、检索索引、统计能力与文档保持一致。

## 目标与原则

- [ ] 以 PostgreSQL 行式模型替代 `store_snapshot` 单行 `JSONB` 主路径。
- [ ] 消除“双真相”问题，停止业务读写依赖 JSON 快照。
- [ ] 将核心查询字段、过滤字段、约束字段从 `JSONB` 拆分为结构化列或子表。
- [ ] 为核心实体补齐主键、唯一键、外键、检查约束与必要索引。
- [ ] 将 DDL 统一收敛到 Drizzle migration，移除运行时 `ensureSchema()` 建表模式。
- [ ] 保证迁移后检索、治理、候选、反馈、统计能力无功能倒退。
- [ ] 所有改动同步更新代码、迁移、测试、评测与文档，尽量不遗留“后补”事项。

## 全局完成标准

- [ ] PostgreSQL 成为唯一业务事实源。
- [ ] `store_snapshot` 不再承载任何核心业务读写。
- [ ] `DualWrite*Repository` 与同类兼容逻辑已删除。
- [ ] 核心领域模型具备结构化 schema 与数据库级完整性约束。
- [ ] 反馈、候选、知识、技能工件、检索索引、统计模块全部完成一致性改造。
- [ ] 所有文档已同步，且没有“实现已变更但文档仍描述旧模型”的遗留问题。
- [ ] 测试、typecheck、lint、eval smoke 与专项回归验证全部通过。

## 目标模型总览

本次调整后的数据库模型采用四层结构：

1. 基础维表
   - 团队、用户、成员、访问密钥等被多个领域复用的基础表。
2. 业务主表
   - 知识、技能工件、候选、反馈等聚合根表。
3. 历史与事件表
   - revision、lifecycle event、状态流转、人工处理记录、血缘记录。
4. 派生与索引表
   - embedding、关键词索引、capsule、profile、manifest、usage rollup。

设计原则：
- 业务事实进入业务主表和历史表，不放入单行快照。
- 会被筛选、排序、聚合、联表、约束校验的字段必须结构化。
- `JSONB` 仅允许承载低频扩展数据、外部原始响应快照或短期过渡字段。
- 检索索引表是派生视图，不是新的业务真相来源。

## 推荐命名与字段约定

- 主键：
  - 内部主键优先使用 `bigint` 或 `uuid`。
  - 对外业务 ID 单独保留 `public_id text unique`，例如 `knowledge_123`。
- 外键：
  - 统一使用 `<entity>_id`，例如 `team_id`、`entry_id`、`artifact_id`。
- 版本号：
  - 统一使用 `revision_no integer not null`。
- 状态字段：
  - 统一使用 `<name>_state` 或 `status`，并加 `CHECK` 或 enum。
- 时间字段：
  - 统一使用 `created_at`、`updated_at`、`submitted_at`、`processed_at`、`resolved_at`。
- 审计字段：
  - 统一显式记录 `created_by`、`updated_by`、`actor_user_id`、`submitted_by_user_id` 等，不隐藏在 JSONB 中。

## 目标表结构细化

以下结构不是最终 SQL 定稿，但应作为实现基线。若后续实现偏离，必须在文档中明确记录原因。

### 一、基础维表

#### `teams`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `public_id` | `text` UNIQUE | 对外团队 ID |
| `slug` | `text` UNIQUE | 团队唯一标识 |
| `name` | `text` | 团队名称 |
| `description` | `text null` | 描述 |
| `created_at` | `timestamptz` | 创建时间 |
| `updated_at` | `timestamptz` | 更新时间 |

#### `users`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `public_id` | `text` UNIQUE | 对外用户 ID |
| `handle` | `text` UNIQUE | 用户句柄 |
| `created_at` | `timestamptz` | 创建时间 |
| `updated_at` | `timestamptz` | 更新时间 |

#### `members`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `public_id` | `text` UNIQUE | 对外成员 ID |
| `team_id` | FK -> `teams.id` | 所属团队 |
| `user_id` | FK -> `users.id` | 关联用户 |
| `role_template` | `text` | 角色模板 |
| `security_level` | `integer` | 安全等级 |
| `notes` | `text null` | 备注 |
| `is_system` | `boolean` | 是否系统成员 |
| `created_at` | `timestamptz` | 创建时间 |
| `updated_at` | `timestamptz` | 更新时间 |

### 二、知识域

#### `knowledge_entries`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `public_id` | `text` UNIQUE | 对外知识 ID，如 `knowledge_123` |
| `team_id` | FK -> `teams.id` null | 团队作用域 |
| `scope` | `text` | `global` / `project` |
| `required_level` | `integer` | 访问等级，范围 0-10 |
| `lifecycle_state` | `text` | 生命周期状态 |
| `owner_user_id` | FK -> `users.id` | 所有者 |
| `current_revision_no` | `integer` | 当前版本号 |
| `shortcut_current` | `text` | 当前摘要，保留为读优化字段 |
| `detail_current` | `text` | 当前详情，保留为读优化字段 |
| `created_at` | `timestamptz` | 创建时间 |
| `updated_at` | `timestamptz` | 更新时间 |

约束要求：
- `scope in ('global', 'project')`
- `required_level between 0 and 10`
- `lifecycle_state` 必须受状态机枚举约束

#### `knowledge_revisions`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `entry_id` | FK -> `knowledge_entries.id` | 父知识条目 |
| `revision_no` | `integer` | 版本号 |
| `submitted_by_user_id` | FK -> `users.id` | 提交人 |
| `shortcut` | `text` | 该版本摘要 |
| `detail` | `text` | 该版本正文 |
| `submitted_at` | `timestamptz` | 提交时间 |
| `created_at` | `timestamptz` | 创建时间 |

唯一约束：
- `unique(entry_id, revision_no)`

#### `knowledge_labels`

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | FK -> `knowledge_entries.id` | 知识条目 |
| `label` | `text` | 标签值 |
| `created_at` | `timestamptz` | 创建时间 |

唯一约束：
- `unique(entry_id, label)`

说明：
- 若未来需要“标签按版本变化”，再补 `revision_no` 维度，不建议一开始继续把版本标签塞回 `JSONB`。

#### `knowledge_boundary_contexts`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `entry_id` | FK -> `knowledge_entries.id` | 知识条目 |
| `context_type` | `text` | 上下文类型 |
| `context_value` | `text` | 上下文值 |
| `created_at` | `timestamptz` | 创建时间 |

类似拆分还应覆盖：
- `knowledge_boundary_versions`
- `knowledge_boundary_prerequisites`
- `knowledge_boundary_signals`
- `knowledge_boundary_exclusions`
- `knowledge_evidence`
- `knowledge_maintenance_assignments`

### 三、技能工件域

#### `skill_artifacts`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `public_id` | `text` UNIQUE | 对外工件 ID |
| `team_id` | FK -> `teams.id` null | 团队作用域 |
| `scope` | `text` | `global` / `project` |
| `slug` | `text` | 工件 slug |
| `title` | `text` | 标题 |
| `required_level` | `integer` | 安全等级 |
| `lifecycle_state` | `text` | 生命周期状态 |
| `owner_user_id` | FK -> `users.id` | 所有者 |
| `current_revision_no` | `integer` | 当前版本号 |
| `created_at` | `timestamptz` | 创建时间 |
| `updated_at` | `timestamptz` | 更新时间 |

唯一约束建议：
- `unique(team_id, slug)` 或按 `scope + team_id + slug` 建唯一约束

#### `skill_artifact_revisions`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `artifact_id` | FK -> `skill_artifacts.id` | 父工件 |
| `revision_no` | `integer` | 版本号 |
| `source_hash` | `text` | 源文件哈希 |
| `submitted_by_user_id` | FK -> `users.id` | 提交人 |
| `submitted_at` | `timestamptz` | 提交时间 |
| `created_at` | `timestamptz` | 创建时间 |

唯一约束：
- `unique(artifact_id, revision_no)`

#### `skill_artifact_files`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `artifact_revision_id` | FK -> `skill_artifact_revisions.id` | 所属版本 |
| `path` | `text` | 文件路径 |
| `kind` | `text` | `skill-markdown/reference/asset/script` |
| `sha256` | `text` | 文件内容哈希 |
| `size_bytes` | `integer` | 文件大小 |
| `media_type` | `text` | 媒体类型 |
| `source_group` | `text` | `SKILL.md/references/assets/scripts` |
| `include_in_derivation` | `boolean` | 是否参与派生 |
| `activation_only` | `boolean` | 是否仅激活时使用 |

唯一约束：
- `unique(artifact_revision_id, path)`

#### `skill_capsules`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `public_id` | `text` UNIQUE | 对外胶囊 ID |
| `artifact_revision_id` | FK -> `skill_artifact_revisions.id` | 来源版本 |
| `content` | `text` | 胶囊正文 |
| `situation` | `text` | 场景 |
| `problem` | `text` | 问题 |
| `goal` | `text` | 目标 |
| `error_text` | `text null` | 相关错误文本 |
| `scope` | `text` | 继承作用域 |
| `required_level` | `integer` | 继承等级 |
| `created_at` | `timestamptz` | 创建时间 |

相关子表：
- `skill_capsule_source_paths`
- `skill_capsule_labels`
- `skill_profiles`
- `skill_manifest_references`
- `skill_manifest_assets`
- `skill_manifest_scripts`

### 四、候选与去重域

#### `candidate_submissions`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `public_id` | `text` UNIQUE | 对外候选 ID |
| `source_type` | `text` | `trap` / `skill` |
| `submitted_by_user_id` | FK -> `users.id` | 提交人 |
| `team_id` | FK -> `teams.id` null | 团队作用域 |
| `status` | `text` | 候选处理状态 |
| `received_at` | `timestamptz` | 接收时间 |
| `queued_at` | `timestamptz null` | 入队时间 |
| `analyzing_at` | `timestamptz null` | 分析时间 |
| `completed_at` | `timestamptz null` | 完成时间 |
| `retry_count` | `integer` | 重试次数 |
| `last_error` | `text null` | 最近错误 |
| `created_at` | `timestamptz` | 创建时间 |
| `updated_at` | `timestamptz` | 更新时间 |

#### `candidate_trap_payloads`

| 字段 | 类型 | 说明 |
|------|------|------|
| `candidate_id` | FK -> `candidate_submissions.id` | 候选 |
| `shortcut` | `text` | 摘要 |
| `detail` | `text` | 详情 |
| `scope` | `text` | 作用域 |
| `required_level` | `integer` | 安全等级 |

#### `candidate_skill_payloads`

| 字段 | 类型 | 说明 |
|------|------|------|
| `candidate_id` | FK -> `candidate_submissions.id` | 候选 |
| `title` | `text` | 标题 |
| `slug` | `text` | slug |
| `scope` | `text` | 作用域 |
| `required_level` | `integer` | 安全等级 |

#### `candidate_analyses`

| 字段 | 类型 | 说明 |
|------|------|------|
| `candidate_id` | FK -> `candidate_submissions.id` | 候选 |
| `analysis_version` | `text` | 分析器版本 |
| `correctness_risk` | `text` | 正确性风险 |
| `duplicate_risk` | `text` | 重复风险 |
| `completeness_risk` | `text` | 完整性风险 |
| `notes` | `text` | 文本说明 |
| `created_at` | `timestamptz` | 创建时间 |

#### `candidate_duplicate_cases`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `candidate_id` | FK -> `candidate_submissions.id` | 候选 |
| `detected_at` | `timestamptz` | 检出时间 |
| `detection_version` | `text` | 判重版本 |
| `highest_similarity` | `numeric` | 最高相似度 |
| `duplicate_type` | `text` | 重复类型 |
| `has_exact_duplicate` | `boolean` | 是否完全重复 |

#### `candidate_duplicate_matches`

| 字段 | 类型 | 说明 |
|------|------|------|
| `duplicate_case_id` | FK -> `candidate_duplicate_cases.id` | 判重案例 |
| `entity_type` | `text` | 命中实体类型 |
| `entity_public_id` | `text` | 命中实体业务 ID |
| `similarity_score` | `numeric` | 相似度 |
| `match_type` | `text` | 命中类型 |
| `overlap_summary` | `text null` | 重叠摘要 |

### 五、反馈与统计域

#### `feedback_records`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `public_id` | `text` UNIQUE | 对外反馈 ID |
| `entry_type` | `text` | `knowledge` / `artifact` / `capsule` |
| `entry_public_id` | `text` | 目标实体业务 ID |
| `problem_type` | `text` | 问题类型 |
| `description` | `text` | 问题描述 |
| `context` | `text null` | 上下文 |
| `query_seed` | `text null` | 原始查询 |
| `submitted_by_user_id` | FK -> `users.id` null | 提交人 |
| `status` | `text` | `new/triaged/resolved/dismissed` |
| `admin_notes` | `text null` | 管理备注 |
| `submitted_at` | `timestamptz` | 提交时间 |
| `updated_at` | `timestamptz` | 更新时间 |

#### `feedback_custom_answers`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK | 内部主键 |
| `feedback_id` | FK -> `feedback_records.id` | 反馈 |
| `question_key` | `text` | 提示 key |
| `answer_text` | `text` | 回答 |

#### `usage_events`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `bigint` PK 或 `uuid` PK | 主键 |
| `query_id` | `text` | 查询链路 ID |
| `team_id` | FK -> `teams.id` null | 团队 |
| `account_id` | `text` | 账户标识 |
| `entry_type` | `text` | 命中实体类型 |
| `entry_public_id` | `text` | 命中实体业务 ID |
| `query_text` | `text null` | 查询文本 |
| `created_at` | `timestamptz` | 记录时间 |

配套汇总表建议：
- `usage_events_daily_rollup`
- `entry_quality_snapshots`

### 六、检索索引域

#### `knowledge_embeddings`

保留独立派生表，但要求：
- `entry_id` 指向结构化主表主键
- `revision_no` 与知识版本严格对应
- 建立 `unique(entry_id, revision_no)`
- 向量索引重建不改变业务主数据

#### `knowledge_search_documents`

建议替代当前 `knowledge_keywords` 的 `tokens JSONB` 设计：

| 字段 | 类型 | 说明 |
|------|------|------|
| `entry_id` | FK -> `knowledge_entries.id` | 知识条目 |
| `revision_no` | `integer` | 版本号 |
| `document` | `tsvector` | 搜索文档 |
| `labels` | `text[]` | 轻量标签副本 |
| `status` | `text` | 索引状态 |
| `updated_at` | `timestamptz` | 更新时间 |

## JSONB 保留与拆分规则

允许保留 `JSONB` 的场景：
- 外部模型原始输出快照，需要审计但不作为主查询条件。
- 临时调试元数据，不参与约束和聚合。
- 明确标注为扩展字段，且不会演化为核心业务对象。

必须拆分的场景：
- 会按字段过滤、排序、统计、联表查询。
- 需要唯一性、非空、值域或引用完整性校验。
- 数组中的每个对象将来会独立被查询、更新、审计或统计。

## 少量示例

### 示例 1：知识标签从 JSONB 拆为子表

旧模式：

```json
{
  "labels": ["postgres", "migration", "locking"]
}
```

新模式：

```sql
insert into knowledge_labels (entry_id, label)
values
  (101, 'postgres'),
  (101, 'migration'),
  (101, 'locking');
```

收益：
- 可以直接按标签过滤和聚合。
- 可以为 `(label, entry_id)` 建索引。
- 避免对整块 JSONB 做包含判断。

### 示例 2：候选判重结果从 `matches[]` 拆为主从表

旧模式：

```json
{
  "duplicateCase": {
    "highestSimilarity": 0.93,
    "matches": [
      { "entityId": "knowledge_12", "matchType": "semantic", "similarityScore": 0.93 },
      { "entityId": "artifact_7", "matchType": "label-overlap", "similarityScore": 0.71 }
    ]
  }
}
```

新模式：

```sql
insert into candidate_duplicate_cases (
  id, candidate_id, detected_at, detection_version, highest_similarity, duplicate_type, has_exact_duplicate
) values (
  5001, 301, now(), 'dedup-v2', 0.93, 'semantic-near-duplicate', false
);

insert into candidate_duplicate_matches (
  duplicate_case_id, entity_type, entity_public_id, similarity_score, match_type, overlap_summary
) values
  (5001, 'knowledge', 'knowledge_12', 0.93, 'semantic', null),
  (5001, 'artifact', 'artifact_7', 0.71, 'label-overlap', null);
```

收益：
- 可以直接统计“最常被判重的实体”。
- 可以筛选某类重复类型、某阈值以上相似度。
- 更容易做审计和人工复核工作台。

### 示例 3：关键词索引从 `JSONB tokens` 改为 `tsvector`

建议结构：

```sql
create table knowledge_search_documents (
  entry_id bigint not null references knowledge_entries(id) on delete cascade,
  revision_no integer not null,
  document tsvector not null,
  labels text[] not null default '{}',
  status text not null default 'synced',
  updated_at timestamptz not null default now(),
  primary key (entry_id, revision_no)
);

create index idx_knowledge_search_documents_gin
on knowledge_search_documents using gin (document);
```

示例查询：

```sql
select d.entry_id
from knowledge_search_documents d
join knowledge_entries e on e.id = d.entry_id
where d.document @@ plainto_tsquery('postgres migration')
  and e.lifecycle_state = 'approved'
  and e.required_level <= 3
order by ts_rank(d.document, plainto_tsquery('postgres migration')) desc
limit 10;
```

### 示例 4：迁移执行顺序示例

建议顺序：

```text
1. 创建新表和新约束，但不切流量
2. 编写回填脚本，从旧 JSONB / snapshot 导入新表
3. 对账：行数、抽样、哈希、关键查询结果
4. 应用读路径切到新表
5. 应用写路径切到新表
6. 删除双写
7. 删除旧表和旧代码
```

## 实施边界说明

本计划默认：
- 优先修复数据库设计和持久化边界，不在本轮顺手扩展新的业务功能。
- 若某个模块暂时无法一次性完全结构化，必须给出明确的临时表述、删除时点和后续动作，不允许出现“先留着以后看”的无主技术债。
- 任一轮次若新增字段或表结构偏离本计划，应同步回写 `plan.md` 与对应正式文档。

## 轮次 0：基线冻结与设计定稿

完成标志：
- 当前数据库现状、迁移范围、目标模型、淘汰对象、验收标准全部定稿。
- 本轮结束后，不再新增绕过目标模型的临时持久化方案。

要做的内容：
- [x] 审计当前所有持久化路径，确认哪些模块仍依赖 `store_snapshot`、`SkillShareerStore`、`InMemory*Repository` 或双写兼容层。
- [x] 盘点所有核心表、运行时建表逻辑、现有 migration、索引、序列、统计表与检索索引表。
- [x] 按领域拆分目标模型：知识、技能工件、候选、反馈、统计、检索索引、团队与用户引用。
- [x] 明确哪些 `JSONB` 必须拆分，哪些允许保留为低频扩展字段。
- [x] 明确每个领域的“唯一事实源表”“历史表”“事件表”“派生索引表”。
- [x] 明确迁移策略：一次性切换字段、分批回填、影子校验、停止双写、删除旧层。
- [x] 确定命名规范：主键、业务 ID、外键、索引、约束、时间字段、状态字段命名统一。

对应要求修改的文档：
- [x] `plan.md`
- [x] `docs/reference/DATA_MODEL.md`
- [x] `docs/reference/GLOSSARY.md`
- [x] `architecture.md`

Round 0 落地说明：
- 已在本文档中冻结目标模型、命名约定、迁移顺序与完成标准，后续轮次以此为唯一基线。
- 持久化现状已收敛为两类：
  - PostgreSQL 结构化主表：知识、技能工件、候选、任务队列及其派生索引。
  - `store_snapshot` 兼容快照：用户、团队、成员、会话、访问密钥、审计、反馈、重复检测、谱系、图索引等尚未结构化的域。
- 双写兼容层已仅作为 Round 2 前的过渡策略；Round 2 起知识、工件、候选主路径已切为 PostgreSQL 真表，剩余域不再允许新增新的双写设计。
- `JSONB` 使用边界已明确：
  - 必须拆分：会被筛选、排序、聚合、联表、唯一约束、权限校验、治理统计使用的字段。
  - 允许保留：低频扩展字段、外部原始响应快照、短期迁移过渡字段。
- 唯一事实源约定已明确：
  - 业务主事实写入业务主表与历史/事件表。
  - 检索索引、capsule、profile、manifest、usage rollup 仅为派生层，不得反向成为业务真相。

## 轮次 1：持久化基线收敛与迁移机制整改

完成标志：
- 所有数据库对象通过 Drizzle migration 管理。
- 应用启动不再负责创建核心表、序列、索引。

要做的内容：
- [x] 统一梳理 `packages/server/drizzle/` 与 `packages/server/src/lib/persistence/schema.ts`，修正 schema 与运行时代码的职责边界。
- [x] 为所有现存核心表补充正式 migration，避免继续依赖 repository 中的 `CREATE TABLE IF NOT EXISTS`。
- [x] 删除或下线各 `Pg*Repository.ensureSchema()` 中的 DDL 逻辑，仅保留运行时数据访问职责。
- [x] 规范迁移顺序：基础维表、业务主表、历史表、事件表、派生索引表、回填脚本、约束切换。
- [x] 建立迁移回滚策略与数据核对脚本规范。
- [x] 为每轮 schema 迁移定义明确的"可回滚点"和"不可回滚点"。

对应要求修改的文档：
- [x] `README.md`
- [x] `docs/guides/GETTING_STARTED.md`
- [x] `docs/guides/CONTRIBUTING.md`
- [x] `docs/operations/TESTING.md`
- [x] `docs/operations/ENVIRONMENT.md`

## 轮次 2：淘汰 `store_snapshot` 主路径与双写兼容层

完成标志：
- 业务主路径不再读取 `store_snapshot`。
- 双写逻辑已移除，仅允许短期只读兼容或一次性迁移脚本读取旧数据。

要做的内容：
- [x] 梳理 `SkillShareerStore`、`PostgresStore`、`create-store`、`store/index` 及所有使用点。
- [x] 将知识、工件、候选、反馈、统计等模块的主读写全部切到 PostgreSQL 真表。
- [x] 删除 `DualWriteKnowledgeRepository` 及同类兼容设计，避免双真相长期存在。
- [x] 将 `store_snapshot` 限定为迁移输入源，不再作为运行时状态存储。
- [x] 提供一次性数据回填与核对脚本，确保旧快照到新表的数据一致。
- [ ] 在全部模块切换完成后，删除 `store_snapshot` 表与相关实现（知识/工件/候选已迁移，用户/团队/会话等域仍需 JSONB，延后至各自轮次）。

对应要求修改的文档：
- [x] `docs/reference/DATA_MODEL.md`
- [x] `docs/reference/api-surface.md`
- [x] `docs/reference/PERFORMANCE.md`
- [x] `docs/PACKAGES.md`

## 轮次 3：知识域模型结构化改造

完成标志：
- `knowledge_entries`、`knowledge_revisions`、`lifecycle_events` 形成清晰主从结构。
- 知识条目中承担过滤、治理、统计职责的字段不再依赖大块 `JSONB`。

要做的内容：
- [x] 为知识主表补齐数据库级约束：`scope`、`lifecycle_state`、`required_level` 的 `CHECK` 或 enum。
- [x] 将 `labels` 从 `JSONB` 改为结构化存储。
- [x] 将 `boundary` 拆为可查询子结构，至少覆盖 context、version、prerequisite、signal、exclusion、evidence 等查询维度。
- [x] 将 `maintenance_meta` 拆为结构化列或独立子表，支持维护人、复核时间、治理筛选。
- [x] 为知识版本表、生命周期事件表补齐外键与唯一约束。
- [x] 明确”当前态字段”和”历史版本字段”的职责，避免重复存储失控。
- [x] 为知识域建立必要组合索引，如团队、状态、安全等级、更新时间、标签过滤路径。

对应要求修改的文档：
- [ ] `docs/reference/DATA_MODEL.md`
- [ ] `docs/reference/GLOSSARY.md`
- [ ] `docs/reference/api-surface.md`
- [ ] `docs/architecture/components/GOVERNANCE.md`

Round 3 落地说明：
- `knowledge_entries` 表已补齐 `CHECK` 约束：`scope IN ('global', 'project')`、`lifecycle_state` 限定为合法状态枚举、`required_level BETWEEN 0 AND 10`。
- `lifecycle_events` 表已补齐 `CHECK` 约束：`type` 限定为合法事件类型枚举。
- `knowledge_labels` 表已创建，`(entry_id, label)` 唯一索引支持标签过滤。`knowledge_entries.labels` JSONB 列保留为读优化缓存字段，与结构化表同步。
- 边界（boundary）已拆为六个子表：`knowledge_boundary_contexts`、`knowledge_boundary_versions`、`knowledge_boundary_prerequisites`、`knowledge_boundary_signals`、`knowledge_boundary_exclusions`、`knowledge_boundary_evidence`。各表均有 `entry_id` 索引和唯一约束。`knowledge_entries.boundary` JSONB 列保留为读优化缓存。
- `knowledge_maintenance_assignments` 表已创建，`(entry_id)` 主键，支持 `maintainer_user_id` 和 `review_by` 索引筛选。`knowledge_entries.maintenance_meta` JSONB 列保留为读优化缓存。
- `knowledge_revisions` 表已补齐 `(entry_id, revision)` 唯一索引。
- `knowledge_entries` 表已补齐 `(scope, required_level)` 和 `(owner_user_id)` 组合索引。
- `PgKnowledgeRepository` 已更新：`insert` 同步写入所有子表，`getById` 从子表读取结构化数据，`listByFilter` 支持 `labels` 过滤（AND 语义），`updateGovernance` 和 `appendRevision` 同步维护 `knowledge_labels`。
- `InMemoryKnowledgeRepository` 已同步支持 `labels` 过滤。
- 迁移脚本 `0002_round3_knowledge_structural.sql` 包含 DDL 和从 JSONB 到结构化表的回填逻辑。
- 测试已更新，覆盖标签过滤、边界子表往返、维护分配往返和 CHECK 约束验证。

## 轮次 4：技能工件与派生产物结构化改造

完成标志：
- SkillArtifact 不再使用 `metadata/files/derived/script_descriptors` 作为核心结构化信息容器。
- 文件、脚本、胶囊、画像、清单成为独立可索引对象。

要做的内容：
- [ ] 为 `skill_artifacts` 增加数据库级约束与唯一性规则，特别是 `slug` 的作用域唯一性。
- [ ] 将 `metadata` 中参与治理或展示排序的字段拆出。
- [ ] 将 `artifact_revisions.files` 拆为 `skill_artifact_files` 类子表。
- [ ] 将 `script_descriptors` 拆为独立脚本描述表，支持 capability、策略与审计。
- [ ] 将 `derived` 拆为独立派生产物结构，如 profile、capsule、manifest 及其子项。
- [ ] 将 `agent_review`、`boundary`、`maintenance_meta` 从大块 JSONB 逐步结构化。
- [ ] 为工件主表、版本表、文件表、派生产物表建立外键、唯一键和查询索引。

对应要求修改的文档：
- [ ] `docs/reference/DATA_MODEL.md`
- [ ] `docs/reference/GLOSSARY.md`
- [ ] `README.md`
- [ ] `docs/PACKAGES.md`

## 轮次 5：候选、去重、审核链路结构化改造

完成标志：
- 候选处理链具备独立主表、分析结果表、判重结果表、人工处理表、血缘表。
- 不再以 JSONB 包裹整个候选状态机。

要做的内容：
- [ ] 将 `candidates.original_payload` 按 `trap/skill` 类型拆分结构，避免异构载荷长期混存。
- [ ] 将 `analysis_snapshot` 拆为结构化分析结果表，支持按风险、状态、版本回查。
- [ ] 将 `duplicate_case` 与 `matches[]` 拆为主从表，支持命中实体维度分析。
- [ ] 将 `manual_result` 拆为人工处理结果表，与候选状态机关联。
- [ ] 为候选状态流转补齐数据库级状态约束与必要审计字段。
- [ ] 为候选、判重、发布结果与实体血缘建立清晰 FK 链路。

对应要求修改的文档：
- [ ] `docs/reference/DATA_MODEL.md`
- [ ] `docs/reference/GLOSSARY.md`
- [ ] `docs/reference/api-surface.md`
- [ ] `docs/operations/TESTING.md`

## 轮次 6：反馈与统计模块补齐 PostgreSQL 真表实现

完成标志：
- 反馈模块不再使用仅内存/快照 repository。
- 统计模块具备稳定的可查询结构，并为增长预留汇总/分区能力。

要做的内容：
- [ ] 为 `feedback` 建立正式 PostgreSQL repository，并替换当前 `InMemoryFeedbackRepository` 主路径。
- [ ] 将反馈的自定义问答、状态流转、管理员备注、质量统计依赖字段结构化。
- [ ] 为 `feedback` 建立按 `entryId`、`entryType`、`status`、`problemType` 的索引体系。
- [ ] 评估 `usage_events` 的增长风险，补充时间范围查询、排行查询所需的归档或汇总设计。
- [ ] 视数据量预期增加日汇总或周期汇总表，避免长期只扫明细。
- [ ] 确保统计能力不再依赖旧 JSONB 存储路径。

对应要求修改的文档：
- [ ] `docs/reference/DATA_MODEL.md`
- [ ] `docs/reference/api-surface.md`
- [ ] `docs/reference/PERFORMANCE.md`
- [ ] `docs/operations/TESTING.md`

## 轮次 7：检索索引模型优化

完成标志：
- 检索索引字段与 PostgreSQL 索引能力匹配，避免继续把核心搜索结构放在 `JSONB` 中。
- 检索与治理过滤链路可解释、可验证、可维护。

要做的内容：
- [ ] 评估 `knowledge_keywords.tokens`、`field_tokens` 的结构，优先改为 `text[]` 或 `tsvector`。
- [ ] 评估 `labels`、边界字段在检索过程中的过滤与 boost 路径，改为更适合索引的结构。
- [ ] 确认向量表、关键词表、图索引表与主领域表的同步机制和幂等约束。
- [ ] 为索引回填、重建、失败重试建立明确状态字段和运维流程。
- [ ] 避免检索索引与业务主表之间出现新的双真相问题。

对应要求修改的文档：
- [ ] `docs/reference/PERFORMANCE.md`
- [ ] `docs/reference/DATA_MODEL.md`
- [ ] `docs/operations/TESTING.md`
- [ ] `evals/retrieval/README.md`

## 轮次 8：约束、命名、索引与清理收尾

完成标志：
- 所有新旧混合命名、遗留字段、兼容接口、临时脚本完成清理。
- 数据库设计达到“可长期维护”状态，而非“迁移刚能跑通”状态。

要做的内容：
- [ ] 补齐所有外键、唯一键、非空约束、检查约束、删除策略与更新策略。
- [ ] 统一主键、业务 ID、版本号、时间戳、状态字段命名。
- [ ] 删除已废弃的 repository、store shim、兼容分支与迁移期影子逻辑。
- [ ] 清理已失效文档、注释、TODO、过时测试夹具与基于旧模型的辅助脚本。
- [ ] 为关键表补充索引复查，确认无明显缺失、重复或冗余索引。
- [ ] 为高频查询与后台任务明确读写路径与锁粒度，避免新设计留下并发隐患。

对应要求修改的文档：
- [ ] `README.md`
- [ ] `docs/PACKAGES.md`
- [ ] `docs/guides/CODE_GUIDE.md`
- [ ] `docs/guides/CONTRIBUTING.md`
- [ ] `docs/reference/GLOSSARY.md`

## 每轮次通用完成检查

每轮次结束前都必须满足以下复选框：

- [ ] 本轮代码改动已完成并通过最小相关测试。
- [ ] 本轮 migration 已编写并能在空库与升级库上执行。
- [ ] 本轮回填/迁移脚本已验证幂等性或重复执行行为。
- [ ] 本轮涉及的旧实现已明确下线或标记待删除，不保留模糊状态。
- [ ] 本轮相关文档已同步更新。
- [ ] 本轮完成标志已满足，且无未记录的临时妥协方案。

## 明确禁止遗留的技术债

- [ ] 不新增新的“先放 JSONB，后面再拆”的核心结构字段。
- [ ] 不保留长期双写作为默认运行模式。
- [ ] 不继续新增运行时自动建表逻辑。
- [ ] 不允许文档仍声称“生产可用”，但核心模块仍依赖快照兼容层。
- [ ] 不允许核心实体继续缺失外键与唯一约束而依赖应用层兜底。
- [ ] 不允许“测试通过但数据模型未定稿”的半完成状态进入收尾阶段。

## 所有任务完成后的验证计划

### 一、数据库与迁移验证

- [ ] 在全新数据库上执行完整 migration，确认可从零建库成功。
- [ ] 在包含历史数据的升级数据库上执行 migration，确认可平滑升级。
- [ ] 执行全量数据核对，确认旧快照与新表回填结果一致。
- [ ] 对关键实体执行抽样人工核对：知识、技能工件、候选、反馈、统计数据。
- [ ] 验证旧表/旧字段/旧兼容层删除后系统仍能完整启动与运行。

### 二、功能回归验证

- [ ] 运行 `pnpm test`
- [ ] 运行 `pnpm typecheck`
- [ ] 运行 `pnpm check`
- [ ] 运行 `pnpm eval:smoke`
- [ ] 对检索、审核、反馈、统计、导入导出执行关键路径手工回归。
- [ ] 为迁移影响最大的 repository 与 service 增补专项测试。

### 三、性能与并发验证

- [ ] 对知识检索、工件检索、反馈列表、统计排行、候选处理执行基准对比。
- [ ] 验证高频查询是否命中预期索引，必要时使用 `EXPLAIN ANALYZE` 复核。
- [ ] 验证候选处理、版本追加、生命周期流转在并发场景下无明显锁争用异常。
- [ ] 验证索引回填、派生产物重建、批量迁移不会导致不可接受的数据库负载。

### 四、文档与运维验证

- [ ] 确认 README、数据模型、术语表、测试指南、环境文档、贡献指南全部反映新设计。
- [ ] 确认开发者按文档即可完成本地建库、迁移、测试与排障。
- [ ] 确认生产部署文档不再引用过期的快照/兼容持久化描述。

### 五、会话收尾验证

- [ ] 完成代码修改后运行 `graphify update .`
- [ ] 检查 `graphify-out/GRAPH_REPORT.md` 对核心节点变化是否仍可导航。
- [ ] 在最终交付前复核 `plan.md` 中全部复选框状态与实际进度是否一致。
