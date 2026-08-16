# TrapMap CLI 参考

本文档记录当前 `apps/cli` 实现出来的命令面。更细的行为以 `trapmap <command> --help` 和 `@trapmap/contracts` 为准。

## 基本规则

- 可执行名：`trapmap`
- 全局选项只有 Commander 默认项：`--help`、`--version`
- 没有全局 `--url`、`--output`、`--no-color`
- 机器可读输出由命令级 `--json` 或本地 `output profile` 控制
- 命令是否出现取决于当前 session 权限；`api:list` 输出的是当前进程实际注册出来的命令树

## 信息与输出配置

| 命令 | 用途 |
|------|------|
| `trapmap about` | 显示 CLI / server / contracts 包边界 |
| `trapmap api:list` | 输出当前实际注册的命令面 |
| `trapmap output profile show` | 查看本地输出配置 |
| `trapmap output profile set --tool <tool> [--model <hint>] [--verbosity <level>] [--graph-plan-mode <mode>]` | 设置本地输出配置 |

`output profile set` 支持的值：

- `--tool`: `generic` / `claude-code` / `codex` / `opencode`
- `--model`: `generic` / `claude`
- `--verbosity`: `compact` / `balanced` / `detailed`
- `--graph-plan-mode`: `summary` / `skill-list` / `full`

## 认证

| 命令 | 参数 |
|------|------|
| `trapmap login` | `--access-key <key>` 或 `--system-admin-key <key>`；可选 `--server <gateway-url>`、`--json` |
| `trapmap logout` | 可选 `--json` |
| `trapmap session` | 可选 `--json` |

说明：

- CLI 的正式接入模型是 `gateway only`
- CLI 只在 `login` 上支持 `--server <gateway-url>`，并把值写入本地状态文件中的单一 gateway URL
- CLI 不支持按命令或按后端 service unit 配置多个远端地址
- 本地状态可保存 `backendTarget: "light" | "heavy"`：`light` 对应 `local-agent` / `team-monolith`，`heavy` 对应 `distributed`
- 缺省或非法的旧 `backendTarget` 会回退为 `light`；该偏好只用于提示、诊断和 registry 定义的默认行为，不能改变 `gatewayUrl`、认证或内部服务发现
- web-panel 没有持久化连接配置，因而没有对应的 selector；CLI 是当前唯一持久化此偏好的客户端
- 认证缺失时，CLI 会提示 `trapmap login`
- `logout` 会始终清理本地 session；远端不可达时仍会清本地状态

## 团队与成员

| 命令 | 参数 |
|------|------|
| `trapmap team list` | 可选 `--json` |
| `trapmap team select <teamId>` | 可选 `--json` |
| `trapmap team create <name>` | 可选 `--description <text>`、`--json` |
| `trapmap member create <handle>` | `--team <teamId>`；可选 `--role <role>`、`--note <text>`、`--json` |
| `trapmap member update <memberId>` | 可选 `--level <n>`、`--note <text>`、`--permission <name...>`、`--json` |
| `trapmap access-key:create <memberId>` | `--team <teamId>`；可选 `--note <text>`、`--json` |

注意：

- 没有 `member key:create`
- 没有 `member create --password`
- 访问密钥是给现有 member 签发，不是给 username 直接生成

## 知识条目顶层命令

TrapMap 当前没有 `knowledge` 命令组。知识条目命令是顶层命令：

| 命令 | 参数 |
|------|------|
| `trapmap submit` | `--scope <global|project>`、`--label <label>`、`--shortcut <text>`；可选 `--detail <text>`、`--file <path>`、`--stdin`、`--required-level <n>`、`--boundary <json>`、`--json` |
| `trapmap resubmit <entryId>` | `--label <label>`、`--shortcut <text>`；可选 `--detail <text>`、`--file <path>`、`--stdin`、`--boundary <json>`、`--json` |
| `trapmap supersede <entryId>` | `--replacement <entryId>`；可选 `--json` |
| `trapmap review-status [entryId]` | 可选 `--json` |

说明：

- `--label` 是 repeatable 选项
- `detail` 可直接传文本，也可来自 `--file` 或 `--stdin`
- `boundary` 必须是合法 JSON

## Trap 命令

Trap 命令是知识条目命令的 trap 别名/包装层：

