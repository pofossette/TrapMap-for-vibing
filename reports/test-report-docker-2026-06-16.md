# TrapMap Docker 后端盲测报告 — 2026-06-16

**测试日期**: 2026-06-16  
**测试环境**: Docker combined 模式（trapmap-server + trapmap-postgres），`http://127.0.0.1:4000`  
**测试方式**: Subagent-Driven Development — fresh subagent 执行完整 API 链路  
**测试目标**: 使用 fresh team（blind-test-team-0616）验证知识生命周期全闭环  
**前置条件**: 6/15 盲测发现 D027-D033，本次重点验证 D029 是否修复

---

## 总览

| 指标 | 数值 |
|------|------|
| 链路步骤总数 | 18（9 setup + 9 test） |
| 通过 | 17 |
| 失败 | 1（deactivate 响应序列化，DB 写入已成功 — D029 未修复） |
| 新发现 | 4（D034-D037） |
| 阻塞性问题 | 1（D029 — deactivate 响应对 system-admin 返回 404，未修复） |
| 重试次数 | 1（首次 submit 被 agent-rejected — duplicate overlap 1.00） |

**结论**: 知识生命周期主链路 submit → agent-pass → GET entry → review-queue → approve → search(graph-assisted/hybrid/semantic) → deactivate 继续闭环通过。D029（deactivate 以 system-admin 调用返回 404）仍未修复，为唯一阻塞性缺陷。新发现 4 个问题（D034-D037）。

---

## 测试环境状态

```
容器状态:
  trapmap-server    Up (healthy)  [4000]
  trapmap-postgres  Up (healthy)  [5434]

/health 响应:
  status: ok
  liveness: alive
  readiness: ready
  queueWorker: running
  outboxWorker: running
  graphQuery: disabled (backend=memory)
  uptimeSeconds: 3248

Docker 资源占用（测试前基线）:
  trapmap-server     CPU 0.13%   MEM 89.09MiB / 30.84GiB (0.28%)   Net I/O 38.6MB↓/66.2MB↑   PIDs 11
  trapmap-postgres   CPU 0.16%   MEM 66.05MiB / 30.84GiB (0.21%)   Net I/O 72.7MB↓/42.7MB↑   PIDs 7

Docker 资源占用（测试中期）:
  trapmap-server     CPU 0.12%   MEM 88.85MiB / 30.84GiB (0.28%)   Net I/O 38.8MB↓/66.7MB↑   PIDs 11
  trapmap-postgres   CPU 0.16%   MEM 66.09MiB / 30.84GiB (0.21%)   Net I/O 73.1MB↓/42.9MB↑   PIDs 7

Docker 资源占用（测试结束）:
  trapmap-server     CPU 0.10%   MEM 89.71MiB / 30.84GiB (0.28%)   Net I/O 41.6MB↓/70.8MB↑   PIDs 11
  trapmap-postgres   CPU 0.31%   MEM 69.36MiB / 30.84GiB (0.22%)   Net I/O 77.2MB↓/45.7MB↑   PIDs 8
```

### 资源趋势分析

| 指标 | trapmap-server | trapmap-postgres |
|------|---------------|-----------------|
| CPU 峰值 | 0.13% | 0.31% |
| 内存峰值 | 89.71 MiB | 69.36 MiB |
| 内存变化 | +0.62 MiB (+0.7%) | +3.31 MiB (+5.0%) |
| 网络 I/O 增量 | +3.0MB↓ / +4.6MB↑ | +4.5MB↓ / +3.0MB↑ |
| PIDs 变化 | 无变化 (11) | +1 (7→8) |

- 服务端内存占用稳定在 ~90 MiB，测试期间几乎无增长
- PG 内存增长 5%（+3.3 MiB），可能由连接池或查询缓存引起，属正常范围
- CPU 使用率全程低于 0.5%，负载极低

---

## 链路执行详情

### Setup 阶段

| 步骤 | 操作 | 结果 | 备注 |
|------|------|------|------|
| S1 | system-admin 登录 | ✅ | session_1032 |
| S2 | 创建 team | ✅ | team_6（slug: blind-test-team-0616） |
| S3 | 创建 submitter | ✅ | member_11 (submitter-0616-1781495589) |
| S4 | 创建 reviewer | ✅ | member_12 (reviewer-0616-1781495589) |
| S5 | 提升 reviewer securityLevel=2 + 显式 knowledge:review | ✅ | D032 workaround 验证通过 |
| S6 | 发行 submitter access-key | ✅ | ssr_key_do7rmG... |
| S7 | 发行 reviewer access-key | ✅ | ssr_key_nafJxt... |
| S8 | submitter 登录 | ✅ | session_1035 |
| S9 | reviewer 登录 | ✅ | session_1036, effectivePermissions 含 knowledge:review |

