# TrapMap Docker 后端重测报告 — 2026-06-16 (v2)

**测试日期**: 2026-06-16  
**测试环境**: Docker combined 模式（trapmap-server + trapmap-postgres），`http://127.0.0.1:4000`  
**测试方式**: 手动 curl 链路，fresh team (team_9)  
**测试目标**: 验证 6/15 和 6/16-v1 发现的修复情况

---

## 总览

| 指标 | 6/16-v1 | 6/16-v2 (本次) |
|------|---------|----------------|
| 通过 | 17/18 | **17/18** |
| 失败 | 1 (D029) | **1 (D029)** |
| 新发现 | 4 (D034-D037) | **4 (D038-D041)** |
| D029 状态 | 未修复 | **仍未修复** |

**结论**: D029（deactivate 以 system-admin 调用返回 404）**依然未修复**，堆栈完全相同。同时发现 API schema 有若干变更（D038-D041），部分为回归问题。

---

## 链路执行详情

### Setup 阶段

| 步骤 | 操作 | 结果 | 变更 vs 6/15 |
|------|------|------|-------------|
| S1 | system-admin 登录 | ✅ session_1037 | 无变化 |
| S2 | 创建 team | ✅ team_9 | **schema 变更**: 仅接受 `{name, description?}`，无 `slug`（→ D041） |
| S3 | 创建 submitter | ✅ member_13 | **schema 变更**: 不接受 `displayName`（→ D041） |
| S4 | 创建 reviewer | ✅ member_14 | 同上 |
| S5 | 提升 reviewer + knowledge:review | ✅ | 无变化 |
| S6 | 发行 submitter key | ✅ | 无变化 |
| S7 | 发行 reviewer key | ✅ | 无变化 |
| S8 | submitter 登录 | ✅ | 无变化 |
| S9 | reviewer 登录 | ✅ | 无变化 |

### Test 阶段

| 步骤 | 操作 | 结果 | HTTP | 关键字段 | 变更 |
|------|------|------|------|---------|------|
| S10 | 提交知识条目 | ✅ | 200 | entryId=knowledge_30, lifecycleState=agent-pass | **响应格式变更**（→ D038）；首次提交因 D034 被拒，换主题重试通过 |
| S11 | GET entry | ✅ | 200 | lifecycleState=agent-pass, revisionCount=1 | 无变化 |
| S12 | Review queue | ⚠️ | 200 | entryFound=true, **latestSubmission=null** | **D027 部分回归**（→ D039） |
| S13 | Approve | ✅ | 200 | lifecycleState=approved | **响应格式变更**（→ D038）；首次调用成功但 python 解析失败 |
| S14 | Search graph-assisted | ✅ | 200 | results=1, semantic=0.958, keyword=0.717, final=1.00 | 无变化 |
| S15 | Search hybrid | ✅ | 200 | results=1, semantic=0.958, keyword=0.717, final=1.00 | 无变化 |
| S16 | Search semantic | ✅ | 200 | results=1, semantic=0.958, final=0.575 | 无变化 |
| **S17** | **Deactivate** | **❌** | **404** | `"User record not found"` | **D029 未修复** |
| S18 | Verify deactivated | ✅ | 200 | lifecycleState=deactivated | DB 写入成功 |

---

## D029 验证结果

```
POST /v1/operations/knowledge/knowledge_30/deactivate
Authorization: Bearer <ADMIN_TOKEN>

Response: 404
  { "code": "user_not_found", "message": "User record not found" }
```

**服务端日志**（堆栈与 6/15 完全一致）:
```
Error: User record not found
    at getUser (file:///app/packages/server/dist/lib/knowledge.js:20:15)
    at toActorRef (file:///app/packages/server/dist/lib/knowledge.js:32:18)
    at toKnowledgeEntry (file:///app/packages/server/dist/lib/knowledge.js:338:19)
    at Object.<anonymous> (file:///app/packages/server/dist/routes/operations/knowledge-legacy.js:124:65)
```

**状态**: ❌ 未修复。代码路径 `knowledge.js:20` → `knowledge.js:32` → `knowledge.js:338` → `knowledge-legacy.js:124` 未改动。

---

## 新发现 (D038-D041)

### D038: 知识条目 API 响应格式变更

| 字段 | 值 |
|------|------|
| 分类 | API 变更（Breaking） |
| 严重程度 | 重要 |
| 说明 | `POST /v1/knowledge` 响应从 `{ entryId, lifecycleState, agentReview }` 变为 `{ entry: { id, lifecycleState, ... } }` 嵌套结构。`POST /v1/knowledge/review` 响应从 `{ entryId, lifecycleState, latestDecision }` 变为可能不同的格式（首次成功调用无法被旧解析器解析）。6/16-v1 的 subagent 自动适配了新格式，但 6/15 的测试脚本使用旧格式。 |
| 影响 | 现有自动化测试脚本、CLI 客户端可能因字段路径变更而中断 |
| 修复方向 | (1) 确认是否为有意变更并更新文档，(2) 如非有意，恢复旧格式或提供兼容层 |

### D039: Review queue latestSubmission 为 null（D027 部分回归）

