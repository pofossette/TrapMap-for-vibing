# 客户端集成指南

## 概述

TrapMap 中的 Skill 有两种消费方式：

1. **检索 → 激活**：通过客户端检索并展示 metadata-only 结果，再按需激活具体文件
2. **物化到本地**：将激活后的 Skill 写入 Claude Code / Codex / OpenCode 等工具的技能目录

> 源码：`apps/cli/src/lib/activation-policy.ts`、`apps/cli/src/lib/artifact-bundle.ts`

## Backend Connection Model

Every external client uses one gateway URL. The optional client configuration
`backendTarget` uses the shared `@trapmap/contracts` values: `light` for
`local-agent` / `team-monolith`, and `heavy` for `distributed`. Missing or invalid
persisted values normalize to `light`.

The setting is only a target preference for diagnostics and defaults. It does not
introduce worker URLs, internal service discovery, separate authentication, or
request routing. The CLI currently persists this setting; the web-panel has no
persisted connection configuration and therefore has no selector. `heavy` remains a
transitional distributed topology, not a claim of database isolation, Kubernetes,
mTLS, independent control-plane ownership, or capability parity.

---

## Skill 工件结构

```text
<skill-slug>/
├── SKILL.md              # 核心入口（通常必须安装）
├── references/           # 较长说明或上下文材料
├── assets/               # 图片、模板、样例文件
└── scripts/              # 可执行脚本（需客户端明确允许）
```

服务端在检索阶段不返回完整文件，而是返回治理后的摘要与 `clientManifest` 元数据。客户端按需拉取所选文件，更安全也更适合智能体按需装载。

---

## 检索 → 激活流程

1. 客户端持有 TrapMap 会话或访问令牌
2. 调用检索 API 按问题内容搜索 Skill
3. 向用户或智能体展示匹配结果、capsule 和 activation hints
4. 用户确认后，调用激活接口拉取指定文件
5. 将文件写入本地技能目录或临时挂载到当前会话

检索示例：

```bash
curl -X POST http://127.0.0.1:4000/v1/retrieval/skills/search-by-content \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <token>' \
  -d '{"query": "JWT token validation", "limit": 5}'
```

CLI 激活示例：

```bash
trapmap activate \
  --artifact <artifact-id> \
  --paths SKILL.md,references/setup.md,scripts/bootstrap.sh \
  --output ./.tmp/skills/<skill-slug>
```

---

## 各客户端落地方式

### Claude Code

写入 `.claude/skills/`（项目级）或 `~/.claude/skills/`（用户级），运行时按目录发现。

```bash
# 项目级安装
mkdir -p .claude/skills
cp -R ./.tmp/skills/<skill-slug> .claude/skills/<skill-slug>

# 用户级安装
mkdir -p ~/.claude/skills
cp -R ./.tmp/skills/<skill-slug> ~/.claude/skills/<skill-slug>
```

### Codex

若支持本地技能/提示目录，写入其约定目录；若不支持，把 `SKILL.md` 与所需 `references/` 注入会话上下文。

### OpenCode / 自建智能体平台

直接保存 TrapMap 返回的工件文件，并把 `clientManifest` 作为激活策略与审计依据。

---

## 与 MCP 的关系（apps/mcp，主线 B 工作流已交付）

TrapMap 服务本体不实现 MCP 协议；agent 接入经 `apps/mcp`（`@trapmap/app-mcp`）外层封装——gateway HTTP API 仍是唯一后端数据源。

### 启动

```bash
TRAPMAP_GATEWAY_URL=http://127.0.0.1:4000 \
TRAPMAP_ACCESS_TOKEN=<token> \
pnpm --filter @trapmap/app-mcp start
```

Agent 宿主以 stdio 方式挂载该进程即可。可选：`TRAPMAP_MCP_ROLE`（viewer/contributor/reviewer/operator，默认 viewer）、`TRAPMAP_MCP_SCRIPT_POLICY`（脚本四态策略的本地收紧覆盖）。

### 工具面（10 个）

| 工具 | 最低角色 | 后端端点 | 语义约束 |
|---|---|---|---|
| trapmap_search_knowledge | viewer | POST /v1/retrieval/search | 仅元数据结果 |
| trapmap_get_skill_manifest | viewer | POST /v1/operations/artifacts/export | 内容剥离的 manifest |
| trapmap_read_skill_files | viewer | POST /v1/operations/artifacts/export | 四态激活策略客户端强制；blocked 拒绝 |
| trapmap_submit_knowledge | contributor | POST /v1/knowledge | 草稿进审核队列；无 lifecycle_state/actorId 入参 |
| trapmap_submit_skill_draft | contributor | POST /v1/operations/artifacts/import | pending review，绝不自动发布 |
| trapmap_submit_feedback | contributor | POST /v1/feedback | 结构化反馈 |
| trapmap_list_review_queue | reviewer | GET /v1/operations/artifacts/review-queue | 审核队列 |
| trapmap_get_review_detail | reviewer | GET /v1/operations/artifacts/:id/history | 历史详情 |
| trapmap_review_decision | operator | POST /v1/artifacts/review | approve/reject + note |
| trapmap_complete_remediation | operator | POST /v1/operations/feedback/remediation/:entryId/complete | 整改完成 |

角色门控 deny-by-default（`apps/mcp/src/permissions.ts`）；每次调用输出一行脱敏审计 JSON 到 stderr（工具名/correlationId/耗时/outcome）。gateway 权限模型仍是最终边界。

---

## Activation Policy 四状态模型

脚本执行策略从严格到宽松排列：

| 策略 | 说明 |
|------|------|
| `blocked` | 完全禁止，不可读也不可执行 |
| `reference-only` | 可读取但不可执行 |
| `needs-approval` | 需要用户明确批准后才可执行 |
| `client-executable` | 无需额外确认即可执行 |

> 源码：`apps/cli/src/lib/activation-policy.ts`

### 策略解析规则

客户端计算有效策略时，始终取**更严格**的那个：

```
effective = min(serverDefault, localOverride)
```

- 客户端只能收紧策略，不能放松
- 若无本地覆盖，使用服务端默认值
- 服务端返回 `client-executable`，客户端覆盖为 `blocked` → 有效策略为 `blocked`
- 服务端返回 `needs-approval`，客户端覆盖为 `client-executable` → 有效策略仍为 `needs-approval`

---

## 客户端集成最佳实践

- 检索阶段只消费元数据、capsule 和摘要，不默认拉全量文件
- 依据 `clientManifest` 的 `references`、`assets`、`scripts` 生成"下一步操作"提示
- 对 `scripts` 严格执行 allowlist 或人工确认策略，不要自动执行未知脚本
- 把已激活的文件缓存到本地，减少重复下载和重复上下文注入
