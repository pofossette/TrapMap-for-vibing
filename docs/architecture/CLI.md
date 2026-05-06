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

---

## 信息命令

### `trapmap about`

显示项目信息。

```bash
trapmap about
```

**输出**:
```
Skill Shareer prototype
- packages/cli: imperative user-facing terminal commands
- packages/server: Fastify API and LangChain-oriented service boundary
- packages/contracts: shared Zod schemas and runtime-safe contracts
```

---

### `trapmap api:list`

列出当前可用的 CLI 命令。

```bash
trapmap api:list
```

**输出**:
```
about
api:list
login
logout
session
team list
team select
...
```

---

### `trapmap --version`

显示 CLI 版本。

```bash
trapmap --version
```

**输出**:
```
0.1.0
```

---

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

### `trapmap trap submit`

提交新陷阱。

```bash
trapmap trap submit --scope <scope> --label <label> --shortcut <text> [--detail <text>]
```

**示例**:
```bash
trapmap trap submit \
  --scope global \
  --label auth \
  --label security \
  --shortcut "Requires HTTPS" \
  --detail "This feature requires HTTPS to be enabled for secure authentication"
```

**选项**:
- `--scope`: 范围 (global 或 project)
- `--label`: 标签（可多次使用）
- `--shortcut, -s`: 一行陷阱描述
- `--detail, -d`: 详细描述
- `--file <path>`: 从文件读取详细描述
- `--stdin`: 从 stdin 读取详细描述
- `--required-level <n>`: 所需安全等级
- `--boundary <json>`: 边界约束（JSON 格式）
- `--json`: 输出 JSON 格式

**输出**:
```
Submitted entry-xxx
Lifecycle: submitted
Shortcut: Requires HTTPS
```

---

### `trapmap trap resubmit`

重新提交被拒绝的陷阱。

```bash
trapmap trap resubmit <entryId> --label <label> --shortcut <text> [--detail <text>]
```

**示例**:
```bash
trapmap trap resubmit entry-xxx \
  --label auth \
  --shortcut "Requires HTTPS (updated)" \
  --detail "Updated description with more details"
```

**输出**:
```
Resubmitted entry-xxx
Lifecycle: submitted
Revision: 2
```

---

### `trapmap trap list`

列出自己提交的陷阱。

```bash
trapmap trap list [--json]
```

**输出**:
```
entry-xxx [approved]
Scope: global
Required level: 2
Owner: alice@example.com
Labels: auth, security
Shortcut: Requires HTTPS
History: 1 revision(s)
```

---

### `trapmap trap show`

查看陷阱详情。

```bash
trapmap trap show <entryId> [--json]
```

**示例**:
```bash
trapmap trap show entry-xxx
```

---

## 检索命令

### `trapmap search`

执行检索。默认为 v1 检索（基于条目），使用 `--v2` 启用胶囊检索。

```bash
trapmap search <query> [--mode <mode>] [--limit <limit>] [--v2]
```

**示例**:
```bash
# v1 检索（基于条目）
trapmap search "how to configure authentication" --mode semantic
trapmap search "OAuth2 setup" --mode hybrid --limit 10

# v2 胶囊检索
trapmap search "OAuth2 authentication setup" --v2
```

**选项**:
- `--mode, -m`: 检索模式 (semantic, hybrid, graph-assisted)，默认 semantic
- `--limit, -l`: 结果数量，默认 10
- `--v2`: 使用胶囊原生 v2 检索
- `--label <label>`: 按标签过滤
- `--scope <scope>`: 按范围过滤 (global 或 project)
- `--no-refinement`: 禁用 LLM 细化
- `--summary`: 启用摘要生成
- `--stdin`: 从 stdin 读取搜索种子
- `--json`: 输出 JSON 格式

**v1 输出**:
```
Search Results (semantic):
  SCORE  TITLE                    SNIPPET
  0.92   OAuth2 Setup Guide       "...configure OAuth2 with Auth0..."
  0.87   JWT Validation Guide     "...validate JWT tokens properly..."
  0.78   Auth Middleware Setup    "...set up auth middleware..."

Showing 3 results
```