| 字段 | 值 |
|------|------|
| 分类 | 序列化回归 |
| 严重程度 | 重要 |
| 稳定复现 | 是 |
| 说明 | 6/15 测试中 `latestSubmission.submittedBy` 正确填充为完整对象（D027 修复确认）。本次重测中 `latestSubmission` 本身为 null。可能与新的 entry（knowledge_28）有关——该 entry 由不同 team 创建，可能触发了不同的序列化路径。 |
| 影响 | reviewer 无法看到提交者信息，影响审核决策 |
| 修复方向 | 检查 knowledge_28 的 submission 记录是否存在，排查序列化条件分支 |

### D040: Approve 响应在已 approved 状态下返回 500 而非 409

| 字段 | 值 |
|------|------|
| 分类 | 错误处理 |
| 严重程度 | 一般 |
| 说明 | 对已 approved 的 entry 再次调用 approve 返回 `internal_error`（HTTP 500），错误信息为 `Invalid lifecycle transition: approved → approved`。应返回 409 Conflict 或 400 Bad Request 而非 500。 |
| 影响 | 客户端无法区分服务端内部错误和业务逻辑冲突 |
| 修复方向 | `transitionLifecycleState` 抛出的 `InvalidTransitionError` 应被路由层捕获并映射为 409 |

### D041: 创建 team/member schema 变更

| 字段 | 值 |
|------|------|
| 分类 | API 变更 |
| 严重程度 | 建议 |
| 说明 | 创建 team 不再接受 `slug` 字段（自动生成），创建 member 不再接受 `displayName` 字段。与 6/15 行为不同。 |
| 影响 | 文档和客户端需更新 |
| 修复方向 | 确认是否为有意变更并更新 API 文档 |

---

## 检索评分对比（3 次测试）

| 模式 | 6/15 semantic | 6/15 keyword | 6/15 final | 6/16-v1 semantic | 6/16-v1 final | 6/16-v2 semantic | 6/16-v2 keyword | 6/16-v2 final |
|------|-------------|------------|-----------|-----------------|--------------|-----------------|----------------|--------------|
| graph-assisted | 0.722 | 0.690 | 0.959 | 1.000 | 1.000 | 0.958 | 0.717 | 1.000 |
| hybrid | 0.722 | 0.690 | 0.959 | 1.000 | 1.000 | 0.958 | 0.717 | 1.000 |
| semantic | 0.722 | — | 0.433 | 1.000 | 0.600 | 0.958 | — | 0.575 |

- 6/16-v1 使用 Drizzle ORM 主题（与已有条目精确匹配 → semantic=1.00）
- 6/16-v2 使用 Cargo cross-compilation 主题（近义匹配 → semantic=0.958）
- semantic-only final 在 0.43-0.60 范围，keyword boost 贡献约 0.40 分

---

## 全局发现跟踪

| # | 描述 | 6/15 状态 | 6/16-v1 | 6/16-v2 | 趋势 |
|---|------|----------|---------|---------|------|
| D027 | review-queue submittedBy 序列化 | ✅ 已修复 | ✅ 修复 | ⚠️ **部分回归** (D039) | ↘ 回归 |
| D029 | deactivate system-admin 404 | ❌ 存在 | ❌ 存在 | ❌ **仍存在** | → 不变 |
| D030 | search API 用 seed 非 query | 📝 文档 | 📝 文档 | 📝 文档 | → 不变 |
| D031 | submit API 无 projectId | 📝 文档 | 📝 文档 | 📝 文档 | → 不变 |
| D032 | reviewer 需显式权限 | 📝 设计 | 📝 设计 | 📝 设计 | → 不变 |
| D033 | reviewNotes 重复 | ⚠️ 存在 | ✅ 未复现 | ✅ 未复现 | ↑ 改善 |
| D034 | duplicate overlap 过于严格 | — | ⚠️ 一般 | ⚠️ **更严重** | ↘ 恶化 |
| D035 | decision 值 approve vs approved | — | 📝 建议 | 📝 建议 | → 不变 |
| D036 | session TTL 导致长流程中断 | — | ⚠️ 一般 | ✅ 本次规避 | ↑ 改善 |
| D037 | deactivate actor 为 null | — | ⚠️ 存在 | ⚠️ **仍存在** | → 不变 |
| D038 | API 响应格式变更（Breaking） | — | — | ⚠️ **新发现** | 🆕 |
| D039 | latestSubmission null 回归 | — | — | ❌ **新发现** | 🆕 |
| D040 | approve 重复调用返回 500 | — | — | 📝 **新发现** | 🆕 |
| D041 | team/member schema 变更 | — | — | 📝 **新发现** | 🆕 |

---

## 优先级汇总

| 优先级 | Finding | 描述 | 修复建议 |
|--------|---------|------|---------|
| **P0** | D029 | deactivate system-admin 404（仍未修复） | seed system-admin user 行 或 hardcode actorRef |
| **P0** | D039 | review-queue latestSubmission null 回归 | 检查 submission 记录和序列化分支 |
| **P1** | D038 | API 响应格式 Breaking 变更 | 确认是否有意并更新文档/客户端 |
| **P1** | D034 | agent duplicate overlap 过于严格 | 调整阈值或提供 resubmission 机制 |
| P2 | D040 | approve 重复调用返回 500 | InvalidTransitionError → 409 |
| P2 | D037 | deactivate actor 为 null | 与 D029 同源修复 |
| P3 | D041 | team/member schema 变更 | 更新 API 文档 |
| P3 | D030-D032 | 文档/设计问题 | 文档更新 |
