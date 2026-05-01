# TrapMap CLI 参考

## 概述

TrapMap CLI 是基于 Commander.js 的命令行客户端，用于与 TrapMap 服务器交互。

## 安装

```bash
# 使用 npm
npm install -g @trapmap/cli

# 或使用 pnpm
pnpm add -g @trapmap/cli

# 或在本 monorepo 中直接从源码运行
pnpm --filter @trapmap/cli dev -- --help
```

## 全局选项

| 选项 | 描述 |
|------|------|
| `--help` | 显示帮助 |
| `--version` | 显示版本 |
| `--url <url>` | API 服务器地址 (默认 http://localhost:4000) |
| `--output <format>` | 输出格式: `table`, `json`, `yaml` (默认 `table`) |
| `--no-color` | 禁用颜色输出 |

---

## 认证命令

### `trapmap login`

用户名密码登录。

```bash
trapmap login <username> <password>
```

**示例**:
```bash
trapmap login alice@example.com mypassword
```

**输出**:
```
✓ Logged in as alice@example.com
  Role: contributor | Level: 1
```

---

### `trapmap login --access-key`

使用访问密钥登录。

```bash
trapmap login --access-key <key>
```

**示例**:
```bash
trapmap login --access-key ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### `trapmap logout`

登出。

```bash
trapmap logout
```

**输出**:
```
✓ Logged out successfully
```

---

### `trapmap session`

显示当前会话状态。

```bash
trapmap session
```

**输出**:
```
Session Info:
  User:     alice@example.com
  Role:     admin
  Level:    10
  Expires:  2026-05-07 12:00:00
  Team:     Platform Team (active)
```

---

## 团队命令

### `trapmap team create`

创建新团队。

```bash
trapmap team create <name> [--description <description>]
```

**示例**:
```bash
trapmap team create "Platform Team" --description "Core platform devs"
```

**输出**:
```
✓ Team created: Platform Team (team-xxx)
```

---

### `trapmap team list`

列出所有团队。

```bash
trapmap team list
```

**输出**:
```
Teams:
  NAME              ID          MEMBERS
  Platform Team     team-xxx    5
  Security Team     team-yyy    3
```

---

### `trapmap team select`

切换活动团队。

```bash
trapmap team select <teamId>
```

**示例**:
```bash
trapmap team select team-xxx
```

**输出**:
```
✓ Active team: Platform Team
```

---

## 成员命令

### `trapmap member create`

创建成员。

```bash
trapmap member create --username <username> --password <password> [--role <role>] [--level <level>]
```

**示例**:
```bash
trapmap member create \
  --username bob@example.com \
  --password securepass \
  --role contributor \
  --level 1
```

**选项**:
- `--role`: 角色 (viewer, contributor, reviewer, admin)
- `--level`: 安全等级 (0-10)
- `--team`: 团队 ID

**输出**:
```
✓ Member created: bob@example.com
  ID: member-xxx | Role: contributor | Level: 1
```

---

### `trapmap member update`

更新成员。

```bash
trapmap member update <memberId> [--role <role>] [--level <level>]
```

**示例**:
```bash
trapmap member update member-xxx --role reviewer --level 5
```

**输出**:
```
✓ Member updated: member-xxx
  New role: reviewer | New level: 5
```

---

## 知识命令

### `trapmap knowledge submit`

提交新知识条目。

```bash
trapmap knowledge submit --title <title> --content <content> [--format <format>] [--level <level>]
```

**示例**:
```bash
trapmap knowledge submit \
  --title "OAuth2 Setup Guide" \
  --content "$(cat oauth2-guide.md)" \
  --format markdown \
  --level 2
```

**选项**:
- `--title, -t`: 必填，标题
- `--content, -c`: 必填，内容
- `--format, -f`: 格式 (markdown, json, yaml)，默认 markdown
- `--level, -l`: 安全等级 (0-10)，默认 0
- `--team`: 团队 ID

**输出**:
```
✓ Knowledge submitted: entry-xxx
  Title: OAuth2 Setup Guide
  State: submitted
```

---

### `trapmap knowledge resubmit`

重新提交被拒绝的条目。

```bash
trapmap knowledge resubmit <entryId> --content <content>
```

**示例**:
```bash
trapmap knowledge resubmit entry-xxx --content "$(cat updated-guide.md)"
```

**输出**:
```
✓ Knowledge resubmitted: entry-xxx
  State: submitted
```

---

### `trapmap knowledge inspect`

查看知识条目详情。

```bash
trapmap knowledge inspect <entryId>
```

**示例**:
```bash
trapmap knowledge inspect entry-xxx
```

**输出**:
```
Knowledge Entry: entry-xxx
──────────────────────────────
Title:      OAuth2 Setup Guide
Format:     markdown
Level:      2
State:      approved
Created:    2026-04-30 12:00:00
Updated:    2026-04-30 14:00:00

Created by: alice@example.com
Approved by: bob@example.com

Review History:
  • 2026-04-30 14:00:00 - approved by bob@example.com
    Notes: "Well documented"

Index State:
  ✓ vector - synced
  ✓ keyword - synced
  ✓ graph - synced
```

---

### `trapmap knowledge list`

列出知识条目。

```bash
trapmap knowledge list [--state <state>] [--limit <limit>] [--mine]
```

**示例**:
```bash
trapmap knowledge list --state approved --limit 20
trapmap knowledge list --mine
```

**选项**:
- `--state, -s`: 状态过滤 (draft, submitted, approved, rejected)
- `--limit, -l`: 数量限制
- `--mine, -m`: 仅显示自己的条目

**输出**:
```
Knowledge Entries:
  ID          TITLE                    STATE       LEVEL   CREATED
  entry-xxx   OAuth2 Setup Guide      approved    2       2026-04-30
  entry-yyy   JWT Validation           approved    1       2026-04-29
  entry-zzz   Database Migration       submitted   3       2026-04-28

Showing 3 of 15 entries
```

---

## 陷阱命令

### `trapmap trap create`

创建陷阱。

```bash
trapmap trap create --name <name> --description <description>
```

**示例**:
```bash
trapmap trap create \
  --name "Requires HTTPS" \
  --description "This feature requires HTTPS to be enabled"
```

---

### `trapmap trap list`

列出陷阱。

```bash
trapmap trap list [--limit <limit>]
```

**示例**:
```bash
trapmap trap list
```

**输出**:
```
Traps:
  ID          NAME                USAGE
  trap-xxx    Requires HTTPS      5
  trap-yyy    Needs Auth Provider 3
```

---

### `trapmap trap get`

获取陷阱详情。

```bash
trapmap trap get <trapId>
```

---

## 检索命令

### `trapmap search`

执行 v1 检索（基于条目）。

```bash
trapmap search <query> [--mode <mode>] [--limit <limit>]
```

**示例**:
```bash
trapmap search "how to configure authentication" --mode semantic
trapmap search "OAuth2 setup" --mode hybrid --limit 10
```

**选项**:
- `--mode, -m`: 检索模式 (semantic, hybrid, graph-assisted)，默认 semantic
- `--limit, -l`: 结果数量，默认 10

**输出**:
```
Search Results (semantic):
  SCORE  TITLE                    SNIPPET
  0.92   OAuth2 Setup Guide       "...configure OAuth2 with Auth0..."
  0.87   JWT Validation Guide     "...validate JWT tokens properly..."
  0.78   Auth Middleware Setup    "...set up auth middleware..."

Showing 3 results
```

---

### `trapmap search:v2`

执行 v2 胶囊检索。

```bash
trapmap search:v2 <query> [--limit <limit>]
```

**示例**:
```bash
trapmap search:v2 "OAuth2 authentication setup"
```

**输出**:
```
Capsule Results:
  NAME                    CONTENT                    HINT
  OAuth2 Provider Setup  "To set up OAuth2..."    "Use when implementing..."
  JWT Validation Steps    "1. Parse token..."       "Use when validating..."

Showing 2 capsules
```

---

### `trapmap search:plan`

生成陷阱优先计划（v3）。

```bash
trapmap search:plan <query>
```

**示例**:
```bash
trapmap search:plan "add OAuth2 to new service"
```

**输出**:
```
Plan: trap-xxx (confidence: 0.82)

Traps:
  1. Requires HTTPS          (priority: 1)
  2. Needs Auth Provider    (priority: 2)

Skills:
  → HTTPS Setup Guide       [blocks: Requires HTTPS]
  → Auth0 Integration      [blocks: Needs Auth Provider]

Citations:
  • entry-xxx: "Production OAuth2 requires valid HTTPS..."
```

---

### `trapmap search:skills`

按内容搜索技能。

```bash
trapmap search:skills <query> [--limit <limit>]
```

---

## 审核命令

### `trapmap review queue`

查看待审核队列。

```bash
trapmap review queue [--limit <limit>]
```

**示例**:
```bash
trapmap review queue --limit 10
```

**输出**:
```
Review Queue:
  ID          TITLE               SUBMITTED BY    SUBMITTED AT
  entry-xxx   OAuth2 Guide        alice          2026-04-30 12:00
  entry-yyy   JWT Validation       charlie        2026-04-30 11:00

Showing 2 items
```

---

### `trapmap review approve`

批准知识条目。

```bash
trapmap review approve <entryId> [--notes <notes>]
```

**示例**:
```bash
trapmap review approve entry-xxx --notes "Well documented"
```

**输出**:
```
✓ Entry approved: entry-xxx
  State changed: agent-pass → approved
```

---

### `trapmap review reject`

拒绝知识条目。

```bash
trapmap review reject <entryId> --notes <notes>
```

**示例**:
```bash
trapmap review reject entry-xxx --notes "Missing authentication provider details"
```

**输出**:
```
✓ Entry rejected: entry-xxx
  State changed: agent-pass → rejected
```

---

## 操作命令

### `trapmap import`

导入知识条目。

```bash
trapmap import <file> [--format <format>] [--skip-duplicates]
```

**示例**:
```bash
trapmap import ./knowledge-export.json
trapmap import ./knowledge.yaml --format yaml --skip-duplicates
```

**选项**:
- `--format, -f`: 文件格式 (json, yaml)，默认根据扩展名
- `--skip-duplicates`: 跳过重复条目

**输出**:
```
Importing from ./knowledge-export.json...
✓ Imported 15 entries
  • 15 created
  • 0 skipped (duplicates)
  • 0 errors
```

---

### `trapmap export`

导出知识条目。

```bash
trapmap export [--file <file>] [--format <format>] [--filter <filter>]
```

**示例**:
```bash
trapmap export --file ./export.json --format json
trapmap export --filter '{"level":{"lte":3}}'
```

**输出**:
```
Exporting entries...
✓ Exported 15 entries to ./export.json
```

---

### `trapmap audit`

查看审计日志。

```bash
trapmap audit [--limit <limit>] [--actor <actorId>] [--type <eventType>]
```

**示例**:
```bash
trapmap audit --limit 50
trapmap audit --actor user-xxx --type knowledge.approved
```

**输出**:
```
Audit Log:
  TIMESTAMP           TYPE                 ACTOR              RESOURCE
  2026-04-30 14:00    knowledge.approved   bob@example.com    entry-xxx
  2026-04-30 13:00    knowledge.submitted  alice@example.com  entry-yyy
  2026-04-30 12:00    auth.login           alice@example.com  -

Showing 50 recent entries
```

---

## 访问密钥命令

### `trapmap access-key create`

创建访问密钥。

```bash
trapmap access-key create --name <name> [--expires <days>] [--permissions <perms>]
```

**示例**:
```bash
trapmap access-key create --name "CI Key" --expires 90 \
  --permissions knowledge:submit,knowledge:search
```

**输出**:
```
✓ Access key created: CI Key (key-xxx)

⚠️  Save this key - it will not be shown again:
   ak_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Expires: 2026-07-29
Permissions: knowledge:submit, knowledge:search
```

---

## 高级用法

### 输出格式

使用 `--output` 全局选项指定输出格式：

```bash
# 表格输出（默认）
trapmap knowledge list --output table

# JSON 输出
trapmap knowledge list --output json

# YAML 输出
trapmap knowledge list --output yaml
```

### 管道操作

```bash
# 获取 JSON 并用 jq 处理
trapmap search "OAuth2" --output json | jq '.results[0].title'

# 导出到文件
trapmap export > ./backup.json

# 批量操作
cat entries.txt | while read id; do trapmap knowledge inspect $id; done
```

### 配置

CLI 配置存储在 `~/.trapmap/config.json`:

```json
{
  "serverUrl": "http://localhost:4000",
  "defaultOutput": "table",
  "color": true,
  "session": {
    "id": "session-xxx",
    "expiresAt": "2026-05-07T12:00:00Z"
  }
}
```

### 环境变量

```bash
# 设置默认服务器
export TRAPMAP_SERVER_URL=http://localhost:4000

# 设置 API 密钥
export TRAPMAP_API_KEY=ak_xxxxxxxxxxxx
```

---

## 退出码

| 退出码 | 描述 |
|--------|------|
| 0 | 成功 |
| 1 | 一般错误 |
| 2 | 认证错误 (未登录或会话过期) |
| 3 | 权限不足 |
| 4 | 资源不存在 |
| 5 | 验证错误 |
