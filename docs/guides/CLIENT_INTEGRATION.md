# 客户端集成指南

> 状态：Active。你照这页把外部客户端接到 TrapMap 网关。

## 概述

Skill 有两种消费方式：

1. **检索后激活**：客户端检索 metadata-only 结果，按需拉取文件
2. **物化到本地**：把激活后的 Skill 写入 Claude Code、Codex、OpenCode 等工具的技能目录

## 网关连接模型

外部客户端只连一个网关地址。可选的客户端配置 `backendTarget` 取共享 `@trapmap/contracts` 值：`local-agent` 与 `team-monolith` 对应 `light`，`distributed` 对应 `heavy`。缺失或非法值归一到 `light`。

这个配置只是诊断与默认值用的目标偏好，不引入 worker 地址、内部服务发现、独立认证或请求路由。CLI 持久化它，web-panel 没有持久化连接配置，所以没有选择器。`heavy` 是过渡中的分布式拓扑，不代表数据库隔离、Kubernetes、mTLS、独立控制面或能力对等。

## Skill 工件结构

```text
<skill-slug>/
├── SKILL.md              # 核心入口
├── references/           # 较长说明或上下文材料
├── assets/               # 图片、模板、样例文件
└── scripts/              # 可执行脚本，需客户端明确允许
```

服务端检索阶段只返回治理后的摘要与 `clientManifest` 元数据。客户端按需拉取所选文件（源码见 `apps/cli/src/lib/artifact-bundle.ts`），减少上下文注入，也更安全。

## 检索到激活流程

你需要一个运行中的网关加有效 token，下面命令都依赖这两样。

1. 客户端持有 TrapMap 会话或访问令牌
2. 按问题内容调检索 API 搜 Skill
3. 向用户或智能体展示匹配结果、capsule 与 activation hints
4. 用户确认后调激活接口拉取指定文件
5. 写入本地技能目录或挂载到当前会话

```bash
curl -X POST http://127.0.0.1:4000/v1/retrieval/skills/search-by-content \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <token>' \
  -d '{"text": "JWT token validation", "maxResults": 5}'
```

```bash
trapmap activate \
  --artifact <artifact-id> \
  --paths SKILL.md,references/setup.md,scripts/bootstrap.sh \
  --output ./.tmp/skills/<skill-slug>
```

## 各客户端落地方式

### Claude Code

写入 `.claude/skills/`（项目级）或 `~/.claude/skills/`（用户级），运行时按目录发现。

```bash
mkdir -p .claude/skills
cp -R ./.tmp/skills/<skill-slug> .claude/skills/<skill-slug>

mkdir -p ~/.claude/skills
cp -R ./.tmp/skills/<skill-slug> ~/.claude/skills/<skill-slug>
```

### Codex

支持本地技能目录就写入约定目录，不支持就把 `SKILL.md` 与所需 `references/` 注入会话上下文。

### OpenCode 或自建智能体平台

直接保存 TrapMap 返回的工件文件，把 `clientManifest` 当激活策略与审计依据。

## 与 MCP 的关系

TrapMap 服务本体不实现 MCP 协议，agent 经 `apps/mcp`（`@trapmap/app-mcp`）外层封装接入，网关 HTTP API 仍是唯一后端数据源。

### 启动

需要网关地址与 token，`start` 脚本存在于 `apps/mcp/package.json`。

```bash
TRAPMAP_GATEWAY_URL=http://127.0.0.1:4000 \
TRAPMAP_ACCESS_TOKEN=<token> \
pnpm --filter @trapmap/app-mcp start
```

Agent 宿主以 stdio 挂载该进程。可选：`TRAPMAP_MCP_ROLE`（viewer、contributor、reviewer、operator，默认 viewer）、`TRAPMAP_MCP_SCRIPT_POLICY`（脚本四态策略的本地收紧覆盖）。

### 工具面（11 个）

| 工具 | 最低角色 | 后端端点 | 语义约束 |
|---|---|---|---|
| trapmap_search_knowledge | viewer | POST /v1/retrieval/search | 只返回元数据 |
| trapmap_search_experience_genes | viewer | POST /v1/retrieval/genes/search | 结构化 Gene 响应，不带 validator 内部或 source 正文 |
| trapmap_get_skill_manifest | viewer | POST /v1/operations/artifacts/export | 内容剥离后的 manifest |
| trapmap_read_skill_files | viewer | POST /v1/operations/artifacts/export | 四态激活策略客户端强制，blocked 拒绝 |
| trapmap_submit_knowledge | contributor | POST /v1/knowledge | 草稿进审核队列 |
| trapmap_submit_skill_draft | contributor | POST /v1/operations/artifacts/import | pending review，不自动发布 |
| trapmap_submit_feedback | contributor | POST /v1/feedback | 结构化反馈 |
| trapmap_list_review_queue | reviewer | GET /v1/operations/artifacts/review-queue | 审核队列 |
| trapmap_get_review_detail | reviewer | GET /v1/operations/artifacts/:id/history | 历史详情 |
| trapmap_review_decision | operator | POST /v1/artifacts/review | approve 或 reject 加备注 |
| trapmap_complete_remediation | operator | POST /v1/operations/feedback/remediation/:entryId/complete | 整改完成 |

角色门控 deny-by-default，每次调用向 stderr 输出一行脱敏审计 JSON（工具名、correlationId、耗时、outcome）。网关权限模型仍是最终边界。

## 四状态激活策略

从严到宽：`blocked`、`reference-only`、`needs-approval`、`client-executable`。源码见 `apps/cli/src/lib/activation-policy.ts`。

客户端算有效策略时永远取更严的一边：

```text
effective = min(serverDefault, localOverride)
```

客户端只能收紧，不能放松。服务端给 `client-executable` 而本地覆盖 `blocked`，有效策略是 `blocked`。

## 客户端集成最佳实践

- 检索阶段只消费元数据、capsule 与摘要，不默认拉全量文件
- 按 `clientManifest` 的 `references`、`assets`、`scripts` 生成下一步操作提示
- `scripts` 走 allowlist 或人工确认，不自动执行未知脚本
- 已激活文件缓存在本地，少重复下载与重复注入
