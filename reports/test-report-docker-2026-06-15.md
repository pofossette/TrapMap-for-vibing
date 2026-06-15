# TrapMap Docker 后端盲测报告 — 2026-06-15

**测试日期**: 2026-06-15  
**测试环境**: Docker combined 模式（trapmap-server + trapmap-postgres），`http://127.0.0.1:4000`  
**测试方式**: Subagent-Driven Development — fresh subagent 执行完整 API 链路  
**测试目标**: 使用 fresh team_3 验证知识生命周期全闭环  
**前置条件**: 6/13-6/14 已修复 Dockerfile 打包、migration journal、PG repo 路径、system-admin FK 等阻塞问题

---

## 总览

| 指标 | 数值 |
|------|------|
| 链路步骤总数 | 18（9 setup + 9 test） |
| 通过 | 17 |
| 失败 | 1（deactivate 响应序列化，DB 写入已成功） |
| 新发现 | 6（D028-D033） |
| 阻塞性问题 | 1（D029 — deactivate 响应对 system-admin 返回 404） |
| 重试次数 | 0（首次 submit 即进入 agent-pass） |

**结论**: 知识生命周期主链路 submit → agent-pass → GET entry → review-queue → approve → search(graph-assisted/hybrid/semantic) → deactivate 已闭环通过。唯一残留缺陷是 deactivate 以 system-admin 调用时响应序列化返回 404（操作实际写入 DB 成功）。

---

## 测试环境状态

```
容器状态:
  trapmap-server   Up (healthy)  [4000]
  trapmap-postgres  Up (healthy)  [5434]

/health 响应:
  status: ok
  liveness: alive
  readiness: ready
  queueWorker: running
  outboxWorker: running
  graphQuery: disabled (backend=memory)
```

---

## 链路执行详情

### Setup 阶段

| 步骤 | 操作 | 结果 | 备注 |
|------|------|------|------|
| S1 | system-admin 登录 | ✅ | session_1023 |
| S2 | 创建 team | ✅ | team_4（slug: blind-test-team-3，team_3 已被占用） |
| S3 | 创建 submitter | ✅ | member_7 (blind-submitter-3) |
| S4 | 创建 reviewer | ✅ | member_8 (blind-reviewer-3) |
| S5 | 提升 reviewer securityLevel=2 | ✅ | |
| S6 | 发行 submitter access-key | ✅ | ssr_key_0w4ML2b... |
| S7 | 发行 reviewer access-key | ✅ | ssr_key_oimSjDv... |
| S8 | submitter 登录 | ✅ | session_1025 |
| S9 | reviewer 登录（+ 显式授予 knowledge:review） | ✅ | session_1026 |

**Setup 期间发现的 API 差异**:
- `PATCH /v1/members/:id` 提升 securityLevel 不自动授予 `knowledge:review` 权限，需显式添加到 permissions 数组（→ D032）

### Test 阶段

#### Step 10: Submit Knowledge Entry → agent-pass ✅

```
POST /v1/knowledge
Authorization: Bearer <SUBMITTER_TOKEN>

{
  "scope": "project",
  "shortcut": "Docker container fails to start when bind mount path contains spaces",
  "detail": "When using Docker bind mounts on Linux, if the host path contains spaces
    (e.g. /home/user/my projects/app), the container fails to start with 'invalid
    reference format'. The fix is to either quote the path in docker-compose.yml or
    use named volumes instead. Verified on Docker 24.0.7 and docker-compose v2.21.0.",
  "labels": ["docker", "container", "bind-mount", "debugging"]
}

Response: 200
  entry.id: knowledge_24
  entry.lifecycleState: "agent-pass"
  agentReview.notes: "Submission lacks strong fix/explanation evidence markers."
  agentReview.duplicateRisk: low
  agentReview.correctnessRisk: medium
```

- 首次提交即通过 agent review，无需重试
- API schema 不接受 `projectId` 字段（→ D031）

#### Step 11: GET /v1/knowledge/:entryId ✅

```
GET /v1/knowledge/knowledge_24
Authorization: Bearer <SUBMITTER_TOKEN>

Response: 200
  metadata.revisionCount: 1
  metadata.scopeLabel: "project-knowledge"
  metadata.submissionCount: 1
  history: [1 revision]
  lifecycleHistory: [submitted, agent-reviewed]
  submissionHistory: [1 submission]
```