| 命令 | 参数 |
|------|------|
| `trapmap trap submit` | `--scope <global|project>`、`--label <label>`、`--shortcut <text>`；可选 `--detail <text>`、`--file <path>`、`--stdin`、`--required-level <n>`、`--boundary <json>`、`--json` |
| `trapmap trap resubmit <entryId>` | `--label <label>`、`--shortcut <text>`；可选 `--detail <text>`、`--file <path>`、`--stdin`、`--boundary <json>`、`--json` |
| `trapmap trap list` | 可选 `--json` |
| `trapmap trap show <entryId>` | 可选 `--json` |

## 检索与加载

| 命令 | 参数 |
|------|------|
| `trapmap search [seed]` | 可选 `--label <label>`、`--scope <scope>`、`--max-results <n>`、`--no-refinement`、`--summary`、`--mode <semantic|hybrid|graph-assisted>`、`--stdin`、`--json`、`--v2` |
| `trapmap load [seed]` | 可选 `--scope <scope>`、`--label <label>`、`--skill-budget <n>`、`--max-depth <n>`、`--fallback <auto|v2-capsule|v1-graph-assisted>`、`--stdin`、`--json` |
| `trapmap skill search-by-content <text>` | 可选 `--max-results <n>`、`--json` |

注意：

- `search` 使用 `--max-results`，不是 `--limit`
- `load` 调的是 `/v3/retrieval/search`，输出 GraphPlan/agent context
- `load` 未提供 seed 时会要求参数或 `--stdin`

## 审核

知识审核命令使用冒号分隔，而不是空格子命令：

| 命令 | 参数 |
|------|------|
| `trapmap review:queue` | 可选 `--status <state>`、`--json` |
| `trapmap review:approve <entryId>` | `--notes <text>`；可选 `--boundary <json>`、`--source-type <type>`、`--source-ref <ref>`、`--evidence-level <level>`、`--json` |
| `trapmap review:reject <entryId>` | `--notes <text>`；可选 `--boundary <json>`、`--source-type <type>`、`--source-ref <ref>`、`--evidence-level <level>`、`--json` |

Evidence 枚举值与 contracts 一致：

- `source-type`: `internal-experience` / `incident` / `doc` / `code` / `external-reference`
- `evidence-level`: `anecdotal` / `reproduced` / `documented` / `verified-in-prod`

## 运维命令

| 命令 | 参数 |
|------|------|
| `trapmap list` | 可选 `--scope <scope>`、`--state <states>`、`--max-level <n>`、`--owner <userId>`、`--json` |
| `trapmap edit <entryId>` | 见 `apps/cli/src/commands/operations/edit.ts`；支持 `--json` |
| `trapmap deactivate <entryId>` | `--reason <text>`；可选 `--json` |
| `trapmap export` | 可选 `--team <teamId>`、`--include-history`、`--output <path>`、`--json` |
| `trapmap import` | `--file <path>`、`--level <n>`；可选 `--json` |
| `trapmap activate` | `--artifact <artifactId>`、`--paths <csv>`；可选 `--revision <n>`、`--output <path>`、`--json` |
| `trapmap artifact-export` | `--artifact <artifactId>`；可选 `--format <bundle-json|distilled-json|skill-dir>`、`--output <path>`、`--json` |
| `trapmap migrate` | 旧知识迁移运维入口；支持 `--json` |
| `trapmap status` | 可选 `--team <teamId>`、`--json` |
| `trapmap capsule-index rebuild` | 可选 `--mode <full|artifact>`、`--artifact-id <id>`、`--json` |
| `trapmap capsule-index health` | 可选 `--json` |
| `trapmap capsule-index cleanup-orphans` | 可选 `--json` |

## Skill 工件命令

| 命令 | 参数 |
|------|------|
| `trapmap skill find [fingerprint]` | 可选 `--json` |
| `trapmap skill apply <candidateId>` | 可选 `--json` |
| `trapmap skill edit <artifactId>` | 工件编辑入口；支持 `--json` |
| `trapmap skill history <artifactId>` | 可选 `--json` |
| `trapmap skill versions <artifactId>` | 查看 semver 版本与修订历史（revision/version/submittedAt/submittedBy/sourceHash）；可选 `--json` |
| `trapmap skill review:queue` | 可选 `--json` |
| `trapmap skill review:approve <artifactId>` | 审核工件；可选 `--json` |
| `trapmap skill review:reject <artifactId>` | 审核工件；可选 `--json` |
| `trapmap skill duplicate-job fetch <candidateId>` | 可选 `--json` |
| `trapmap skill duplicate-job resolve <candidateId>` | `--decision <independent|merged>`、`--notes <text>`；当 `decision=merged` 时额外要求 `--merged-with <entityId>`、`--merged-type <trap|skill>`；可选 `--json` |
| `trapmap skill duplicate-job apply-resolution <candidateId>` | 应用人工结果；可选 `--json` |