**v2 输出**:
```
Capsules:
  capsule-xxx
  Artifact: artifact-xxx
  Situation: Setting up OAuth2 authentication
  Problem: Missing provider configuration
  Goal: Complete OAuth2 setup
  Labels: auth, oauth2
  Scope: global (level 2)
  Score: 0.92
  Reason: semantic match

Showing 2 capsules
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

### `trapmap list`

列出知识条目。

```bash
trapmap list [--scope <scope>] [--state <state>] [--max-level <n>] [--owner <userId>] [--json]
```

**示例**:
```bash
# 列出所有全局条目
trapmap list --scope global

# 列出已批准的条目
trapmap list --state approved
```

**选项**:
- `--scope <scope>`: 按范围过滤 (global 或 project)
- `--state <state>`: 按生命周期状态过滤（逗号分隔）
- `--max-level <n>`: 过滤安全等级小于等于指定值的条目
- `--owner <userId>`: 按所有者过滤
- `--json`: 输出 JSON 格式

**输出**:
```
entry-xxx [approved] - OAuth2 Setup Guide (level 2)
entry-yyy [approved] - JWT Validation (level 1)
entry-zzz [submitted] - Database Migration (level 3)

Showing 3 entries
```

---

### `trapmap import`

导入知识条目或技能工件。

```bash
trapmap import --file <path> --level <n> [--json]
```

**示例**:
```bash
# 导入 JSON 文件
trapmap import --file ./knowledge-export.json --level 2

# 导入 SKILL.md 文件
trapmap import --file ./my-skill/SKILL.md --level 3

# 导入技能目录
trapmap import --file ./my-skill/ --level 3
```

**选项**:
- `--file <path>`: JSON 文件、SKILL.md 文件或技能目录路径
- `--level <n>`: 导入条目的安全等级
- `--json`: 输出 JSON 格式

**输出**:
```
Imported 15 artifacts, failed 0
  ✓ OAuth2 Setup Guide: OK
  ✓ JWT Validation: OK
```

---

### `trapmap export`

导出知识条目。

```bash
trapmap export [--team <teamId>] [--include-history] [--output <path>] [--json]
```

**示例**:
```bash
# 导出到 stdout
trapmap export

# 导出到文件
trapmap export --output ./export.json

# 仅导出特定团队的条目
trapmap export --team team-xxx --output ./team-export.json
```

**选项**:
- `--team <teamId>`: 按团队 ID 过滤（使用 "null" 表示全局条目）
- `--include-history`: 包含提交和审核历史，默认 true
- `--output <path>`: 输出到文件
- `--json`: 输出 JSON 格式

**输出**:
```
Exported 15 entries at 2026-05-06T12:00:00Z
```

---

### `trapmap artifact-export`

导出技能工件。

```bash
trapmap artifact-export --artifact <artifactId> [--format <format>] [--output <path>] [--json]
```

**示例**:
```bash
# 导出为 JSON
trapmap artifact-export --artifact artifact-xxx --format bundle-json

# 导出为技能目录
trapmap artifact-export --artifact artifact-xxx --format skill-dir --output ./my-skill
```

**选项**:
- `--artifact <artifactId>`: 工件 ID
- `--format <format>`: 导出格式 (bundle-json, distilled-json, skill-dir)，默认 bundle-json
- `--output <path>`: 输出目录（skill-dir 格式必填）
- `--json`: 输出 JSON 格式

---

### `trapmap edit`

编辑知识条目。

```bash
trapmap edit <entryId> [--shortcut <text>] [--detail <text>] [--labels <labels>] [--required-level <n>] [--json]
```

**示例**:
```bash
trapmap edit entry-xxx --shortcut "Updated shortcut" --labels auth,security
```

**选项**:
- `--shortcut <text>`: 更新快捷描述
- `--detail <text>`: 更新详细描述
- `--labels <labels>`: 更新标签（逗号分隔）
- `--required-level <n>`: 更新所需安全等级
- `--json`: 输出 JSON 格式

**输出**:
```
Updated entry-xxx
Lifecycle: approved
Revision: 2
```

---

### `trapmap deactivate`

停用知识条目。

```bash
trapmap deactivate <entryId> --reason <text> [--json]
```

**示例**:
```bash
trapmap deactivate entry-xxx --reason "No longer applicable to current architecture"
```

**选项**:
- `--reason <text>`: 停用原因（1-500 字符）
- `--json`: 输出 JSON 格式

**输出**:
```
Deactivated entry-xxx
Lifecycle: deactivated
```

---

### `trapmap activate`

激活工件（获取并物化文件）。

```bash
trapmap activate --artifact <artifactId> --paths <paths> [--revision <n>] [--output <path>] [--json]
```

**示例**:
```bash
# 激活特定文件
trapmap activate --artifact artifact-xxx --paths references/guide.md,assets/config.yaml --output ./my-skill
```

**选项**:
- `--artifact <artifactId>`: 工件 ID
- `--paths <paths>`: 要获取的文件路径（逗号分隔）
- `--revision <n>`: 特定版本号，默认最新
- `--output <path>`: 输出目录
- `--json`: 输出 JSON 格式

**输出**:
```
Activated artifact: OAuth2 Setup Guide
Artifact ID: artifact-xxx
Revision: 1
Files fetched: 2
Activated at: 2026-05-06T12:00:00Z
```

---

### `trapmap status`

查看迁移和兼容性状态。

```bash
trapmap status [--team <teamId>] [--json]
```

**示例**:
```bash
trapmap status
trapmap status --team team-xxx
```

**选项**:
- `--team <teamId>`: 按团队 ID 过滤
- `--json`: 输出 JSON 格式

**输出**:
```
Legacy entries: 100
Migrated: 50
Unmigrated: 50
Total artifacts: 75
  - skill-directory: 30
  - single-skill-md: 20
  - legacy-knowledge: 25