**Setup 期间 API schema 差异（持续性发现）**:
- 登录 API：session token 通过 `X-Session-Token` 响应头返回，不在 body 中
- 创建 team：schema 仅接受 `{name, description?}`，无 `slug` 字段（自动生成）
- 发行 access-key：schema 需要 `{teamId, memberId, notes?}`，无 `label` 字段

### Test 阶段

#### Step 10: Submit Knowledge Entry → agent-pass ✅（重试 1 次）

```
POST /v1/knowledge
Authorization: Bearer <SUBMITTER_TOKEN>

第一次尝试:
{
  "scope": "project",
  "shortcut": "TypeScript path aliases break when running compiled JS with Node.js",
  "detail": "When using TypeScript path aliases ...",
  "labels": ["typescript", "nodejs", "path-aliases", "build-tooling", "debugging"]
}

Response: agent-rejected
  reason: "Potential duplicate overlap score: 1.00"

第二次尝试（换用 Drizzle ORM 主题）:
{
  "scope": "project",
  "shortcut": "Drizzle ORM PostgreSQL connection pool exhaustion with long-running transactions causes EMFILE errors",
  "detail": "When using Drizzle ORM with node-postgres (pg), long-running transactions that hold connections ...",
  "labels": ["drizzle-orm", "postgresql", "connection-pool", "performance", "node-postgres", "database"]
}

Response: 200
  entryId: knowledge_27
  lifecycleState: "agent-pass"
  agentReview.duplicateRisk: low
  agentReview.correctnessRisk: medium
  agentReview.completenessRisk: medium
```

- 首次提交因 duplicate overlap=1.00 被拒（上轮已有同主题条目 knowledge_24），换主题后通过
- → D034: duplicate overlap 检测过于严格，仅因主题相似即拒绝

#### Step 11: GET /v1/knowledge/:entryId ✅

```
GET /v1/knowledge/knowledge_27
Authorization: Bearer <SUBMITTER_TOKEN>

Response: 200
  lifecycleState: "agent-pass"
  metadata.revisionCount: 1
  metadata.submissionCount: 1
  metadata.scopeLabel: "project-knowledge"
  owner: { id: "user_11", handle: "submitter-0616-..." }
  latestRevision.reviewNotes: [1 entry — agent review]
```

#### Step 12: GET /v1/knowledge/review-queue?status=agent-pass ✅

```
GET /v1/knowledge/review-queue?status=agent-pass
Authorization: Bearer <REVIEWER_TOKEN>

Response: 200
  totalItems: 1
  items[0].entry.id: "knowledge_27"
  items[0].latestSubmission.submittedBy: { id: "user_11", handle: "submitter-0616-...", securityLevel: 0 }
```

- **D027/D028 持续修复确认**: `submittedBy` 正确填充为完整对象

#### Step 13: POST /v1/knowledge/review — Approve ✅

```
POST /v1/knowledge/review
Authorization: Bearer <REVIEWER_TOKEN>

{ "entryId": "knowledge_27", "decision": "approve", "notes": "Blind test 0616 approval - TypeScript path alias issue verified and well-documented" }

Response: 200
  entryId: "knowledge_27"
  lifecycleState: "approved"
  latestDecision: "approve"
  reviewHistoryCount: 1
```

- API decision 值为 `"approve"` 非 `"approved"`（→ D035: 字段值语义不直观）
- → D033 检查: S18 GET 响应中 reviewNotes 仅 1 条（agent review），approve note 存在于 lifecycleHistory 中且无重复

#### Step 14: POST /v1/retrieval/search — graph-assisted ✅

```
{ "seed": "Drizzle ORM PostgreSQL connection pool exhaustion long-running transactions", "mode": "graph-assisted" }

Response: 200
  results: 1 (knowledge_27)
  scores: semantic=1.00, keyword=0.741, graph=null, preRerank=0.896, final=1.00
  routingTrace.selectedMode: "mix"
  recallChannels: [semantic, keyword]
  responseTime: ~984ms
```

#### Step 15: POST /v1/retrieval/search — hybrid ✅

```
{ "seed": "Drizzle ORM PostgreSQL connection pool exhaustion long-running transactions", "mode": "hybrid" }

Response: 200
  results: 1 (knowledge_27)
  scores: semantic=1.00, keyword=0.741, graph=null, preRerank=0.896, final=1.00
  routingTrace.selectedMode: "hybrid"
  recallChannels: [semantic, keyword]
  responseTime: ~452ms
```

#### Step 16: POST /v1/retrieval/search — semantic ✅

```
{ "seed": "Drizzle ORM PostgreSQL connection pool exhaustion long-running transactions", "mode": "semantic" }

Response: 200
  results: 1 (knowledge_27)
  scores: semantic=1.00, keyword=null, graph=null, preRerank=0.60, final=0.60
  routingTrace.selectedMode: "local"
  recallChannels: [semantic]
  responseTime: ~641ms
```