## 反馈、审计、维护、衰减、策略

| 命令 | 参数 |
|------|------|
| `trapmap feedback <entryId>` | 提交反馈；支持 `--json` |
| `trapmap feedback-list` | 管理员反馈列表；支持 `--json` |
| `trapmap feedback-batch` | 管理员批量反馈操作；支持 `--json` |
| `trapmap audit` | 可选 `--action <action>`、`--actor <userId>`、`--entity <entityId>`、`--from <iso>`、`--to <iso>`、`--limit <n>`、`--json` |
| `trapmap admin:evidence` | evidence 审计列表；支持 `--json` |
| `trapmap evidence:update <entryId>` | evidence 更新；支持 `--json` |
| `trapmap decay-stale` | decay 列表入口；支持 `--json` |
| `trapmap decay-batch` | decay 批量操作；支持 `--json` |
| `trapmap decay-search <pattern>` | decay 搜索；支持 `--json` |
| `trapmap maintenance-list` | 维护列表；支持 `--json` |
| `trapmap maintenance-assign` | 分配 maintainer；支持 `--json` |
| `trapmap maintenance-verify` | 标记已验证；支持 `--json` |
| `trapmap policy resolve` | 激活策略解析；支持 `--json` |

## 定时任务（cron）命令

| 命令 | 参数 |
|------|------|
| `trapmap cron list` | 列出全部 cron job；可选 `--json` |
| `trapmap cron add` | 新增 cron job；`--name <name>`、`--schedule <expr>`、`--task-type <type>`；可选 `--timezone <tz>`（默认 `UTC`）、`--payload-json <json>`、`--enabled <true\|false>`（默认 `true`）、`--json` |
| `trapmap cron edit <jobId>` | 编辑 cron job；`--name`/`--schedule`/`--timezone`/`--task-type`/`--payload-json`/`--enabled` 均为可选（任意子集）；可选 `--json` |
| `trapmap cron pause <jobId>` | 暂停 cron job（等价于 edit 置 `enabled=false`）；可选 `--json` |
| `trapmap cron resume <jobId>` | 恢复 cron job（等价于 edit 置 `enabled=true`）；可选 `--json` |
| `trapmap cron trigger <jobId>` | 手动立即执行一次（enqueue 对应 task，不推进下次调度）；可选 `--json` |
| `trapmap cron status` | 全部 cron job 状态快照；可选 `--json` |

说明：

- 命令面以 `packages/service-cron` 提供的网关路由为准：GET/POST `/v1/cron/jobs`、GET/PATCH/DELETE `/v1/cron/jobs/:id`、POST `/v1/cron/jobs/:id/trigger`、GET `/v1/cron/status`；monolith（host-local Nest）与 distributed gateway 暴露同一 `/v1/cron/*` 面
- 输出文本中 `nextRunAt`/`lastRunAt` 渲染为 UTC 人类可读时间（`YYYY-MM-DD HH:mm UTC`）；`--json` 输出保留 contracts 原始形状
- `cron add` 成功后会打印下一次调度预览（`Next run: ...`）
- `cron edit` 的 `--schedule` 变更必须同时提供 `--timezone`（与 `cronJobUpdateInputSchema` 一致，CLI 会在发送前本地校验）
- `--enabled` 只接受 `true`/`false`；`--payload-json` 必须是合法 JSON 对象（与 `cronJobCreateInputSchema` 的 `payload` 形状一致）

示例：

```bash
trapmap cron add \
  --name daily-digest \
  --schedule '0 9 * * *' \
  --timezone Asia/Shanghai \
  --task-type digest \
  --payload-json '{"channel":"slack"}'
trapmap cron list
trapmap cron pause cron_1
trapmap cron resume cron_1
trapmap cron trigger cron_1
trapmap cron status --json
```

## 输出约定

- 大多数用户命令都提供 `--json`
- `--json` 输出保留 contracts 形状；错误输出也会走结构化 JSON
- 文本输出可通过 `output profile` 切换到 `generic`、`codex`、`claude-code`、`opencode` 渲染模式

## 真值来源

- CLI 注册入口：`apps/cli/src/index.ts`
- 具体命令：`apps/cli/src/commands/`
- 输出策略：`apps/cli/src/lib/output.ts`
- 契约：`packages/contracts/src/`