Coexistence active: true
Sunset ready: false
```

---

### `trapmap migrate`

迁移遗留知识条目到技能工件。

```bash
trapmap migrate [--entries <ids> | --all-approved | --all-team <teamId>] [--limit <n>] [--json]
```

**示例**:
```bash
# 迁移指定条目
trapmap migrate --entries entry-xxx,entry-yyy

# 迁移所有已批准条目
trapmap migrate --all-approved --limit 50

# 迁移特定团队的所有条目
trapmap migrate --all-team team-xxx
```

**选项**:
- `--entries <ids>`: 指定迁移的条目 ID（逗号分隔）
- `--all-approved`: 迁移所有已批准条目
- `--all-team <teamId>`: 迁移特定团队的所有条目
- `--limit <n>`: 最大迁移数量，默认 50
- `--json`: 输出 JSON 格式

**输出**:
```
Migrated 2 entries, skipped 0, failed 0
Remaining legacy entries: 98
  ✓ entry-xxx: artifact-xxx
  ✓ entry-yyy: artifact-yyy
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

## Evidence 命令

### `trapmap admin:evidence`

按 evidence 状态列出知识条目。

```bash
trapmap admin:evidence [--level <level>] [--missing] [--json]
```

**示例**:
```bash
# 列出所有 evidence 为 verified-in-prod 的条目
trapmap admin:evidence --level verified-in-prod

# 列出缺少 evidence 的条目
trapmap admin:evidence --missing
```

**选项**:
- `--level <level>`: 按 evidence 级别过滤 (verified-in-prod, documented, reproduced, anecdotal)
- `--missing`: 仅显示缺少 evidence 的条目
- `--json`: 输出 JSON 格式

**输出**:
```
entry-xxx [approved] - OAuth2 Setup Guide | Evidence: verified-in-prod (incident)
entry-yyy [approved] - JWT Validation | Evidence: documented (doc)
entry-zzz [approved] - Database Migration | Evidence: (none)
```

---

### `trapmap evidence:update`

更新知识条目的 evidence 元数据。

```bash
trapmap evidence:update <entryId> [--level <level>] [--type <type>] [--ref <ref>]
```

**示例**:
```bash
trapmap evidence:update entry-xxx \
  --level verified-in-prod \
  --type incident \
  --ref "INC-12345"
```

**选项**:
- `--level <level>`: Evidence 级别 (anecdotal, reproduced, documented, verified-in-prod)
- `--type <type>`: 来源类型 (internal-experience, incident, doc, code, external-reference)
- `--ref <ref>`: 来源引用

**输出**:
```
Evidence updated: verified-in-prod | incident
```

---

## Feedback 命令

### `trapmap feedback`

报告知识条目问题。

```bash
trapmap feedback <entryId> [--type <type>] [--description <text>] [--context <text>]
```