- 与 D024 对比：此前 `revisionCount` 被序列化为 0，现已修复

#### Step 12: GET /v1/knowledge/review-queue?status=agent-pass ✅

```
GET /v1/knowledge/review-queue?status=agent-pass
Authorization: Bearer <REVIEWER_TOKEN>

Response: 200
  items: [1 item — knowledge_24]
  items[0].entry.id: "knowledge_24"
  items[0].latestSubmission.submittedBy: { id: "user_7", handle: "blind-submitter-3", ... }
  total: 1
```

- **D027 修复确认**: `latestSubmission.submittedBy` 正确填充为完整对象，此前报告的 `expected object, received undefined` 不再复现（→ D028）

#### Step 13: POST /v1/knowledge/review — Approve ✅

```
POST /v1/knowledge/review
Authorization: Bearer <REVIEWER_TOKEN>

{
  "entryId": "knowledge_24",
  "decision": "approved",
  "notes": "Blind test approval - verified Docker bind mount issue is reproducible"
}

Response: 200
  entry.lifecycleState: "approved"
  entry.metadata.latestDecision: "approve"
  evidence.sourceType: "internal-experience"
  evidence.evidenceLevel: "anecdotal"
  lifecycleHistory: [submitted → agent-pass → approved] (3 events)
```

- evidence metadata 由服务端自动补齐（D019 修复确认）
- reviewNotes 出现重复条目（→ D033）

#### Step 14: POST /v1/retrieval/search — graph-assisted ✅

```
POST /v1/retrieval/search
Authorization: Bearer <SUBMITTER_TOKEN>

{ "seed": "Docker container bind mount space path fails", "mode": "graph-assisted" }

Response: 200
  results: 1 (knowledge_24 recalled)
  scores: semantic=0.722, keyword=0.690, graph=null, preRerank=0.709, final=0.9594
  routingTrace.selectedMode: "mix"
  recallChannels: [semantic, keyword]
```

- API 字段名为 `seed` 非 `query`（→ D030）
- graph 评分为 null（graphQuery mode=disabled）

#### Step 15: POST /v1/retrieval/search — hybrid ✅

```
{ "seed": "Docker container bind mount space path fails", "mode": "hybrid" }

Response: 200
  results: 1 (knowledge_24)
  final score: 0.9594
  routingTrace.selectedMode: "hybrid"
  recallChannels: [semantic, keyword]
```

#### Step 16: POST /v1/retrieval/search — semantic ✅

```
{ "seed": "Docker container bind mount space path fails", "mode": "semantic" }

Response: 200
  results: 1 (knowledge_24)
  final score: 0.4333
  routingTrace.selectedMode: "local"
  recallChannels: [semantic]
```

- semantic-only 模式得分显著低于 hybrid/graph-assisted（0.43 vs 0.96），keyword boost 效果明显

#### Step 17: POST /v1/operations/knowledge/:entryId/deactivate ⚠️

```
POST /v1/operations/knowledge/knowledge_24/deactivate
Authorization: Bearer <ADMIN_TOKEN>

{ "reason": "Blind test - verifying deactivate lifecycle" }

Response: 404
  { "code": "user_not_found", "message": "User record not found" }
```

**服务端日志**:
```
Error: User record not found
    at getUser (knowledge.js:20)
    at toActorRef (knowledge.js:32)
    at toKnowledgeEntry (knowledge.js:338)
```

**但 lifecycle audit 日志记录**:
```
Lifecycle audit: knowledge.deactivated (approved → deactivated)
  actorId: "system-admin"
  entryId: "knowledge_24"
  timestamp: 2026-06-15T02:42:37.312Z
```

- **DB 写入成功，响应序列化失败**
- 根因：`toKnowledgeEntry()` 调用 `getUser("system-admin")`，system-admin 是虚拟账户无 users 表行
- → D029

#### Step 18: Verify Deactivated State ✅

```
GET /v1/knowledge/knowledge_24
Authorization: Bearer <SUBMITTER_TOKEN>

Response: 200
  lifecycleState: "deactivated"
  lifecycleHistory: [submitted, agent-reviewed, updated/approved, deactivated] (4 events)
  deactivation timestamp: 2026-06-15T02:42:36.938Z
```