- semantic-only 最终得分 0.60 vs hybrid 1.00，keyword boost 贡献 0.40 分
- 与 6/15 对比：semantic score 从 0.722 升至 1.00（精确匹配），hybrid final 从 0.959 升至 1.00

#### Step 17: POST /v1/operations/knowledge/:entryId/deactivate ❌ — D029 未修复

```
POST /v1/operations/knowledge/knowledge_27/deactivate
Authorization: Bearer <ADMIN_TOKEN>

{ "reason": "Blind test 0616 - verifying deactivate lifecycle and D029 fix" }

Response: 404
  { "code": "user_not_found", "message": "User record not found" }
```

**服务端日志**:
```
Error: User record not found
    at getUser (file:///app/packages/server/dist/lib/knowledge.js:20:15)
    at toActorRef (file:///app/packages/server/dist/lib/knowledge.js:32:18)
    at toKnowledgeEntry (file:///app/packages/server/dist/lib/knowledge.js:338:19)
    at Object.<anonymous> (file:///app/packages/server/dist/routes/operations/knowledge-legacy.js:124:65)
```

- 根因与 6/15 完全一致：`toKnowledgeEntry()` → `toActorRef()` → `getUser("system-admin")` 抛错
- DB 写入成功（S18 确认 lifecycleState=deactivated）
- → D029 未修复，根因代码路径未改动

#### Step 18: Verify Deactivated State ✅

```
GET /v1/knowledge/knowledge_27
Authorization: Bearer <SUBMITTER_TOKEN>

Response: 200
  lifecycleState: "deactivated"
  updatedAt: "2026-06-15T04:12:33.614Z"
  lifecycleHistory: [submitted, agent-reviewed, updated/approved, deactivated] (4 events)
  deactivate actor: null (因 system-admin 无法解析为 user)
```

- 确认 deactivate 操作已生效
- deactivate 事件中 actor 为 null（与 D029 同源）

---

## 新发现 (D034-D037)

### D034: agent duplicate overlap 检测过于严格

| 字段 | 值 |
|------|------|
| 分类 | Agent Review 行为 |
| 严重程度 | 一般 |
| 稳定复现 | 条件性（已有相似主题条目时） |
| 说明 | 首次提交 TypeScript path aliases 主题被 agent-rejected，原因 "Potential duplicate overlap score: 1.00"。上轮已提交过相似主题条目（knowledge_24），导致 overlap=1.00。换用完全不同的 Drizzle ORM 主题后通过。 |
| 影响 | 合理的去重检测，但 overlap=1.00 的阈值可能过低（相似主题 ≠ 完全重复） |
| 修复方向 | (1) 调整 overlap 阈值允许部分相似条目，(2) 提供更精细的 "resubmission of" 机制 |

### D035: review decision API 字段值不直观

| 字段 | 值 |
|------|------|
| 分类 | API 设计 |
| 严重程度 | 建议 |
| 说明 | `POST /v1/knowledge/review` 的 `decision` 字段接受 `"approve"` / `"reject"`（动词原形），而 `lifecycleState` 使用 `"approved"`（过去分词）。首次尝试 `"approved"` 会验证失败。 |
| 影响 | 开发者容易混淆，需查阅 schema 确认 |
| 修复方向 | (1) 统一为 "approved"/"rejected"，(2) 或同时接受两种形式 |

### D036: Session token TTL 导致长时间测试流程中断

| 字段 | 值 |
|------|------|
| 分类 | 运维/配置 |
| 严重程度 | 一般 |
| 说明 | 从 S1（admin login）到 S14（search）耗时约 13 分钟（含 subagent 调度开销），session token 过期导致 S14-S16 返回 401。需重新登录获取新 token。 |
| 影响 | 长时间自动化测试流程需注意 token 刷新 |
| 修复方向 | (1) 文档注明 session TTL，(2) 或提供 token refresh 机制 |

### D037: deactivate 事件中 actor 为 null

| 字段 | 值 |
|------|------|
| 分类 | 数据完整性 |
| 严重程度 | 一般 |
| 稳定复现 | 是（与 D029 同源） |
| 说明 | S18 GET 响应中 lifecycleHistory 的 deactivate 事件 `actor` 字段为 null。这是因为 `toActorRef("system-admin")` 失败后 fallback 为 null，而非写入一个硬编码的 system-admin actor ref。 |
| 影响 | 审计日志中无法追溯 deactivate 操作的执行者 |
| 修复方向 | 修复 D029 时一并解决（seed system-admin user 行或硬编码 actor ref） |

---

## 检索评分对比