**示例**:
```bash
# 交互式反馈
trapmap feedback entry-xxx

# 非交互式反馈
trapmap feedback entry-xxx \
  --type outdated \
  --description "This guide refers to deprecated API v1" \
  --context "Trying to set up OAuth2 for new service"
```

**选项**:
- `--type <type>`: 问题类型 (incorrect, outdated, context-mismatch, incomplete, other)
- `--description <text>`: 问题描述（至少 10 个字符）
- `--context <text>`: 可选上下文
- `--entry-type <type>`: 条目类型 (trap 或 skill)，默认 trap
- `--query-seed <text>`: 导致此条目的检索查询
- `--json`: 输出 JSON 格式

**输出**:
```
Feedback submitted: feedback-xxx
Entry: entry-xxx (trap)
Problem: outdated
Status: new
```

---

### `trapmap feedback-list`

管理员列出反馈队列。

```bash
trapmap feedback-list [--status <statuses>] [--type <types>] [--limit <n>] [--json]
```

**示例**:
```bash
# 列出所有新反馈
trapmap feedback-list --status new

# 列出所有过时类型的反馈
trapmap feedback-list --type outdated --limit 50
```

**选项**:
- `--status <statuses>`: 按状态过滤（逗号分隔: new, triaged, resolved, dismissed）
- `--type <types>`: 按问题类型过滤（逗号分隔: incorrect, outdated, context-mismatch, incomplete, other）
- `--entry <id>`: 按条目 ID 过滤
- `--entry-type <type>`: 按条目类型过滤 (trap 或 skill)
- `--min-age <days>`: 最小天数
- `--max-age <days>`: 最大天数
- `--limit <n>`: 最大返回数量，默认 25
- `--json`: 输出 JSON 格式

**输出**:
```
Found 15 feedback items

feedback-xxx  [new]  5d  OAuth2 Setup Guide - Requires HTTPS  outdated
feedback-yyy  [triaged]  10d  JWT Validation - Token expiry  incorrect
```

---

### `trapmap feedback-batch`

管理员批量处理反馈。

```bash
trapmap feedback-batch --action <action> --ids <ids> [--notes <notes>] [--dry-run]
```

**示例**:
```bash
# 解决反馈
trapmap feedback-batch --action resolve --ids feedback-xxx,feedback-yyy --notes "Fixed in PR #123"

# 干运行预览
trapmap feedback-batch --action dismiss --ids feedback-zzz --dry-run
```

**选项**:
- `--action <action>`: 操作 (resolve, dismiss, triage, transition)
- `--ids <ids>`: 反馈 ID（逗号分隔）
- `--notes <text>`: 管理员备注
- `--transition-target <state>`: 目标生命周期状态（用于 transition 操作）
- `--dry-run`: 预览变更但不应用
- `--json`: 输出 JSON 格式

**输出**:
```
Action: resolve
Eligible: 2, Ineligible: 0
Applied at: 2026-05-06T12:00:00Z

✓ feedback-xxx
✓ feedback-yyy
```

---

## Decay 命令

### `trapmap decay-stale`

按 decay 状态列出知识条目。

```bash
trapmap decay-stale [--state <states>] [--age-min <days>] [--age-max <days>] [--limit <n>] [--json]
```

**示例**:
```bash
# 列出所有过期条目
trapmap decay-stale --state expired

# 列出超过 90 天的条目
trapmap decay-stale --age-min 90
```

**选项**:
- `--state <states>`: 按 decay 状态过滤（逗号分隔: active, review-due, stale, expired, superseded）
- `--age-min <days>`: 最小天数
- `--age-max <days>`: 最大天数
- `--label <labels>`: 按标签过滤（逗号分隔）
- `--scope <scope>`: 按范围过滤 (global 或 project)
- `--limit <n>`: 最大返回数量，默认 25
- `--json`: 输出 JSON 格式

**输出**:
```
Found 10 entries

entry-xxx  [stale]  120d  OAuth2 Setup Guide - Requires HTTPS [auth, security]
entry-yyy  [review-due]  95d  JWT Validation - Token expiry [auth]
```

---

### `trapmap decay-batch`

批量操作 decay 条目。

```bash
trapmap decay-batch --action <action> --entries <ids> [--extend-days <n>] [--dry-run]
```