- 确认 deactivate 操作已生效，即使 Step 17 返回 404

---

## 新发现 (D028-D033)

### D028: review-queue 序列化缺口已修复（通过项）

| 字段 | 值 |
|------|------|
| 分类 | 通过项（D027 修复确认） |
| 严重程度 | 无 |
| 说明 | `latestSubmission.submittedBy` 正确填充，review-queue 对 agent-pass 条目响应完整 |

### D029: deactivate 响应序列化对 system-admin 返回 404

| 字段 | 值 |
|------|------|
| 分类 | 服务端序列化 Bug |
| 严重程度 | 重要 |
| 稳定复现 | 是 |
| 根因 | `getUser("system-admin")` 在 users 表无对应行，`toActorRef()` 抛错 |
| 影响 | deactivate 操作实际成功，但客户端收到 404 错误响应 |
| 修复方向 | (1) users 表 seed system-admin 行（与 D017 一致），或 (2) `toActorRef()` 对 system-admin 返回硬编码 ref |

### D030: retrieval/search API 字段名为 `seed` 非 `query`

| 字段 | 值 |
|------|------|
| 分类 | API 文档问题 |
| 严重程度 | 建议 |
| 说明 | `/v1/retrieval/search` 请求 schema 要求 `seed` 字段，文档/客户端若使用 `query` 将验证失败 |

### D031: 知识提交 API 不接受 `projectId`

| 字段 | 值 |
|------|------|
| 分类 | API 文档问题 |
| 严重程度 | 建议 |
| 说明 | `POST /v1/knowledge` schema 无 `projectId`，project 范围由 `scope:"project"` + session active team 决定 |

### D032: securityLevel 提升不自动授予 `knowledge:review`

| 字段 | 值 |
|------|------|
| 分类 | 权限模型设计 |
| 严重程度 | 一般 |
| 说明 | `user` roleTemplate 默认不含 `knowledge:review`；提升 securityLevel 到 2 不改变权限集，需显式添加 |

### D033: approve 响应中 reviewNotes 重复

| 字段 | 值 |
|------|------|
| 分类 | 数据质量 Bug |
| 严重程度 | 一般 |
| 稳定复现 | 是 |
| 说明 | approve note 以相同 ID 写入两次（`6a967bf4-...`），疑似 INSERT 去重缺陷 |

---

## 检索评分对比

| 模式 | 召回数 | 最终得分 | semantic | keyword | graph | selectedMode |
|------|--------|----------|----------|---------|-------|-------------|
| graph-assisted | 1 | 0.9594 | 0.722 | 0.690 | null | mix |
| hybrid | 1 | 0.9594 | 0.722 | 0.690 | null | hybrid |
| semantic | 1 | 0.4333 | 0.722 | null | null | local |

- graph-assisted 与 hybrid 结果一致（graph 评分 null，因 graphQuery mode=disabled）
- semantic-only 得分显著低于 hybrid（0.43 vs 0.96），keyword boost 贡献约 0.53 分

---

## 与前轮对比

| 项目 | 6/14 状态 | 6/15 状态 | 变化 |
|------|----------|----------|------|
| review-queue 序列化 | ❌ D027 阻塞 | ✅ D028 修复确认 | 已修复 |
| approve 路径 | ❌ D020 not found | ✅ 闭环通过 | 已修复 |
| deactivate 路径 | ❌ D020 not found | ⚠️ DB 成功，响应 404 (D029) | 部分修复 |
| search 召回 | ❌ D021 空结果 | ✅ 三种模式均召回 | 已修复 |
| GET entry | ❌ D024 revisionCount=0 | ✅ revisionCount=1 | 已修复 |
| 盲测闭环率 | ~60% | 94% (17/18) | +34% |

---

## 遗留问题优先级

| 优先级 | Finding | 描述 | 影响 |
|--------|---------|------|------|
| P1 | D029 | deactivate 响应序列化 system-admin 404 | 客户端收到错误响应 |
| P2 | D033 | reviewNotes 重复写入 | 数据冗余 |
| P3 | D032 | reviewer 需显式 knowledge:review 权限 | 操作文档缺失 |
| P3 | D030 | search API 字段名 seed vs query | 文档不一致 |
| P3 | D031 | submit API 无 projectId 字段 | 文档不一致 |