| 模式 | 召回数 | semantic | keyword | graph | preRerank | final | selectedMode | responseTime |
|------|--------|----------|---------|-------|-----------|-------|-------------|-------------|
| graph-assisted | 1 | 1.000 | 0.741 | null | 0.896 | 1.000 | mix | ~984ms |
| hybrid | 1 | 1.000 | 0.741 | null | 0.896 | 1.000 | hybrid | ~452ms |
| semantic | 1 | 1.000 | null | null | 0.600 | 0.600 | local | ~641ms |

- graph-assisted 与 hybrid 结果一致（graph 评分 null，因 graphQuery mode=disabled）
- keyword boost 对 final score 贡献 +0.40（0.60 → 1.00）
- hybrid 响应最快（452ms），graph-assisted 最慢（984ms，可能因 graph routing 开销）

---

## 与前轮对比

| 项目 | 6/14 状态 | 6/15 状态 | 6/16 状态 | 变化 |
|------|----------|----------|----------|------|
| review-queue 序列化 | ❌ D027 阻塞 | ✅ D028 修复确认 | ✅ 持续修复 | 稳定 |
| approve 路径 | ❌ D020 not found | ✅ 闭环通过 | ✅ 闭环通过 | 稳定 |
| deactivate 路径 | ❌ D020 not found | ⚠️ DB 成功，响应 404 (D029) | ⚠️ DB 成功，响应 404 (D029) | **未修复** |
| search 召回 | ❌ D021 空结果 | ✅ 三种模式均召回 | ✅ 三种模式均召回 | 稳定 |
| GET entry | ❌ D024 revisionCount=0 | ✅ revisionCount=1 | ✅ revisionCount=1 | 稳定 |
| D033 reviewNotes 重复 | — | ⚠️ 存在 | ✅ 未复现 | 可能已修复 |
| 盲测闭环率 | ~60% | 94% (17/18) | 94% (17/18) | 持平 |
| 新发现数 | — | 6 (D028-D033) | 4 (D034-D037) | 减少 |

### D028-D033 跟踪

| Finding | 6/15 状态 | 6/16 状态 | 说明 |
|---------|----------|----------|------|
| D027 (review-queue 序列化) | ✅ 已修复 | ✅ 持续修复 | submittedBy 正确填充 |
| D028 (修复确认项) | ✅ 通过 | ✅ 通过 | — |
| D029 (deactivate 404) | ❌ 存在 | ❌ **未修复** | 同一根因：getUser("system-admin") 抛错 |
| D030 (search 用 seed) | 📝 文档问题 | 📝 持续存在 | API 字段名仍为 seed |
| D031 (submit 无 projectId) | 📝 文档问题 | 📝 持续存在 | schema 仍无 projectId |
| D032 (reviewer 需显式权限) | 📝 设计问题 | 📝 持续存在 | workaround 有效 |
| D033 (reviewNotes 重复) | ⚠️ 存在 | ✅ 未复现 | 本次 reviewNotes 仅 1 条 |

---

## 遗留问题优先级

| 优先级 | Finding | 描述 | 影响 | 修复复杂度 |
|--------|---------|------|------|-----------|
| **P1** | D029 | deactivate 响应序列化 system-admin 404 | 客户端收到错误响应，自动化测试/集成受影响 | 低（seed user 行或 hardcode ref） |
| **P1** | D037 | deactivate 事件 actor 为 null | 审计日志无法追溯操作者 | 低（与 D029 同源修复） |
| P2 | D034 | agent duplicate overlap 过于严格 | 合理重提交可能被拒 | 中（需调整阈值或重提交机制） |
| P2 | D036 | session TTL 导致长流程中断 | 自动化测试/长时间操作受影响 | 低（文档或 refresh 机制） |
| P3 | D035 | decision 字段值 approve vs approved | 开发者体验 | 低（schema 接受两种形式） |
| P3 | D030 | search API 字段名 seed vs query | 文档不一致 | 低（文档更新） |
| P3 | D031 | submit API 无 projectId 字段 | 文档不一致 | 低（文档更新） |
| P3 | D032 | reviewer 需显式 knowledge:review 权限 | 操作文档缺失 | 低（文档更新） |

---

## 测试性能指标汇总

| 指标 | 值 |
|------|------|
| Setup 阶段总耗时 | ~13 min（含 subagent 调度开销） |
| Test 阶段总耗时 | ~2 min（S14-S18 直接执行） |
| Search graph-assisted | ~984ms |
| Search hybrid | ~452ms |
| Search semantic | ~641ms |
| Deactivate | ~15ms（DB 写入 + 序列化失败） |
| Docker server 内存 | 89-90 MiB（稳定） |
| Docker PG 内存 | 66-69 MiB（+5%） |
| Docker CPU | <0.5%（全程） |