**示例**:
```bash
# 延长条目生命周期
trapmap decay-batch --action extend --entries entry-xxx,entry-yyy --extend-days 30

# 标记为需要审核
trapmap decay-batch --action mark-review --entries entry-zzz
```

**选项**:
- `--action <action>`: 操作 (extend, mark-review, deactivate, supersede)
- `--entries <ids>`: 条目 ID（逗号分隔）
- `--extend-days <n>`: 延长天数（用于 extend 操作）
- `--replacement <id>`: 替换条目 ID（用于 supersede 操作）
- `--dry-run`: 预览变更但不应用
- `--json`: 输出 JSON 格式

**输出**:
```
Action: extend
Eligible: 2, Ineligible: 0
Applied at: 2026-05-06T12:00:00Z

✓ entry-xxx: Extended by 30 days
✓ entry-yyy: Extended by 30 days
```

---

### `trapmap decay-search`

搜索带 decay 状态的条目。

```bash
trapmap decay-search [pattern] [--state <states>] [--limit <n>] [--json]
```

**示例**:
```bash
# 搜索包含 "OAuth" 的条目
trapmap decay-search "OAuth"

# 搜索特定状态的条目
trapmap decay-search --state stale,expired
```

**选项**:
- `--state <states>`: 按 decay 状态过滤（逗号分隔）
- `--label <labels>`: 按标签过滤（逗号分隔）
- `--scope <scope>`: 按范围过滤
- `--limit <n>`: 最大返回数量，默认 25
- `--json`: 输出 JSON 格式

---

## Maintenance 命令

### `trapmap maintenance-list`

列出需要维护关注的条目。

```bash
trapmap maintenance-list [--missing-owner] [--overdue] [--stale] [--limit <n>] [--json]
```

**示例**:
```bash
# 列出缺少维护者的条目
trapmap maintenance-list --missing-owner

# 列出逾期未审核的条目
trapmap maintenance-list --overdue

# 列出验证过期的条目
trapmap maintenance-list --stale --stale-days 90
```

**选项**:
- `--missing-owner`: 过滤无维护者的条目
- `--overdue`: 过滤审核逾期的条目
- `--stale`: 过滤验证过期的条目
- `--stale-days <n>`: 验证过期阈值天数
- `--scope <scope>`: 按范围过滤
- `--label <labels>`: 按标签过滤（逗号分隔）
- `--limit <n>`: 最大返回数量，默认 25
- `--json`: 输出 JSON 格式

**输出**:
```
Found 5 entries

entry-xxx  [alice]  [2026-04-01]  OAuth2 Setup Guide - Requires HTTPS
entry-yyy  [unassigned]  [none]  JWT Validation - Token expiry
```

---

### `trapmap maintenance-assign`

分配维护者。

```bash
trapmap maintenance-assign --entries <ids> --owner <userId> [--dry-run] [--json]
```

**示例**:
```bash
trapmap maintenance-assign --entries entry-xxx,entry-yyy --owner user-123
```

**选项**:
- `--entries <ids>`: 条目 ID（逗号分隔）
- `--owner <userId>`: 新维护者的用户 ID
- `--owner-handle <handle>`: 新维护者的 handle
- `--dry-run`: 预览变更但不应用
- `--json`: 输出 JSON 格式

**输出**:
```
Action: assign-owner
Eligible: 2, Ineligible: 0
Applied at: 2026-05-06T12:00:00Z

✓ entry-xxx: owner=user-123
✓ entry-yyy: owner=user-123
```

---

### `trapmap maintenance-verify`

标记条目为已重新验证。

```bash
trapmap maintenance-verify --entries <ids> [--extend-days <n>] [--dry-run] [--json]
```

**示例**:
```bash
trapmap maintenance-verify --entries entry-xxx,entry-yyy --extend-days 90
```

**选项**:
- `--entries <ids>`: 条目 ID（逗号分隔）
- `--extend-days <n>`: 延长审核期限天数，默认 90
- `--dry-run`: 预览变更但不应用
- `--json`: 输出 JSON 格式

**输出**:
```
Action: mark-verified
Eligible: 2, Ineligible: 0
Applied at: 2026-05-06T12:00:00Z

✓ entry-xxx: verifiedAt=2026-05-06, reviewBy=2026-08-04
✓ entry-yyy: verifiedAt=2026-05-06, reviewBy=2026-08-04
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
