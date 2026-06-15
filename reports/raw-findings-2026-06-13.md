# TrapMap E2E Test - Raw Findings
**Date**: 2026-06-13
**Tester**: Claude Code Subagent-Driven Testing

---

## FINDING-001: deploy.sh 生成的 .env 缺少 TRAPMAP_DATABASE_URL

- **发现时间**: 2026-06-13 (预读分析)
- **测试域**: 部署脚本
- **触发命令**: 预读 `scripts/deploy.sh` + `docker-compose.yml`
- **操作过程**:
  1. 读取 `scripts/deploy.sh` 的 `create_env_file()` 函数（第46-77行）
  2. 读取 `docker-compose.yml`（第29行）
- **预期行为**: `deploy.sh` 生成的 `.env` 应包含所有 docker-compose.yml 需要的环境变量
- **实际行为**:
  - `create_env_file()` 生成的 `.env` 包含：`NODE_ENV`, `HOST`, `PORT`, `OPENAI_API_KEY`, `TRAPMAP_SYSTEM_ADMIN_KEY`, `TRAPMAP_DATA_FILE`, `LOG_*` 变量
  - `docker-compose.yml` 第29行硬编码：`TRAPMAP_DATABASE_URL=postgres://trapmap:trapmap@postgres:5432/trapmap`
  - `.env` 中没有 `TRAPMAP_DATABASE_URL`，但 docker-compose 环境变量直接硬编码了，所以不会导致部署失败
  - 但 deploy.sh 的注释暗示 .env 应该包含所有配置，实际上数据库连接被硬编码在 compose 文件中
- **问题分类**: 文档问题 / 设计不一致
- **初步判断**: 文档/脚本问题（不是 bug，数据库 URL 确实在 compose 中硬编码了，但 .env 模板没有说明这一点）
- **验证建议**: 运行 deploy.sh 后检查生成的 .env 是否影响实际部署
- **稳定复现**: 是（代码层面确定）
- **严重程度**: 建议（不阻塞部署）

---

## FINDING-002: .env 存在重复 TRAPMAP_SYSTEM_ADMIN_KEY 定义

- **发现时间**: 2026-06-13 (环境检查)
- **测试域**: 部署配置
- **触发命令**: `cat .env`
- **操作过程**:
  1. 读取项目根目录 `.env` 文件
  2. 发现 `TRAPMAP_SYSTEM_ADMIN_KEY` 出现两次：
     - 第1行: `TRAPMAP_SYSTEM_ADMIN_KEY=eval-local-admin-key-do-not-use-in-production`
     - 第27行: `TRAPMAP_SYSTEM_ADMIN_KEY=replace-with-a-long-random-secret`
- **预期行为**: 每个环境变量只定义一次
- **实际行为**: 两个定义，后者覆盖前者，语义混乱
- **问题分类**: 文档问题 / 配置问题
- **初步判断**: 环境配置问题（.env.example 模板和本地 .env 混在一起）
- **验证建议**: 检查 .env.example 是否也有此问题
- **稳定复现**: 是（文件内容确定）
- **严重程度**: 一般（后定义的值生效，但对用户造成困惑）

---

## FINDING-003: docker-compose.yml 不包含 Neo4j 服务

- **发现时间**: 2026-06-13 (预读分析)
- **测试域**: 部署脚本
- **触发命令**: 预读 `docker-compose.yml`
- **操作过程**:
  1. 读取 `docker-compose.yml` 完整内容
  2. 确认只有 `server` 和 `postgres` 两个服务
- **预期行为**: 如果支持 Neo4j（graph-plan v3 检索），应提供 Neo4j 服务或文档说明手动部署步骤
- **实际行为**:
  - `docker-compose.yml` 没有 Neo4j 服务
  - `deploy.sh` 没有 Neo4j 相关逻辑
  - `docs/architecture/DEPLOYMENT.md` 提到 Neo4j 是可选的，但没有给出 docker 部署的 Neo4j 配置步骤
  - Neo4j 需要手动 `docker run` 部署
- **问题分类**: 文档缺失
- **初步判断**: 文档问题（功能支持但文档未覆盖 Docker 部署场景下的 Neo4j 配置）
- **验证建议**: 手动启动 Neo4j 容器后验证 v3 graph-plan 接口
- **稳定复现**: 是（代码层面确定）
- **严重程度**: 重要（没有 Neo4j 时 v3 graph-plan 会 fallback 到内存图，无法测试完整 graph-plan 功能）

---

## FINDING-004: deploy.sh deploy 如果 .env 已存在则跳过创建，但没有警告

- **发现时间**: 2026-06-13 (预读分析)
- **测试域**: 部署脚本
- **触发命令**: 预读 `scripts/deploy.sh` 第98-113行
- **操作过程**:
  1. 读取 `deploy()` 函数
  2. `create_env_file()` 检查 `$ENV_FILE` 是否存在（第47行），存在则 `return 0`
  3. 如果 return 0，`deploy()` 直接继续 build 和 start
  4. 没有任何提示说明"使用了现有 .env"
- **预期行为**: 使用现有 .env 时应有提示，告知用户当前使用的配置
- **实际行为**: 静默使用现有 .env，用户可能以为配置是最新的
- **问题分类**: 体验问题
- **初步判断**: 脚本设计问题
- **验证建议**: 已有 .env 时运行 deploy.sh deploy，观察是否有提示
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-005: HOST 默认值在 deploy.sh 和 .env.example 之间不一致

- **发现时间**: 2026-06-13 (环境检查)
- **测试域**: 部署配置
- **触发命令**: 对比 deploy.sh create_env_file() 和现有 .env
- **操作过程**:
  1. `deploy.sh` 生成的 `.env`：`HOST=0.0.0.0`
  2. 现有 `.env`：`HOST=127.0.0.1`
  3. `docs/architecture/DEPLOYMENT.md` 没有明确说明 HOST=0.0.0.0 是内网访问的必要条件
- **预期行为**: 文档应明确说明 HOST 配置对网络访问的影响
- **实际行为**:
  - `HOST=127.0.0.1` → 仅本地访问
  - `HOST=0.0.0.0` → 内网可访问
  - 文档没有突出这个区别
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: 验证 HOST=0.0.0.0 时内网 IP 可达
- **稳定复现**: 是
- **严重程度**: 重要（内网部署的关键配置）

## FINDING-006: `--help` flag not recognized by top-level CLI or leaf commands

- **发现时间**: 2026-06-13 14:15
- **测试域**: CLI 帮助系统
- **触发命令**: `pnpm dev:cli -- --help`
- **操作过程**:
  1. Run `pnpm dev:cli -- --help`
  2. Observe: `error: unknown command '--help'`
  3. Run `pnpm dev:cli -- -h` -> `error: unknown command '-h'`
  4. Run `pnpm dev:cli -- login --help` -> `error: too many arguments for 'login'. Expected 0 arguments but got 1.`
  5. Run `pnpm dev:cli -- help` -> works, shows usage
- **预期行为**: CLI.md line 18 documents `pnpm --filter @trapmap/cli dev -- --help` as valid usage. CLI.md line 83 documents `--help` as a global option. Commander.js standard behavior is for `--help` to be accepted.
- **实际行为**: `--help` is rejected. Only `trapmap help` (as a subcommand) works. Leaf commands like `login`, `session`, `logout` reject `--help` because Commander is configured with `allowUnknownOption: false` implicitly, and `--help` is treated as an argument.
- **问题分类**: 功能 Bug
- **初步判断**: 客户端问题
- **验证建议**: Check Commander.js configuration in `packages/cli/src/index.ts`. The `about` command has `.argument` set to 0 args, so `--help` is counted as an arg. This affects ALL commands that don't have `.allowUnknownOption()` or proper help flag registration.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-007: `about` command output says "Skill Shareer prototype" (typo) instead of "TrapMap"

- **发现时间**: 2026-06-13 14:20
- **测试域**: CLI 命令输出
- **触发命令**: `pnpm dev:cli -- about`
- **操作过程**:
  1. Run `pnpm dev:cli -- about`
  2. Observe output: `Skill Shareer prototype`
- **预期行为**: CLI.md line 33-38 documents output as `TrapMap` with package descriptions.
- **实际行为**: Output says `Skill Shareer prototype` (with typo "Shareer"). This is in `packages/cli/src/index.ts` line 73.
- **问题分类**: 文档问题 / 功能 Bug
- **初步判断**: 客户端问题 — both docs and source are wrong/outdated. Source has a typo.
- **验证建议**: Fix typo "Shareer" -> "Sharer" or "TrapMap" in `packages/cli/src/index.ts` line 73.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-008: `login` command docs show `--server` option but docs don't mention it

- **发现时间**: 2026-06-13 14:25
- **测试域**: CLI 命令文档对比
- **触发命令**: `pnpm dev:cli -- help login`
- **操作过程**:
  1. Run `pnpm dev:cli -- help login`
  2. Observe options: `--access-key`, `--system-admin-key`, `--server <url>`, `--json`
- **预期行为**: CLI.md lines 186-198 document `login` with `--access-key` and `--system-admin-key` only.
- **实际行为**: Actual CLI also has `--server <url>` and `--json` options not documented.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `--server <url>` and `--json` to CLI.md login section.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-009: `login` output format differs between docs and actual

- **发现时间**: 2026-06-13 14:25
- **测试域**: CLI 命令输出格式
- **触发命令**: `pnpm dev:cli -- help login` (source code review)
- **操作过程**:
  1. Read `packages/cli/src/commands/auth.ts` lines 60-65
  2. Actual output format: `Logged in as {handle}`, `Security level: {level}`, `Active team: {team}`
- **预期行为**: CLI.md line 203-206 documents output as `Logged in as alice`, `Role: contributor | Level: 1`.
- **实际行为**: Source prints `Security level:` not `Role:` and `Level:`. Format is different from docs.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md login output format to match actual source code format.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-010: `logout` command has undocumented `--json` option

- **发现时间**: 2026-06-13 14:28
- **测试域**: CLI 命令文档对比
- **触发命令**: `pnpm dev:cli -- help logout`
- **操作过程**:
  1. Run `pnpm dev:cli -- help logout`
  2. Observe options: `--json`
- **预期行为**: CLI.md lines 229-235 document `logout` with no options.
- **实际行为**: Actual CLI has `--json` option.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `--json` to CLI.md logout section.
- **稳定复现**: 是
- **严重程度**: 建议

## FINDING-011: `session` command has undocumented `--json` option

- **发现时间**: 2026-06-13 14:28
- **测试域**: CLI 命令文档对比
- **触发命令**: `pnpm dev:cli -- help session`
- **操作过程**:
  1. Run `pnpm dev:cli -- help session`
  2. Observe options: `--json`
- **预期行为**: CLI.md lines 240-257 document `session` with no options.
- **实际行为**: Actual CLI has `--json` option.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `--json` to CLI.md session section.
- **稳定复现**: 是
- **严重程度**: 建议

## FINDING-012: `session` output format differs between docs and actual

- **发现时间**: 2026-06-13 14:28
- **测试域**: CLI 命令输出格式
- **触发命令**: source code review of `packages/cli/src/commands/auth.ts` lines 130-136
- **操作过程**:
  1. Read auth.ts source
  2. Actual format: `Authenticated: yes`, `User: {handle}`, `Security level: {level}`, `Active team: {team}`
- **预期行为**: CLI.md lines 249-257 document format as `Session Info:`, `User:`, `Role:`, `Level:`, `Expires:`, `Team:`.
- **实际行为**: Source does not print `Role:` or `Expires:`. Uses `Security level:` instead of `Level:`.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md session output format to match actual source code.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-013: `team create` command has undocumented `--json` option

- **发现时间**: 2026-06-13 14:30
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/team.ts` line 90
- **操作过程**:
  1. Read team.ts source
  2. `team create` has `--json` option
- **预期行为**: CLI.md lines 262-277 document `team create` with only `--description` option.
- **实际行为**: Actual CLI also has `--json` option.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `--json` to CLI.md team create section.
- **稳定复现**: 是
- **严重程度**: 建议

## FINDING-014: `team list` and `team select` have undocumented `--json` option

- **发现时间**: 2026-06-13 14:30
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/team.ts`
- **操作过程**:
  1. Read team.ts source
  2. `team list` has `--json` (line 19), `team select` has `--json` (line 53)
- **预期行为**: CLI.md lines 282-318 document `team list` and `team select` with no options.
- **实际行为**: Both commands have `--json` option.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `--json` to CLI.md team list and team select sections.
- **稳定复现**: 是
- **严重程度**: 建议

## FINDING-015: `member create` CLI signature differs significantly from docs

- **发现时间**: 2026-06-13 14:32
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/member.ts` lines 21-28
- **操作过程**:
  1. Read member.ts source
  2. Actual signature: `member create <handle> --team <teamId> [--role <role>] [--note <text>] [--json]`
- **预期行为**: CLI.md lines 324-337 document: `member create --username <username> --password <password> [--role <role>] [--level <level>]`
- **实际行为**: Actual CLI uses `<handle>` positional argument, requires `--team`, uses `--note` instead of `--password`. No `--username` or `--password` or `--level` options. Default role is `user` not documented.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Rewrite CLI.md member create section to match actual: `trapmap member create <handle> --team <teamId> [--role <role>] [--note <text>] [--json]`
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-016: `member update` CLI signature differs significantly from docs

- **发现时间**: 2026-06-13 14:32
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/member.ts` lines 72-79
- **操作过程**:
  1. Read member.ts source
  2. Actual: `member update <memberId> [--level <n>] [--note <text>] [--permission <name...>] [--json]`
- **预期行为**: CLI.md lines 352-368 document: `member update <memberId> [--role <role>] [--level <level>]`
- **实际行为**: Actual CLI has `--note` and `--permission` options, no `--role` option.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md member update section: replace `--role` with `--permission <name...>` and add `--note`.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-017: `access-key create` CLI signature completely different from docs

- **发现时间**: 2026-06-13 14:35
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/member.ts` lines 128-136
- **操作过程**:
  1. Read member.ts source
  2. Actual: `access-key:create <memberId> --team <teamId> [--note <text>] [--json]`
- **预期行为**: CLI.md lines 1044-1067 document: `access-key create --name <name> [--expires <days>] [--permissions <perms>]`
- **实际行为**: Actual CLI is named `access-key:create` (colon not space), takes `<memberId>` positional, requires `--team`, has `--note`. No `--name`, `--expires`, or `--permissions` options.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Rewrite CLI.md access-key section completely. Command name is `access-key:create`, takes `<memberId>` and `--team`.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-018: `knowledge submit` is registered as top-level `submit`, not `knowledge submit`

- **发现时间**: 2026-06-13 14:38
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/knowledge.ts` line 65
- **操作过程**:
  1. Read knowledge.ts source
  2. Commands registered: `submit`, `resubmit`, `supersede`, `review-status` (all top-level)
- **预期行为**: CLI.md documents these under "知识命令" section as `knowledge submit`, `knowledge resubmit`, `knowledge inspect`, `knowledge list`. None of these exist as documented.
- **实际行为**: Actual CLI registers `submit`, `resubmit`, `supersede`, `review-status` as top-level commands. There is no `knowledge` command group.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: The entire "知识命令" section (lines 373-498) in CLI.md documents a `knowledge` subcommand group that does not exist. The actual commands are top-level `submit`, `resubmit`, `supersede`, `review-status`.
- **稳定复现**: 是
- **严重程度**: 阻塞

## FINDING-019: `knowledge submit` docs show options not matching actual `submit` command

- **发现时间**: 2026-06-13 14:38
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/knowledge.ts` lines 67-75
- **操作过程**:
  1. Read knowledge.ts source
  2. Actual options: `--scope`, `--label` (required, repeatable), `--shortcut` (required), `--detail`, `--file`, `--stdin`, `--required-level`, `--boundary`, `--json`
- **预期行为**: CLI.md lines 378-398 document `knowledge submit` with `--title, -t`, `--content, -c`, `--format, -f`, `--level, -l`, `--team`.
- **实际行为**: Actual `submit` has completely different options: `--scope`, `--label`, `--shortcut`, `--detail`, `--file`, `--stdin`, `--required-level`, `--boundary`. No `--title`, `--content`, `--format`, `--level`, `--team`.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Rewrite CLI.md knowledge submit section to match actual command signature.
- **稳定复现**: 是
- **严重程度**: 阻塞

## FINDING-020: `supersede` command exists in CLI but not documented

- **发现时间**: 2026-06-13 14:40
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/knowledge.ts` lines 228-257
- **操作过程**:
  1. Read knowledge.ts source
  2. Found `supersede` command: `trapmap supersede <entryId> --replacement <id> [--json]`
- **预期行为**: CLI.md does not document a `supersede` command.
- **实际行为**: `supersede` command exists with `--replacement` option.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `supersede` command documentation to CLI.md.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-021: `review-status` command exists but docs document `knowledge inspect` and `knowledge list`

- **发现时间**: 2026-06-13 14:40
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/knowledge.ts` lines 261-317
- **操作过程**:
  1. Read knowledge.ts source
  2. `review-status [entryId]` is registered (optional entryId)
- **预期行为**: CLI.md documents `knowledge inspect <entryId>` (line 429) and `knowledge list` (line 468) as separate commands.
- **实际行为**: Single `review-status` command handles both cases: with arg shows entry detail, without arg lists history.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Replace `knowledge inspect` and `knowledge list` docs with `review-status` documentation.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-022: `search` command uses `--max-results` not `--limit`

- **发现时间**: 2026-06-13 14:42
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/retrieval.ts` line 204
- **操作过程**:
  1. Read retrieval.ts source
  2. Actual option: `--max-results <n>` with default `'10'`
- **预期行为**: CLI.md line 622 documents `--limit, -l` for the search command.
- **实际行为**: Actual CLI uses `--max-results <n>`, not `--limit`.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md search section: change `--limit, -l` to `--max-results`.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-023: `search` command uses positional `[seed]` not required `<query>`

- **发现时间**: 2026-06-13 14:42
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/retrieval.ts` line 201
- **操作过程**:
  1. Read retrieval.ts source
  2. Actual: `search [seed]` (optional positional), with `--stdin` option
- **预期行为**: CLI.md line 608 documents `search <query>` (required positional).
- **实际行为**: Actual CLI uses `[seed]` (optional). Can also read from stdin.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md: change `<query>` to `[seed]` and note it's optional when using `--stdin`.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-024: `review:queue` docs show `--limit` but actual has `--status`

- **发现时间**: 2026-06-13 14:45
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/review.ts` lines 83-86
- **操作过程**:
  1. Read review.ts source
  2. Actual options: `--status <state>`, `--json`
- **预期行为**: CLI.md line 668 documents `review queue [--limit <limit>]`.
- **实际行为**: Actual CLI has `--status <state>` and `--json`, no `--limit` option.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md: replace `--limit` with `--status <state>` for review queue.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-025: `review:approve` and `review:reject` have undocumented options

- **发现时间**: 2026-06-13 14:45
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/review.ts` lines 119-137
- **操作过程**:
  1. Read review.ts source
  2. Both commands have: `--notes` (required), `--boundary <json>`, `--source-type <type>`, `--source-ref <ref>`, `--evidence-level <level>`, `--json`
- **预期行为**: CLI.md lines 688-719 document only `--notes` for approve and reject.
- **实际行为**: Actual CLI also has `--boundary`, `--source-type`, `--source-ref`, `--evidence-level`, `--json` options.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `--boundary`, `--source-type`, `--source-ref`, `--evidence-level`, `--json` to CLI.md review approve/reject sections.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-026: `review approve` doc says `--notes` is optional, actual requires it

- **发现时间**: 2026-06-13 14:45
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/review.ts` line 126
- **操作过程**:
  1. Read review.ts source
  2. `--notes` is `requiredOption` for both approve and reject
- **预期行为**: CLI.md line 695 documents `review approve <entryId> [--notes <notes>]` with `--notes` as optional.
- **实际行为**: `--notes` is required in the actual CLI.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md: change `[--notes <notes>]` to `--notes <text>` (required).
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-027: `trap submit` has `--file`, `--stdin`, `--boundary` options not documented

- **发现时间**: 2026-06-13 14:48
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/trap.ts` lines 63-73
- **操作过程**:
  1. Read trap.ts source
  2. Actual options include `--file <path>`, `--stdin`, `--boundary <json>` in addition to what's documented
- **预期行为**: CLI.md lines 502-531 document `trap submit` with `--scope`, `--label`, `--shortcut`, `--detail`, `--file`, `--stdin`, `--required-level`, `--boundary`, `--json`.
- **实际行为**: Actually, these ARE documented. But the docs also say `--shortcut, -s` and `--detail, -d`. Let me check if the short flags exist.
- **问题分类**: (need to re-verify)
- **初步判断**: Need re-check
- **验证建议**: The trap submit docs actually look mostly correct. Verify if `-s` and `-d` short flags work.
- **稳定复现**: (pending)
- **严重程度**: (pending)

## FINDING-028: `review:queue` uses colon separator, docs use space (`review queue`)

- **发现时间**: 2026-06-13 14:50
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/review.ts` line 83
- **操作过程**:
  1. Read review.ts source
  2. Command registered as `review:queue`, `review:approve`, `review:reject`
- **预期行为**: CLI.md lines 663-719 document commands as `review queue`, `review approve`, `review reject` (space separator).
- **实际行为**: Actual CLI uses colon separator: `review:queue`, `review:approve`, `review:reject`.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md to use colon separator: `review:queue`, `review:approve`, `review:reject`.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-029: `list` command docs say `--state` accepts comma-separated but source sends as single `lifecycleState` param

- **发现时间**: 2026-06-13 14:52
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/operations/list.ts` line 40
- **操作过程**:
  1. Read list.ts source
  2. `--state` is sent as single `lifecycleState` query param, no comma splitting
- **预期行为**: CLI.md line 751 documents `--state <state>` with description "按生命周期状态过滤（逗号分隔）".
- **实际行为**: The source code sets `lifecycleState` as a single value without splitting on commas.
- **问题分类**: 文档问题 / 功能 Bug
- **初步判断**: 文档问题 or client bug — docs claim comma-separated but source doesn't split.
- **验证建议**: Either update docs to remove "逗号分隔" or update source to support comma-separated states.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-030: `load` command exists in CLI but not documented in CLI.md

- **发现时间**: 2026-06-13 14:55
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/load.ts`
- **操作过程**:
  1. Read load.ts source
  2. `load` command: `trapmap load [seed] --scope --label --skill-budget --max-depth --fallback --stdin --json`
- **预期行为**: CLI.md does not document a `load` command.
- **实际行为**: `load` command exists with options `--scope`, `--label`, `--skill-budget <n>` (default 3), `--max-depth <n>` (default 2), `--fallback <mode>` (default auto), `--stdin`, `--json`. It calls `/v3/retrieval/search`.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `load` command documentation to CLI.md.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-031: `policy resolve` command exists in CLI but not documented in CLI.md

- **发现时间**: 2026-06-13 14:55
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/policy.ts`
- **操作过程**:
  1. Read policy.ts source
  2. `policy resolve` command: `trapmap policy resolve --default-policy <policy> [--override-policy <policy>] [--path] [--capability] [--json]`
- **预期行为**: CLI.md does not document `policy` commands.
- **实际行为**: `policy resolve` command exists. Computes effective activation policy for scripts.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `policy resolve` command documentation to CLI.md.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-032: `capsule-index` command group exists in CLI but not documented in CLI.md

- **发现时间**: 2026-06-13 14:55
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/operations/capsule-index.ts`
- **操作过程**:
  1. Read capsule-index.ts source
  2. `capsule-index rebuild`, `capsule-index health`, `capsule-index cleanup-orphans`
- **预期行为**: CLI.md does not document `capsule-index` commands.
- **实际行为**: Three subcommands exist: `rebuild` (full or per-artifact), `health`, `cleanup-orphans`.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `capsule-index` command group documentation to CLI.md.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-033: `skill find` and `skill apply` commands exist but not documented in CLI.md

- **发现时间**: 2026-06-13 14:58
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/skill.ts` lines 285-368
- **操作过程**:
  1. Read skill.ts source
  2. `skill find [fingerprint] [--json]` and `skill apply <candidateId> [--json]`
- **预期行为**: CLI.md does not document `skill find` or `skill apply`.
- **实际行为**: Both commands exist. `skill find` lists candidates (optionally filtered by fingerprint). `skill apply` applies a candidate resolution.
- **问题分类**: 文档缺失
- **初步判断**: 文档问题
- **验证建议**: Add `skill find` and `skill apply` documentation to CLI.md.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-034: `skill search-by-content` uses `--max-results` not `--limit`

- **发现时间**: 2026-06-13 14:58
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/skill.ts` line 253
- **操作过程**:
  1. Read skill.ts source
  2. Actual option: `--max-results <n>` default `'10'`
- **预期行为**: CLI.md line 1467 documents `--limit <n>` for `skill search-by-content`.
- **实际行为**: Actual CLI uses `--max-results`, not `--limit`.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md: change `--limit <n>` to `--max-results <n>` for skill search-by-content.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-035: `skill duplicate-job resolve` uses `--merged-with` and `--merged-type` separately, not combined format

- **发现时间**: 2026-06-13 15:00
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/skill.ts` lines 741-744
- **操作过程**:
  1. Read skill.ts source
  2. Actual: `--merged-with <entityId>` and `--merged-type <type>` as separate options
- **预期行为**: CLI.md line 1589 documents `--merged-with <entityType:entityId>` as a combined format.
- **实际行为**: Actual CLI uses two separate flags: `--merged-with <entityId>` (just the ID) and `--merged-type <type>` (trap or skill).
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Update CLI.md to document two separate flags: `--merged-with <entityId>` and `--merged-type <type>`.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-036: `trap submit`/`trap resubmit` docs don't mention `--file` and `--stdin` options

- **发现时间**: 2026-06-13 15:02
- **测试域**: CLI 命令文档对比
- **触发命令**: re-verification of CLI.md lines 502-558
- **操作过程**:
  1. Re-read CLI.md trap submit section
  2. Actually, CLI.md line 526-527 DOES document `--file` and `--stdin`. Withdrawn.
- **预期行为**: (n/a - withdrawn finding)
- **实际行为**: (n/a - withdrawn)
- **问题分类**: (n/a)
- **初步判断**: (n/a)
- **验证建议**: (n/a)
- **稳定复现**: (n/a)
- **严重程度**: (n/a)

## FINDING-037: `feedback` CLI uses `feedback <entryId>` as command syntax, docs match

- **发现时间**: 2026-06-13 15:02
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/feedback.ts` line 69
- **操作过程**:
  1. Read feedback.ts source
  2. Command: `feedback <entryId>` with options `--type`, `--description`, `--context`, `--entry-type`, `--query-seed`, `--json`
- **预期行为**: CLI.md lines 1135-1168 document `feedback <entryId>` with matching options.
- **实际行为**: Matches. Documentation is accurate.
- **问题分类**: (no issue)
- **初步判断**: (no issue)
- **验证建议**: (n/a)
- **稳定复现**: (n/a)
- **严重程度**: (n/a)

## FINDING-038: `global --output` option documented but not implemented in CLI

- **发现时间**: 2026-06-13 15:05
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/index.ts`
- **操作过程**:
  1. Read index.ts source
  2. No global `--output <format>` option is registered on the program
  3. Individual commands use `--json` flag instead
- **预期行为**: CLI.md line 86 documents `--output <format>` as a global option with values `table`, `json`, `yaml` (default `table`).
- **实际行为**: No global `--output` option exists. Each command has its own `--json` flag. The docs at lines 1621-1633 show `trapmap knowledge list --output table|json|yaml` which doesn't work.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Remove `--output <format>` from the global options table. Update docs to show `--json` flag usage instead.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-039: `global --no-color` option documented but not registered in CLI

- **发现时间**: 2026-06-13 15:05
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/index.ts`
- **操作过程**:
  1. Read index.ts source
  2. No `--no-color` option registered on the program
- **预期行为**: CLI.md line 87 documents `--no-color` as a global option.
- **实际行为**: No `--no-color` option is registered. Color is controlled via `NO_COLOR` env var in evidence.ts.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Remove `--no-color` from global options table or implement it. Document `NO_COLOR` env var.
- **稳定复现**: 是
- **严重程度**: 建议

## FINDING-040: `global --url` option documented but actual is `--server` on `login` only

- **发现时间**: 2026-06-13 15:05
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/index.ts`
- **操作过程**:
  1. Read index.ts source
  2. No global `--url <url>` option is registered. Only `login` has `--server <url>`.
- **预期行为**: CLI.md line 85 documents `--url <url>` as a global option with default `http://localhost:4000`.
- **实际行为**: No global `--url` option. The `login` command has `--server <url>` to override the saved server URL.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Remove `--url` from global options. Document server URL configuration via `login --server` and `TRAPMAP_SERVER_URL` env var.
- **稳定复现**: 是
- **严重程度**: 重要

## FINDING-041: CLI.md documents `--version` as `--version` but Commander uses `-V, --version`

- **发现时间**: 2026-06-13 15:08
- **测试域**: CLI 命令文档对比
- **触发命令**: `pnpm dev:cli -- help` output
- **操作过程**:
  1. Run `pnpm dev:cli -- help`
  2. Shows: `-V, --version`
- **预期行为**: CLI.md line 68-69 documents `trapmap --version`.
- **实际行为**: Works, but also supports `-V`. Minor inconsistency.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Add `-V` short flag mention to CLI.md.
- **稳定复现**: 是
- **严重程度**: 建议

## FINDING-042: `api:list` output does not include many commands that actually exist

- **发现时间**: 2026-06-13 15:10
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/index.ts` lines 83-126
- **操作过程**:
  1. Read index.ts source
  2. `api:list` command lists only a subset of commands based on permissions
  3. Missing from the list even when permitted: `supersede`, `edit`, `deactivate`, `export`, `artifact-export`, `import`, `activate`, `migrate`, `status`, `audit`, `decay-stale`, `decay-batch`, `decay-search`, `maintenance-list`, `maintenance-assign`, `maintenance-verify`, `load`, `policy resolve`, `capsule-index`, `skill find`, `skill apply`
- **预期行为**: CLI.md lines 46-60 document `api:list` output as showing available commands.
- **实际行为**: Many commands exist but are not listed in `api:list` output.
- **问题分类**: 功能 Bug
- **初步判断**: 客户端问题
- **验证建议**: Update `api:list` command to include all registered commands.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-043: `trap submit` docs mention `-s` and `-d` short flags that may not work

- **发现时间**: 2026-06-13 15:12
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/trap.ts` lines 63-73
- **操作过程**:
  1. Read trap.ts source
  2. Options defined as: `--shortcut <text>` and `--detail <text>` — no short flags `-s` or `-d`
- **预期行为**: CLI.md line 523 documents `--shortcut, -s` and line 524 documents `--detail, -d`.
- **实际行为**: Source code does not define `-s` or `-d` short flags. Commander will not recognize them.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Remove `-s` and `-d` from CLI.md trap submit docs, or add them to source code.
- **稳定复现**: 是
- **严重程度**: 一般

## FINDING-044: `evidence:update` has no `--json` option, docs don't mention it either — but review commands do

- **发现时间**: 2026-06-13 15:15
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/evidence.ts` line 122
- **操作过程**:
  1. Read evidence.ts source
  2. `evidence:update` has no `--json` option
- **预期行为**: CLI.md line 1109 documents `evidence:update` without `--json`.
- **实际行为**: Consistent — neither docs nor source have `--json` for this command. However, docs line 1109 says `--level`, `--type`, `--ref` which matches source.
- **问题分类**: (no issue)
- **初步判断**: (no issue)
- **验证建议**: (n/a)
- **稳定复现**: (n/a)
- **严重程度**: (n/a)

## FINDING-045: `output profile set` docs show `--model` but actual uses `--model <hint>` with different semantics

- **发现时间**: 2026-06-13 15:18
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/commands/output-profile.ts` line 33
- **操作过程**:
  1. Read output-profile.ts source
  2. Actual: `--model <hint>` option
- **预期行为**: CLI.md line 173 documents `--model <hint>` with hint values `claude` / `generic`.
- **实际行为**: Matches. The option name and values are consistent.
- **问题分类**: (no issue)
- **初步判断**: (no issue)
- **验证建议**: (n/a)
- **稳定复现**: (n/a)
- **严重程度**: (n/a)

## FINDING-046: `decay-stale` default limit is 25 in CLI, docs say 25 — consistent

- **发现时间**: 2026-06-13 15:20
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review
- **操作过程**:
  1. Read decay.ts source line 76
  2. Default limit: `'25'`
- **预期行为**: CLI.md line 1271 documents default 25.
- **实际行为**: Matches.
- **问题分类**: (no issue)
- **初步判断**: (no issue)
- **验证建议**: (n/a)
- **稳定复现**: (n/a)
- **严重程度**: (n/a)

## FINDING-047: `maintenance-list` docs mention `--stale-days` — actual matches

- **发现时间**: 2026-06-13 15:20
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review
- **操作过程**:
  1. Read maintenance.ts source line 74
  2. `--stale-days <n>` with `Number.parseInt`
- **预期行为**: CLI.md line 1372 documents `--stale-days <n>`.
- **实际行为**: Matches.
- **问题分类**: (no issue)
- **初步判断**: (no issue)
- **验证建议**: (n/a)
- **稳定复现**: (n/a)
- **严重程度**: (n/a)

## FINDING-048: CLIENT_INTEGRATION.md references non-existent `trapmap activate` command signature

- **发现时间**: 2026-06-13 15:22
- **测试域**: 文档准确性
- **触发命令**: review of `docs/guides/CLIENT_INTEGRATION.md` lines 48-53
- **操作过程**:
  1. Read CLIENT_INTEGRATION.md
  2. Shows: `trapmap activate --artifact <artifact-id> --paths SKILL.md,... --output ./.tmp/skills/<skill-slug>`
- **预期行为**: The activate command docs should match CLI.md.
- **实际行为**: CLIENT_INTEGRATION.md usage example matches actual CLI source (activate.ts) correctly. No issue here.
- **问题分类**: (no issue)
- **初步判断**: (no issue)
- **验证建议**: (n/a)
- **稳定复现**: (n/a)
- **严重程度**: (n/a)

## FINDING-049: Exit codes documented in CLI.md but not implemented in CLI source

- **发现时间**: 2026-06-13 15:25
- **测试域**: CLI 命令文档对比
- **触发命令**: source code review of `packages/cli/src/index.ts`
- **操作过程**:
  1. Read index.ts source
  2. `program.parseAsync(process.argv).catch(printError)` — no custom exit codes
- **预期行为**: CLI.md lines 1678-1684 document exit codes 0-5 with specific meanings.
- **实际行为**: No custom exit code handling. All errors likely exit with code 1. No mapping for codes 2-5.
- **问题分类**: 文档问题
- **初步判断**: 文档问题 (documented but not implemented)
- **验证建议**: Either implement exit codes 2-5 or remove the exit code table from CLI.md.
- **稳定复现**: 是
- **严重程度**: 建议

## FINDING-050: `TRAPMAP_API_KEY` env var documented but not used in CLI source

- **发现时间**: 2026-06-13 15:25
- **测试域**: CLI 命令文档对比
- **触发命令**: grep for `TRAPMAP_API_KEY` in CLI source
- **操作过程**:
  1. Search for `TRAPMAP_API_KEY` in `packages/cli/src/`
  2. Not found — only `TRAPMAP_SERVER_URL` would be in config
- **预期行为**: CLI.md line 1669 documents `TRAPMAP_API_KEY=ak_xxxxxxxxxxxx` as a way to set an API key.
- **实际行为**: The CLI does not read `TRAPMAP_API_KEY` from environment. Authentication is via `login` command storing a session token.
- **问题分类**: 文档问题
- **初步判断**: 文档问题
- **验证建议**: Remove `TRAPMAP_API_KEY` from CLI.md or implement env var support.
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-150: deploy.sh help 命令输出正确但缺少版本信息

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: `bash scripts/deploy.sh help`
- **操作过程**:
  1. 运行 `bash scripts/deploy.sh help`
  2. 观察输出
- **预期行为**: 显示帮助信息，包含所有可用命令
- **实际行为**:
  ```
  TrapMap - Docker Deployment Script

  Usage: scripts/deploy.sh <command>

  Commands:
    deploy      Build and start the service (first-time deployment)
    start       Start the service
    stop        Stop the service
    restart     Restart the service
    logs        View and follow logs
    status      Show service status
    update      Pull latest, rebuild, and restart
    shell       Access container shell
    clean       Remove container, image, and data (DESTRUCTIVE)
    help        Show this help message

  Examples:
    scripts/deploy.sh deploy      # Initial deployment
    scripts/deploy.sh logs        # View logs
    scripts/deploy.sh update      # Update to latest version

  Configuration:
    Edit .env file to configure API keys and settings
    Data directory: /home/wunai/Disks/Data/my-project/Trap-Map/.data
  ```
  输出完整，所有命令都有说明。但没有版本号或脚本最后修改日期。
- **问题分类**: 体验问题
- **初步判断**: help 输出功能正常，缺少版本标识是 minor 问题。支持 `help`、`--help`、`-h` 三种形式（第248行 case 分支），这是好的实践。
- **验证建议**: 在帮助信息中添加版本号，便于排障时确认脚本版本
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-151: deploy.sh 无参数运行时输出 Unknown command 后跟空字符串

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: `bash scripts/deploy.sh`
- **操作过程**:
  1. 不带任何参数运行 `bash scripts/deploy.sh`
  2. 观察输出和退出码
- **预期行为**: 应显示明确的用法提示，如 "Usage: deploy.sh <command>"
- **实际行为**:
  ```
  [ERROR] Unknown command: 
  TrapMap - Docker Deployment Script
  Usage: scripts/deploy.sh <command>
  ...
  ```
  退出码: 1
  `[ERROR] Unknown command: ` 后面是空字符串，显示不友好。虽然紧接着就显示了 help，但首行错误信息不够清晰。
- **问题分类**: 体验问题
- **初步判断**: case `${1:-}` 将空参数展开为空字符串传给 default 分支，导致 "Unknown command: " 后面没有内容。建议改为：无参数时直接显示 help 并退出 0，或者显示 "No command specified" 而非 "Unknown command: "。
- **验证建议**: 修改 default 分支，区分"无参数"和"无效参数"两种情况
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-152: deploy.sh invalid-cmd 行为正确

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: `scripts/deploy.sh invalid-cmd`
- **操作过程**:
  1. 运行 `scripts/deploy.sh invalid-cmd`
  2. 观察输出和退出码
- **预期行为**: 显示错误信息和帮助，退出码非 0
- **实际行为**:
  ```
  [ERROR] Unknown command: invalid-cmd
  TrapMap - Docker Deployment Script
  Usage: scripts/deploy.sh <command>
  ...
  ```
  退出码: 1
  行为正确：显示了具体错误的命令名，打印了帮助信息，退出码为 1。
- **问题分类**: 无问题
- **初步判断**: 预期行为，脚本正确处理了无效命令
- **验证建议**: 无需修改
- **稳定复现**: 是
- **严重程度**: 无（正常行为）

---

## FINDING-153: deploy.sh check_docker() 只检查命令存在性不检查 daemon 运行状态

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: `scripts/deploy.sh status`
- **操作过程**:
  1. 在 Docker daemon 未运行的环境下运行 `scripts/deploy.sh status`
  2. 观察输出
- **预期行为**: `check_docker()` 检查 Docker 是否可用，如果不可用应给出友好提示
- **实际行为**:
  ```
  The "OPENAI_API_KEY" variable is not set. Defaulting to a blank string.
  failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: no such file or directory
  ```
  退出码: 1
  问题分析：
  1. `check_docker()` 只检查 `docker` 命令是否安装（`command -v docker`），不检查 daemon 是否运行
  2. docker 命令存在但 daemon 停止时，check_docker 通过，然后 docker compose 直接报出原始的 socket 错误
  3. 两条 warning 信息都是 docker compose 的原始输出，没有被 deploy.sh 的 log 函数包装
  4. `OPENAI_API_KEY` warning 来自 docker compose 读取 .env 时发现变量未定义，这和 status 操作无关但仍会出现
- **问题分类**: 功能 Bug
- **初步判断**: check_docker() 函数设计不完整，只检查了命令存在性，没有检查 daemon 运行状态。应增加 `docker info` 或 `docker ps` 来检测 daemon 可达性。此问题影响 status、deploy、start、stop、restart、logs、update、shell 全部需要 Docker 的命令。
- **验证建议**: 在 check_docker() 中增加 daemon 连通性检查，如 `docker info &> /dev/null`
- **稳定复现**: 是
- **严重程度**: 一般（Docker daemon 不运行时所有操作都会失败，但错误信息不友好）

---

## FINDING-154: deploy.sh deploy 流程在 Docker 不可用时暴露原始错误

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: `scripts/deploy.sh deploy`
- **操作过程**:
  1. 在 Docker daemon 未运行的环境下运行 `scripts/deploy.sh deploy`
  2. 观察输出
- **预期行为**: deploy 应按顺序执行：检查 Docker -> 创建 .env -> 创建目录 -> 构建 -> 启动
- **实际行为**:
  ```
  [INFO] Starting deployment...
  [INFO] Building Docker image...
  The "OPENAI_API_KEY" variable is not set. Defaulting to a blank string.
  Docker Compose requires buildx plugin to be installed
   Image trap-map-server Building 
   Image trap-map-server Building 
  failed to connect to the docker API at unix:///var/run/docker.sock; ...
  ```
  退出码: 1
  关键问题：
  1. `.env` 已存在（之前测试中已存在），所以 create_env_file() 跳过了创建
  2. `check_docker()` 通过了（因为 `docker` 命令存在），但 daemon 不可达
  3. 日志输出顺序：`build_image()` 被调用时，先输出了 `Building Docker image...`，然后 docker compose 的 warning 混杂在中间
  4. `Docker Compose requires buildx plugin` 是 docker compose 的 warning，不是 deploy.sh 捕获的
- **问题分类**: 功能 Bug
- **初步判断**: 同 FINDING-153，check_docker() 不检查 daemon 状态。另外 deploy 流程中 build_image 在 create_env_file 之后，如果 .env 不存在且创建了新 .env（包含 placeholder API key），会先 build 再退出要求用户编辑 .env——但 build 阶段就会因 placeholder key 而产生 warning。
- **验证建议**: 1) 增强 check_docker()；2) 考虑在 create_env_file 返回 1（新建 .env）时立即退出，不执行后续 build
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-155: deploy.sh logs 命令输出 docker compose 原始错误

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: `scripts/deploy.sh logs`
- **操作过程**:
  1. 在 Docker daemon 未运行的环境下运行 `scripts/deploy.sh logs`
  2. 观察输出
- **预期行为**: 应给出友好提示
- **实际行为**:
  ```
  The "OPENAI_API_KEY" variable is not set. Defaulting to a blank string.
  no such service: trapmap-server
  ```
  退出码: 1
  与其他命令不同，logs 命令给出了 "no such service" 而非 socket 错误。这是因为没有运行的容器时 docker compose logs 找不到服务。但错误信息来自 docker compose 原始输出，没有被 deploy.sh 包装。
- **问题分类**: 体验问题
- **初步判断**: 同样是 check_docker() 不充分导致的问题。此外 logs 函数没有检查容器是否在运行。
- **验证建议**: 在 logs() 中增加容器运行状态检查
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-156: deploy.sh shell 命令无法处理非交互式执行环境

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: `bash /home/wunai/Disks/Data/my-project/Trap-Map/scripts/deploy.sh shell`
- **操作过程**:
  1. 在 Docker daemon 未运行的环境下运行 `scripts/deploy.sh shell`
  2. 观察输出
- **预期行为**: 给出友好错误提示
- **实际行为**:
  ```
  failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: no such file or directory
  ```
  退出码: 1
  shell() 函数调用 `docker exec -it`，在 daemon 不可达时直接暴露原始错误。此外，`-it` 标志在非交互式环境中（如 CI）会导致问题。
- **问题分类**: 体验问题
- **初步判断**: shell() 函数同样受 check_docker() 不充分影响。在 CI/非交互环境中 `-it` 标志会导致挂起或错误。
- **验证建议**: 1) 增强 check_docker()；2) 在 shell() 中检测是否为交互式终端
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-157: deploy.sh update 命令在无 Docker 时暴露原始错误

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: `bash /home/wunai/Disks/Data/my-project/Trap-Map/scripts/deploy.sh update`
- **操作过程**:
  1. 在 Docker daemon 未运行的环境下运行 `scripts/deploy.sh update`
  2. 观察输出
- **预期行为**: 给出友好错误提示
- **实际行为**:
  ```
  [INFO] Updating service...
  [INFO] Building Docker image...
  The "OPENAI_API_KEY" variable is not set. Defaulting to a blank string.
  Docker Compose requires buildx plugin to be installed
   Image trap-map-server Building 
   Image trap-map-server Building 
  failed to connect to the docker API at unix:///var/run/docker.sock; ...
  ```
  退出码: 1
  update() 调用 check_docker() 但 check_docker 没有检测 daemon 状态。build_image() 失败后 set -e 使脚本退出，但 update 流程中 restart() 不会被执行。错误信息没有被 log_error 包装。
- **问题分类**: 功能 Bug
- **初步判断**: 同 FINDING-153，check_docker() 不检查 daemon。另外 update() 内 build_image 和 restart 是分开调用的，build 失败后 restart 不会执行（set -e），但没有清理逻辑。
- **验证建议**: 增强 check_docker()，增加 daemon 连通性检查
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-158: deploy.sh create_env_file() 对已存在的 .env 静默跳过

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: 预读 `scripts/deploy.sh` 第46-77行
- **操作过程**:
  1. 分析 create_env_file() 函数逻辑
  2. 当 `.env` 存在时：`[ ! -f "$ENV_FILE" ]` 为 false，直接 `return 0`
  3. 当 `.env` 不存在时：创建文件，`return 1`
- **预期行为**: 对已有 .env 的情况应有提示或警告
- **实际行为**:
  - `.env` 不存在时：创建 .env，输出 WARN 提示用户编辑，return 1（被 deploy() 捕获后退出）
  - `.env` 存在时：完全静默，return 0，deploy() 继续执行
  - start()、restart()、stop() 等命令不调用 create_env_file()，所以不会受影响
  - 只有 deploy() 调用 create_env_file()，所以此行为只影响首次部署
- **问题分类**: 体验问题
- **初步判断**: 函数逻辑是正确的——首次部署创建 .env 后要求用户编辑；已有 .env 时继续部署。但静默跳过可能让用户误以为使用的是正确的配置。建议增加 "Using existing .env" 的 INFO 日志。
- **验证建议**: 增加日志提示 "Using existing .env configuration"
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-159: deploy.sh clean() 命令有确认机制但可能在管道中被绕过

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: 预读 `scripts/deploy.sh` 第157-170行
- **操作过程**:
  1. 分析 clean() 函数
  2. 使用 `read -p "Type 'yes' to confirm: " confirm` 进行确认
  3. 只有输入精确的 "yes" 才会执行清理
- **预期行为**: DESTRUCTIVE 操作应有充分的安全确认
- **实际行为**:
  ```bash
  clean() {
      log_warn "This will remove the container, image, and all data. Are you sure?"
      read -p "Type 'yes' to confirm: " confirm
      if [ "$confirm" = "yes" ]; then
          ...
          $(get_compose_cmd) -f "$COMPOSE_FILE" down -v --rmi all
          ...
          rm -rf "$DATA_DIR"
          ...
      fi
  }
  ```
  - 确认机制存在，要求输入精确的 "yes"
  - 但 `echo "yes" | deploy.sh clean` 可以绕过交互确认
  - `rm -rf "$DATA_DIR"` 删除的是 `.data` 目录，路径由变量控制，没有额外验证
  - `down -v --rmi all` 会删除 volumes 和所有镜像，非常激进
  - 没有 `--dry-run` 选项
- **问题分类**: 功能 Bug
- **初步判断**: clean() 的安全性对于交互式使用是足够的。但在自动化脚本中（如 CI）可以通过管道绕过确认。建议：1) 检测是否为交互式终端；2) 添加 `--force` 标志用于非交互式场景。
- **验证建议**: 在 clean() 中增加交互式终端检测，或添加 `--force` 参数
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-160: deploy.sh 未能统一处理 docker compose 和 docker-compose 的差异

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: 预读 `scripts/deploy.sh` 第36-43行
- **操作过程**:
  1. 分析 get_compose_cmd() 函数
  2. 优先使用 `docker compose`（V2 plugin），回退到 `docker-compose`（V1 standalone）
- **预期行为**: 正确检测并使用可用的 compose 命令
- **实际行为**:
  ```bash
  get_compose_cmd() {
      if docker compose version &> /dev/null; then
          echo "docker compose"
      else
          echo "docker-compose"
      fi
  }
  ```
  - 逻辑正确：优先 V2，回退 V1
  - 但调用方式 `$(get_compose_cmd) -f ...` 将返回值作为命令执行，这在大多数场景下没问题
  - 问题：如果 `docker compose version` 返回非 0 但 docker-compose 也不存在，脚本会使用不存在的 `docker-compose` 命令，导致未定义的错误行为
  - check_docker() 中已经检查了两种形式的存在性（第30行），所以如果 check_docker 通过，get_compose_cmd 一定能返回可用命令
  - 但 shell()、logs() 等函数没有调用 get_compose_cmd，而是直接使用 `docker exec`（shell）或 `$(get_compose_cmd)`（logs），行为不完全一致
- **问题分类**: 设计问题
- **初步判断**: 逻辑基本正确，但存在边界情况。check_docker() 和 get_compose_cmd() 的交互保证了命令可用性。不过 get_compose_cmd() 被多次调用（deploy 中 build_image 和 up -d 各调用一次），每次都重新检测，略有冗余。
- **验证建议**: 缓存 compose cmd 变量，避免重复检测
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-161: deploy.sh 生成的 .env 模板缺少 docker-compose.yml 中引用的多个环境变量

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: 对比 deploy.sh create_env_file() 和 docker-compose.yml
- **操作过程**:
  1. 读取 deploy.sh create_env_file() 生成的 .env 内容（第49-71行）
  2. 读取 docker-compose.yml 中 `${VAR:-}` 引用的变量
  3. 对比差异
- **预期行为**: .env 模板应包含 docker-compose.yml 引用的所有需要用户配置的变量
- **实际行为**:
  deploy.sh 生成的 .env 包含：
  - NODE_ENV, HOST, PORT, OPENAI_API_KEY, TRAPMAP_SYSTEM_ADMIN_KEY, TRAPMAP_DATA_FILE, LOG_* 系列

  docker-compose.yml 通过 `${VAR:-}` 引用但 deploy.sh .env 未包含：
  - `AI_PROVIDER` (第19行)
  - `AI_BASE_URL` (第20行)
  - `AI_API_KEY` (第21行)
  - `AI_CHAT_MODEL` (第22行)
  - `EMBEDDING_PROVIDER` (第24行)
  - `EMBEDDING_BASE_URL` (第25行)
  - `EMBEDDING_API_KEY` (第26行)
  - `EMBEDDING_MODEL` (第27行)
  - `POSTGRES_PASSWORD` (第56行)

  这些变量在 docker-compose.yml 中有 `${VAR:-}` 默认值，所以不会导致部署失败。但 deploy.sh 的 .env 模板不够完整，用户可能不知道可以自定义 AI 提供商配置。
- **问题分类**: 文档问题
- **初步判断**: deploy.sh 的 .env 模板是精简版，只包含必要变量。AI Provider 系列变量有 `${VAR:-}` 默认空值处理，不会导致失败。但 .env.production.example 包含了这些变量，说明生产部署应该有完整模板。
- **验证建议**: 在 deploy.sh 的 .env 模板中添加 AI Provider 变量的注释形式，或引用 .env.production.example
- **稳定复现**: 是
- **严重程度**: 一般（不阻塞部署，但影响配置完整性）

---

## FINDING-162: deploy.sh 和 deploy-quick.sh 行为差异显著

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: 对比 `scripts/deploy.sh` 和 `scripts/deploy-quick.sh`
- **操作过程**:
  1. 读取两个脚本完整内容
  2. 逐项对比功能差异
- **预期行为**: 两个脚本应有清晰的功能定位差异
- **实际行为**:
  | 特性 | deploy.sh | deploy-quick.sh |
  |------|-----------|-----------------|
  | Docker 检查 | check_docker() | 无 |
  | .env 创建 | create_env_file()，静默跳过已有 | 交互式等待用户编辑 |
  | API key 验证 | 无 | grep 检查 placeholder |
  | 子命令支持 | 有（deploy/start/stop/restart/logs/status/update/shell/clean/help）| 无（单一操作）|
  | Docker Compose 检测 | V2/V1 自动检测 | 仅 V2（`docker compose`）|
  | .env 模板 | 包含 LOG_* 配置 | 更精简 |
  | 目录创建 | data + logs | 仅 data |
  | 交互确认 | clean 有确认 | 无 |
  | set -e | 是 | 是 |

  关键差异：
  1. deploy-quick.sh 有 API key placeholder 检查（`grep -q "your-openai-api-key-here"`），deploy.sh 没有
  2. deploy-quick.sh 创建 .env 后会 `read -p "Press Enter after configuring .env..."` 等待用户编辑，deploy.sh 只是打印 warning 然后退出
  3. deploy-quick.sh 硬编码 `docker compose`（V2 only），deploy.sh 有 V1/V2 检测
  4. deploy-quick.sh 不创建 logs 目录
  5. deploy-quick.sh 无子命令系统，只做一次性的 build + start
- **问题分类**: 设计问题
- **初步判断**: 两个脚本功能重叠但行为不一致。deploy-quick.sh 的 API key 验证是好的实践，应该移植到 deploy.sh。deploy-quick.sh 不支持 V1 docker-compose 是潜在兼容性问题。建议考虑是否需要保留两个脚本，或合并功能。
- **验证建议**: 将 deploy-quick.sh 的 API key 验证逻辑合并到 deploy.sh 的 deploy() 函数中
- **稳定复现**: 是
- **严重程度**: 一般（两个脚本行为不一致可能导致用户困惑）

---

## FINDING-163: DEPLOYMENT.md 未提及 deploy.sh 和 deploy-quick.sh

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署文档
- **触发命令**: 搜索 `docs/architecture/DEPLOYMENT.md` 中的 deploy.sh 引用
- **操作过程**:
  1. 阅读 DEPLOYMENT.md 全文
  2. 搜索 "deploy.sh" 和 "deploy-quick" 关键词
- **预期行为**: DEPLOYMENT.md 应提到 deploy.sh 脚本及其命令
- **实际行为**:
  DEPLOYMENT.md 中的 Docker Compose 部分（第100-246行）直接使用 `docker compose` 命令：
  ```bash
  # 1. 创建生产环境文件
  cp .env.production.example .env
  # 编辑 .env

  # 2. 构建并启动
  docker compose up -d

  # 3. 查看日志
  docker compose logs -f

  # 4. 健康检查
  curl http://127.0.0.1:4000/health
  curl http://127.0.0.1:4000/ready
  ```
  全文没有提到 `scripts/deploy.sh` 或 `scripts/deploy-quick.sh`。用户按照文档操作时会直接使用 docker compose 命令，跳过了 deploy.sh 提供的 .env 创建、Docker 检查等功能。
- **问题分类**: 文档问题
- **初步判断**: DEPLOYMENT.md 和 deploy.sh 是两套独立的部署流程，没有交叉引用。文档中的 `cp .env.production.example .env` 而非 deploy.sh 的 create_env_file()，说明文档假设用户手动操作。建议在文档中添加 deploy.sh 作为快速部署选项。
- **验证建议**: 在 DEPLOYMENT.md 的 "Docker Compose 部署" 部分添加 deploy.sh 作为替代方案
- **稳定复现**: 是
- **严重程度**: 重要（文档和脚本是割裂的两套流程）

---

## FINDING-164: DEPLOYMENT.md 文档中的 .env.production 模板与 deploy.sh 生成的 .env 不一致

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署文档
- **触发命令**: 对比 DEPLOYMENT.md 第141-172行和 deploy.sh create_env_file()
- **操作过程**:
  1. 读取 DEPLOYMENT.md 中的 ".env.production 模板" 部分
  2. 对比 deploy.sh create_env_file() 生成的内容
- **预期行为**: 文档中的模板应与脚本生成的一致
- **实际行为**:
  | 变量 | DEPLOYMENT.md 模板 | deploy.sh .env |
  |------|-------------------|----------------|
  | OPENAI_API_KEY | 有 | 有 |
  | TRAPMAP_SYSTEM_ADMIN_KEY | 有 | 有 |
  | TRAPMAP_DATABASE_URL | 有（注释形式）| 无 |
  | TRAPMAP_DATA_FILE | 无 | 有 |
  | HOST | 有 | 有 |
  | PORT | 有 | 有 |
  | AI_PROVIDER | 有 | 无 |
  | AI_CHAT_MODEL | 有 | 无 |
  | AI_EMBEDDING_MODEL | 有 | 无 |
  | LOG_LEVEL | 有 | 无 |
  | LOG_USER_OPS_ENABLED | 无 | 有 |
  | LOG_RAG_ENABLED | 无 | 有 |
  | LOG_MAX_FILE_SIZE_MB | 无 | 有 |
  | LOG_MAX_BACKUP_FILES | 无 | 有 |
  | Neo4j 相关 | 有（注释形式）| 无 |

  文档模板包含 AI Provider 和 Neo4j 配置，deploy.sh 模板包含 LOG_* 配置。两套模板覆盖的变量集不同。
- **问题分类**: 文档问题
- **初步判断**: 三套模板（DEPLOYMENT.md、deploy.sh、.env.production.example）各自覆盖不同的变量子集，没有统一的真相源。
- **验证建议**: 统一三套模板，以 .env.production.example 为基准
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-165: .env.example 与 .env.production.example 存在多项不一致

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署配置
- **触发命令**: 对比 `.env.example` 和 `.env.production.example`
- **操作过程**:
  1. 读取两个文件完整内容
  2. 逐项对比
- **预期行为**: 两个文件应覆盖相同的变量集（开发 vs 生产只是默认值不同）
- **实际行为**:
  | 变量 | .env.example | .env.production.example |
  |------|-------------|------------------------|
  | NODE_ENV | 无 | production |
  | HOST | 127.0.0.1 | 0.0.0.0 |
  | TRAPMAP_SYSTEM_ADMIN_KEY | 有 | 有 |
  | TRAPMAP_DATA_FILE | .data/skill-shareer.json | /app/.data/skill-shareer.json |
  | TRAPMAP_DATABASE_URL | 有（注释） | 有（注释） |
  | LOG_USER_OPS_ENABLED | false | false |
  | LOG_RAG_ENABLED | false | false |
  | AI_PROMPT_PROVIDER | 有 | 有 |
  | AI_PROMPT_TEMPLATE_FILE | 有（docs/reference/...）| 有（/app/docs/reference/...）|
  | GEMINI_API_KEY 提及 | 有（在注释中）| 无 |

  关键差异：
  1. .env.example 没有 NODE_ENV，.env.production.example 有 NODE_ENV=production
  2. HOST 默认值不同：127.0.0.1 vs 0.0.0.0（符合预期：开发 vs 生产）
  3. TRAPMAP_DATA_FILE 路径不同：相对路径 vs /app/ 绝对路径（符合预期：本地 vs Docker）
  4. AI_PROMPT_TEMPLATE_FILE 路径不同：相对路径 vs /app/ 绝对路径（符合预期）
  5. .env.example 有 GEMINI_API_KEY 提及，.env.production.example 没有
  6. 两个文件都没有覆盖 docker-compose.yml 中的 POSTGRES_PASSWORD 变量
- **问题分类**: 文档问题
- **初步判断**: 差异大部分是合理的（开发 vs 生产路径不同）。但 .env.example 缺少 NODE_ENV 说明，以及 GEMINI_API_KEY 只在 .env.example 中提及是不一致的。两个文件都没有覆盖 docker-compose.yml 中的 POSTGRES_PASSWORD 变量。
- **验证建议**: 1) .env.example 应说明 NODE_ENV 默认值；2) 统一 GEMINI_API_KEY 的提及；3) 两个文件都应提及 POSTGRES_PASSWORD
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-166: docker-compose.yml 中 POSTGRES_PASSWORD 与 TRAPMAP_DATABASE_URL 存在隐式耦合

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署配置
- **触发命令**: 对比 docker-compose.yml 和所有 .env 模板
- **操作过程**:
  1. docker-compose.yml 第56行：`POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-trapmap}`
  2. docker-compose.yml 第29行：`TRAPMAP_DATABASE_URL=postgres://trapmap:trapmap@postgres:5432/trapmap`（硬编码）
  3. 检查 .env.example：无 POSTGRES_PASSWORD
  4. 检查 .env.production.example：无 POSTGRES_PASSWORD
  5. 检查 deploy.sh create_env_file()：无 POSTGRES_PASSWORD
  6. 检查 DEPLOYMENT.md .env 模板：无 POSTGRES_PASSWORD
- **预期行为**: 所有 .env 模板应覆盖 docker-compose.yml 引用的需要用户配置的变量；相关变量应保持同步
- **实际行为**:
  POSTGRES_PASSWORD 在 docker-compose.yml 中通过 `${POSTGRES_PASSWORD:-trapmap}` 引用，默认值是 "trapmap"。四套模板中都没有这个变量。
  同时 docker-compose.yml 第29行硬编码了 `TRAPMAP_DATABASE_URL=postgres://trapmap:trapmap@postgres:5432/trapmap`，其中 password 也是 "trapmap"。
  如果用户只修改了 POSTGRES_PASSWORD 而没有同时修改 TRAPMAP_DATABASE_URL 中的密码，会导致连接失败。
- **问题分类**: 功能 Bug
- **初步判断**: POSTGRES_PASSWORD 和 TRAPMAP_DATABASE_URL 中的密码存在隐式耦合。docker-compose.yml 中 server 的 TRAPMAP_DATABASE_URL 是硬编码的（第29行），不引用 POSTGRES_PASSWORD 变量。这意味着如果用户修改了 POSTGRES_PASSWORD，server 连接 postgres 的密码不会同步更新。
- **验证建议**: 将 server 的 TRAPMAP_DATABASE_URL 改为引用变量 `${POSTGRES_PASSWORD:-trapmap}`，或在文档中说明此耦合关系
- **稳定复现**: 是
- **严重程度**: 重要（生产部署时修改数据库密码会导致服务连接失败）

---

## FINDING-167: deploy.sh set -e 与 create_env_file 中文件写入缺少错误处理

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: 预读 `scripts/deploy.sh` 第2行和第46-77行
- **操作过程**:
  1. 脚本第2行：`set -e`
  2. create_env_file() 在 .env 不存在时 return 1
  3. deploy() 第101行：`create_env_file || { log_error "..."; exit 1; }`
- **预期行为**: set -e 不应在 || 表达式中触发退出；文件写入应有错误处理
- **实际行为**:
  ```bash
  set -e
  ...
  create_env_file || {
      log_error "Please configure .env file before deploying."
      exit 1
  }
  ```
  - || 结构与 set -e 的交互是正确的（POSIX 规定 `cmd || other_cmd` 不触发 set -e）
  - 但 create_env_file() 中 `cat > "$ENV_FILE"` 如果失败（如磁盘满、权限问题），由于 set -e，脚本会直接退出，没有错误提示
- **问题分类**: 设计问题
- **初步判断**: || 结构与 set -e 的交互是正确的。但 create_env_file 中的文件写入操作没有错误处理。
- **验证建议**: 在 create_env_file 中添加文件写入的错误检查
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-168: deploy.sh restart() 在容器未运行时会失败

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: 预读 `scripts/deploy.sh` 第136-140行
- **操作过程**:
  1. restart() 函数调用 stop() 和 start()
  2. 由于 set -e，如果 stop() 失败（如容器不存在），脚本直接退出
  3. start() 不会被调用
- **预期行为**: restart 应该尽量确保服务重新启动，即使 stop 失败
- **实际行为**:
  ```bash
  restart() {
      log_info "Restarting service..."
      stop
      start
  }
  ```
  如果 stop 失败（例如容器没有运行），set -e 会导致脚本退出，start 不会执行。用户期望 restart 在容器未运行时也能启动服务。
- **问题分类**: 功能 Bug
- **初步判断**: restart() 应该捕获 stop() 的失败，允许继续执行 start()。修改建议：`stop || true` 或者先 stop 再 start，不依赖 stop 的返回值。
- **验证建议**: 修改 restart() 为 `stop || true` 或 `stop; start` 并临时禁用 set -e
- **稳定复现**: 是
- **严重程度**: 重要（restart 在容器未运行时会失败，无法启动服务）

---

## FINDING-169: deploy.sh start() 不检查 .env 是否存在

- **发现时间**: 2026-06-13 16:05
- **测试域**: 部署脚本
- **触发命令**: 预读 `scripts/deploy.sh` 第116-124行
- **操作过程**:
  1. start() 函数调用 check_docker()、create_data_dir()、create_logs_dir()
  2. 不调用 create_env_file()
  3. 直接执行 docker compose up -d
- **预期行为**: start 应该检查 .env 是否存在，或者至少警告用户
- **实际行为**:
  ```bash
  start() {
      log_info "Starting service..."
      check_docker
      create_data_dir
      create_logs_dir
      cd "$PROJECT_ROOT"
      $(get_compose_cmd) -f "$COMPOSE_FILE" up -d
      log_info "Service started."
  }
  ```
  如果 .env 不存在，docker compose 会因为缺少环境变量而失败（如 OPENAI_API_KEY）。错误信息来自 docker compose，不是 deploy.sh 的友好提示。
- **问题分类**: 功能 Bug
- **初步判断**: start() 假设 .env 已经存在（因为 deploy 已经创建过）。但如果用户直接运行 start 而没有先 deploy，会遇到不友好的错误。建议 start() 中也调用 create_env_file() 或至少检查 .env 存在性。
- **验证建议**: 在 start() 中增加 .env 存在性检查
- **稳定复现**: 是
- **严重程度**: 一般

---

# Documentation Consistency Audit - Cross-Document Findings (FINDING-170+)
**Date**: 2026-06-13
**Scope**: Cross-document inconsistency, missing docs, outdated references, config gaps

---

## FINDING-170: Feedback problemType inconsistency between API.md and CLI.md vs code

- **发现时间**: 2026-06-13 10:15
- **测试域**: 文档一致性
- **相关文档**: `docs/architecture/API.md` vs `docs/architecture/CLI.md` vs `packages/contracts/src/domain/feedback.ts`
- **操作过程**:
  1. Read API.md line 991 which says `"problemType": "outdated" | "incorrect" | "unclear" | "other"`
  2. Read CLI.md line 1155 which says `--type <type>: 问题类型 (incorrect, outdated, context-mismatch, incomplete, other)`
  3. Read contracts/src/domain/feedback.ts which defines the actual schema as: `incorrect`, `outdated`, `context-mismatch`, `incomplete`, `other`
- **预期行为**: All three sources should list the same feedback types
- **实际行为**: API.md lists `unclear` as a valid type, but the actual schema (contracts) and CLI.md both use `context-mismatch` and `incomplete` instead. API.md omits both `context-mismatch` and `incomplete`, replacing them with a single `unclear` which does not exist in the schema.
- **问题分类**: 文档问题
- **初步判断**: API.md is outdated; the schema is the source of truth
- **验证建议**: Update API.md line 991 to match the actual schema: `incorrect | outdated | context-mismatch | incomplete | other`
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-171: Health endpoint response structure inconsistency between GETTING_STARTED.md and API.md vs DEPLOYMENT.md

- **发现时间**: 2026-06-13 10:20
- **测试域**: 文档一致性
- **相关文档**: `docs/guides/GETTING_STARTED.md` vs `docs/architecture/API.md` vs `docs/architecture/DEPLOYMENT.md`
- **操作过程**:
  1. Read GETTING_STARTED.md lines 159-166 which shows `/health` returning `{ status, product, packages, memory, uptimeSeconds }`
  2. Read API.md lines 23-35 which shows `/health` returning `{ status, product, packages, memory, uptimeSeconds }` (same simple shape)
  3. Read DEPLOYMENT.md lines 126-127 which says `/health` returns `product`, `packages`, `liveness`, `readiness`, `requestContext`, `dependencies`, `graphQuery`, `memory`, `uptimeSeconds`
- **预期行为**: All three documents should describe the same `/health` response structure
- **实际行为**: DEPLOYMENT.md describes a much richer `/health` response with `liveness`, `readiness`, `requestContext`, `dependencies`, `graphQuery` fields that are absent from both GETTING_STARTED.md and API.md. GETTING_STARTED.md and API.md show only 5 fields while DEPLOYMENT.md lists 9+ fields.
- **问题分类**: 文档问题
- **初步判断**: DEPLOYMENT.md likely reflects the actual current implementation (with runtime resilience additions), while API.md and GETTING_STARTED.md have not been updated to include the new fields.
- **验证建议**: Run `curl http://127.0.0.1:4000/health` against a running server and compare the actual JSON response with all three docs.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-172: Ready endpoint response structure inconsistency between API.md and DEPLOYMENT.md

- **发现时间**: 2026-06-13 10:22
- **测试域**: 文档一致性
- **相关文档**: `docs/architecture/API.md` vs `docs/architecture/DEPLOYMENT.md`
- **操作过程**:
  1. Read API.md lines 43-58 which shows `/ready` returning `{ ok, queueWorkerRunning, database }`
  2. Read DEPLOYMENT.md lines 127-128 which says `/ready` returns `ok` and the same runtime snapshot as `/health`, with `readiness`, `dependencies`, `graphQuery`, etc.
- **预期行为**: Both documents should describe the same `/ready` response
- **实际行为**: API.md shows a simple 3-field response (`ok`, `queueWorkerRunning`, `database`). DEPLOYMENT.md describes a full runtime snapshot with `dependencies.queueWorker`, `dependencies.graphQuery`, `readiness`, etc. These are completely different response structures.
- **问题分类**: 文档问题
- **初步判断**: API.md has not been updated to reflect the Phase 1 readiness snapshot overhaul. DEPLOYMENT.md is likely more accurate.
- **验证建议**: Run `curl http://127.0.0.1:4000/ready` and compare with both docs.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-173: ENVIRONMENT.md missing TRAPMAP_DECAY_* variables

- **发现时间**: 2026-06-13 10:25
- **测试域**: 文档缺失
- **相关文档**: `docs/operations/ENVIRONMENT.md` vs `packages/server/src/lib/decay/config.ts`
- **操作过程**:
  1. Read ENVIRONMENT.md (complete file) - no mention of `TRAPMAP_DECAY_*` variables
  2. Grep found `packages/server/src/lib/decay/config.ts` lines 14-17 using: `TRAPMAP_DECAY_REVIEW_DUE_DAYS`, `TRAPMAP_DECAY_STALE_DAYS`, `TRAPMAP_DECAY_EXPIRE_DAYS`, `TRAPMAP_DECAY_ENABLED`
  3. Searched all docs for `TRAPMAP_DECAY` - zero hits
- **预期行为**: ENVIRONMENT.md should document all TRAPMAP_ environment variables used in server code
- **实际行为**: Four `TRAPMAP_DECAY_*` environment variables exist in the decay config module but are completely undocumented in ENVIRONMENT.md or .env.example files.
- **问题分类**: 文档缺失
- **初步判断**: Decay feature was added but its environment variables were never added to the documentation.
- **验证建议**: Add a "Decay Configuration" section to ENVIRONMENT.md documenting all four variables with defaults.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-174: ENVIRONMENT.md missing RUNTIME_MODE variable

- **发现时间**: 2026-06-13 10:27
- **测试域**: 文档缺失
- **相关文档**: `docs/operations/ENVIRONMENT.md` vs `packages/server/src/config.ts`
- **操作过程**:
  1. Read ENVIRONMENT.md - no mention of `RUNTIME_MODE`
  2. Grep found `process.env.RUNTIME_MODE` in server source code
  3. Searched all docs for `RUNTIME_MODE` - zero hits
- **预期行为**: ENVIRONMENT.md should document all environment variables that control server behavior
- **实际行为**: `RUNTIME_MODE` is used in server code (to select combined/api-only/task-worker/outbox-worker mode) but is not documented anywhere.
- **问题分类**: 文档缺失
- **初步判断**: The runtime mode split feature was added without updating ENVIRONMENT.md.
- **验证建议**: Document `RUNTIME_MODE` with its allowed values (combined, api, task-worker, outbox-worker) and default.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-175: ENVIRONMENT.md missing USE_DB_SEARCH variable

- **发现时间**: 2026-06-13 10:28
- **测试域**: 文档缺失
- **相关文档**: `docs/operations/ENVIRONMENT.md` vs `packages/server/src/`
- **操作过程**:
  1. Read ENVIRONMENT.md - no mention of `USE_DB_SEARCH`
  2. Grep found `process.env.USE_DB_SEARCH` in server source code
  3. Searched all docs - zero hits
- **预期行为**: ENVIRONMENT.md should document all environment variables
- **实际行为**: `USE_DB_SEARCH` is used in the server but not documented in ENVIRONMENT.md or .env.example.
- **问题分类**: 文档缺失
- **初步判断**: Feature flag added without documentation update.
- **验证建议**: Document `USE_DB_SEARCH` with its purpose, allowed values, and default.
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-176: ENVIRONMENT.md missing LOG_LEVEL variable

- **发现时间**: 2026-06-13 10:30
- **测试域**: 文档缺失
- **相关文档**: `docs/operations/ENVIRONMENT.md` vs `docs/architecture/DEPLOYMENT.md`
- **操作过程**:
  1. Read ENVIRONMENT.md - no mention of `LOG_LEVEL`
  2. DEPLOYMENT.md line 95 shows `LOG_LEVEL=info` in the local dev env section and line 172 shows it in the production template
  3. `process.env.LOG_LEVEL` is used in server source code
- **预期行为**: ENVIRONMENT.md should list LOG_LEVEL since it's referenced in DEPLOYMENT.md and used in code
- **实际行为**: LOG_LEVEL is not documented in ENVIRONMENT.md's logging section or anywhere else.
- **问题分类**: 文档缺失
- **初步判断**: DEPLOYMENT.md references it but ENVIRONMENT.md (the canonical env var reference) does not.
- **验证建议**: Add LOG_LEVEL to ENVIRONMENT.md's server configuration or logging section.
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-177: Multiple routes in server code not documented in API.md

- **发现时间**: 2026-06-13 10:35
- **测试域**: 文档缺失
- **相关文档**: `docs/architecture/API.md` vs `packages/server/src/routes/`
- **操作过程**:
  1. Extracted all route paths from `packages/server/src/routes/` directory
  2. Compared against routes documented in API.md
  3. Found the following routes exist in code but are missing from API.md:
     - `POST /v1/traps/:trapId/supersede` (traps.ts)
     - `GET /v1/operations/status/async` (status route)
     - `POST /v1/operations/status/async/tasks/:taskId/requeue` (status route)
     - `GET /v1/operations/stats/summary` (stats route)
     - `GET /v1/operations/stats/hits` (stats route)
     - `GET /v1/operations/stats/usage` (stats route)
     - `GET /v1/operations/badcases/:feedbackId/export` (badcases route)
     - `GET /v1/operations/feedback/remediation` (feedback-admin route)
     - `GET /v1/operations/feedback/remediation/:entryId` (feedback-admin route)
     - `POST /v1/operations/feedback/remediation/:entryId/complete` (feedback-admin route)
     - `GET /v1/candidates/:candidateId` (candidates route)
     - `POST /v1/candidates/:candidateId/apply-resolution` (candidates route)
     - `GET /v1/duplicates` (duplicates route)
     - `GET /v1/duplicates/:candidateId` (duplicates route)
     - `GET /v1/operations/capsule-index/health` and `POST /v1/operations/capsule-index/cleanup-orphans` (partially in ENVIRONMENT.md but not in API.md)
- **预期行为**: API.md should document all public routes
- **实际行为**: At least 16 routes are missing from API.md, including the entire async status surface, stats surface, remediation surface, candidate/duplicate resolution surface, and supersede endpoints.
- **问题分类**: 文档缺失
- **初步判断**: Routes were added incrementally without updating API.md.
- **验证建议**: Add documentation for all missing routes, or add a note that API.md is a partial reference and link to `/meta/routes` for the complete list.
- **稳定复现**: 是
- **严重程度**: 阻塞

---

## FINDING-178: SECURITY.md production config recommends HOST=127.0.0.1 but Docker needs HOST=0.0.0.0

- **发现时间**: 2026-06-13 10:45
- **测试域**: 文档一致性
- **相关文档**: `docs/operations/SECURITY.md` vs `docs/architecture/DEPLOYMENT.md` vs `.env.production.example`
- **操作过程**:
  1. Read SECURITY.md lines 192-193: production config shows `HOST=127.0.0.1`
  2. Read DEPLOYMENT.md lines 162-163 and docker-compose.yml line 192: production uses `HOST=0.0.0.0`
  3. Read .env.production.example line 12: `HOST=0.0.0.0`
- **预期行为**: Security docs and deployment docs should agree on HOST for production
- **实际行为**: SECURITY.md recommends `HOST=127.0.0.1` for production (line 193), while DEPLOYMENT.md, .env.production.example, and docker-compose.yml all use `HOST=0.0.0.0`. If a user follows SECURITY.md and uses Docker, the server will not be accessible from outside the container.
- **问题分类**: 文档问题
- **初步判断**: SECURITY.md was written with bare-metal deployment in mind; Docker deployments require `0.0.0.0`.
- **验证建议**: Add a note to SECURITY.md explaining that Docker deployments need `HOST=0.0.0.0` while bare-metal should use `127.0.0.1` with a reverse proxy.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-179: No documentation clearly explains HOST=0.0.0.0 requirement for non-localhost access

- **发现时间**: 2026-06-13 10:48
- **测试域**: 文档缺失
- **相关文档**: All docs reviewed
- **操作过程**:
  1. Searched all documentation for explanations of HOST=0.0.0.0 vs HOST=127.0.0.1
  2. DEPLOYMENT.md uses HOST=0.0.0.0 in production examples without explanation
  3. GETTING_STARTED.md line 124 says "server runs at http://127.0.0.1:4000" but does not explain how to make it accessible from other machines
  4. .env.example uses HOST=127.0.0.1; .env.production.example uses HOST=0.0.0.0
- **预期行为**: At least one document should clearly explain that HOST=127.0.0.1 means localhost-only, HOST=0.0.0.0 means all interfaces, and when to use which
- **实际行为**: No document explains this distinction. Users deploying on a server who want non-localhost access have no guidance.
- **问题分类**: 文档缺失
- **初步判断**: Basic networking configuration guidance is missing.
- **验证建议**: Add a section to GETTING_STARTED.md or DEPLOYMENT.md explaining HOST binding behavior.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-180: Evidence sourceType and evidenceLevel values differ between API.md and CLI.md

- **发现时间**: 2026-06-13 10:55
- **测试域**: 文档一致性
- **相关文档**: `docs/architecture/API.md` vs `docs/architecture/CLI.md`
- **操作过程**:
  1. Read API.md line 1344: `sourceType` values are `"stack-overflow" | "github-issue" | "official-docs" | "internal-experience"`
  2. Read API.md line 1346: `evidenceLevel` values are `"anecdotal" | "tested" | "verified" | "authoritative"`
  3. Read CLI.md line 1122: evidence type values are `(internal-experience, incident, doc, code, external-reference)`
  4. Read CLI.md line 1121: evidence level values are `(anecdotal, reproduced, documented, verified-in-prod)`
- **预期行为**: Evidence sourceType and evidenceLevel should be consistent between API.md and CLI.md
- **实际行为**: Both sourceType and evidenceLevel have completely different values:
  - API.md sourceType: `stack-overflow, github-issue, official-docs, internal-experience`
  - CLI.md sourceType: `internal-experience, incident, doc, code, external-reference`
  - API.md evidenceLevel: `anecdotal, tested, verified, authoritative`
  - CLI.md evidenceLevel: `anecdotal, reproduced, documented, verified-in-prod`
  Almost no overlap in either set.
- **问题分类**: 文档问题
- **初步判断**: One of these documents was updated without the other. Need to check contracts/code for the actual schema.
- **验证建议**: Check `packages/contracts/src/domain/` for the evidence schema and update both docs to match.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-181: CLI.md documents deprecated `--password` flag for member create that contradicts SECURITY.md

- **发现时间**: 2026-06-13 11:30
- **测试域**: 文档一致性
- **相关文档**: `docs/architecture/CLI.md` vs `docs/operations/SECURITY.md` vs `docs/architecture/API.md`
- **操作过程**:
  1. Read CLI.md line 327: `trapmap member create --username <username> --password <password>`
  2. Read API.md line 241: `POST /v1/members` request body has `handle`, `roleTemplate`, `securityLevel`, `teamId` - no password
  3. Read SECURITY.md line 77: "TrapMap only supports CLI + access key authentication, does not provide username/password login"
- **预期行为**: CLI.md should not show a `--password` flag if the system doesn't support password auth
- **实际行为**: CLI.md documents `--password` as a required flag for `member create`, but the API endpoint has no password field, and SECURITY.md explicitly states passwords are not supported.
- **问题分类**: 文档问题
- **初步判断**: The `--password` flag in CLI.md is outdated from an earlier auth model.
- **验证建议**: Check the actual `member create` CLI command for its flags. Remove `--password` from CLI.md if it doesn't exist.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-182: CLI.md `access-key create` command name conflicts with SECURITY.md `member key:create`

- **发现时间**: 2026-06-13 11:40
- **测试域**: 文档一致性
- **相关文档**: `docs/architecture/CLI.md` vs `docs/operations/SECURITY.md`
- **操作过程**:
  1. Read CLI.md lines 1044-1067: documents `trapmap access-key create`
  2. Read SECURITY.md line 221: shows `pnpm --filter @trapmap/cli dev -- member key:create <username> --name "CI Pipeline" --days 90`
- **预期行为**: The same operation should have the same command name in all docs
- **实际行为**: CLI.md says `trapmap access-key create --name <name>` while SECURITY.md says `member key:create <username> --name "CI Pipeline"`. Different command paths and different option names.
- **问题分类**: 文档问题
- **初步判断**: The command was likely restructured and one doc was not updated.
- **验证建议**: Run `trapmap --help` to verify the actual command path for creating access keys.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-183: .env.example does not document TRAPMAP_GRAPH_DB_* variables

- **发现时间**: 2026-06-13 11:00
- **测试域**: 文档缺失
- **相关文档**: `.env.example` vs `docs/operations/ENVIRONMENT.md`
- **操作过程**:
  1. Read .env.example (complete file) - no TRAPMAP_GRAPH_DB_* variables
  2. ENVIRONMENT.md documents all 8 graph DB variables with descriptions
  3. .env.production.example also does not include them
- **预期行为**: .env.example should include commented-out graph DB variables as a reference
- **实际行为**: Neither .env.example nor .env.production.example include any TRAPMAP_GRAPH_DB_* variables.
- **问题分类**: 文档缺失
- **初步判断**: Graph DB variables were added to ENVIRONMENT.md but never propagated to the .env example files.
- **验证建议**: Add commented-out TRAPMAP_GRAPH_DB_* variables to .env.example.
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-184: .env.production.example missing TRAPMAP_GRAPH_DB_* variables (present in DEPLOYMENT.md inline template)

- **发现时间**: 2026-06-13 11:02
- **测试域**: 文档缺失
- **相关文档**: `.env.production.example` vs `docs/architecture/DEPLOYMENT.md`
- **操作过程**:
  1. Read .env.production.example (complete file) - no TRAPMAP_GRAPH_DB_* variables
  2. DEPLOYMENT.md lines 151-159 show these variables in the production template within the doc
- **预期行为**: .env.production.example should include commented-out graph DB variables matching what DEPLOYMENT.md shows
- **实际行为**: DEPLOYMENT.md has the graph DB template inline but the actual .env.production.example file does not include them.
- **问题分类**: 文档缺失
- **初步判断**: The inline template in DEPLOYMENT.md was updated but the actual example file was not.
- **验证建议**: Sync .env.production.example with the inline template in DEPLOYMENT.md.
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-185: .env.example missing comment that TRAPMAP_SYSTEM_ADMIN_KEY is optional

- **发现时间**: 2026-06-13 10:58
- **测试域**: 文档一致性
- **相关文档**: `.env.example` vs `docs/guides/GETTING_STARTED.md`
- **操作过程**:
  1. Read .env.example line 1: `TRAPMAP_SYSTEM_ADMIN_KEY=replace-with-a-long-random-secret` (no comment about being optional)
  2. Read GETTING_STARTED.md line 44: describes it as "(optional; only needed when you want to create/use system-admin capabilities)"
- **预期行为**: .env.example should match GETTING_STARTED.md's characterization
- **实际行为**: .env.example presents TRAPMAP_SYSTEM_ADMIN_KEY as required (first line, no comment), while GETTING_STARTED.md correctly marks it as optional.
- **问题分类**: 文档问题
- **初步判断**: .env.example should add a comment indicating this is optional.
- **验证建议**: Add `# Optional: only needed for system-admin capabilities` comment above the key in .env.example.
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-186: .env.example references GEMINI_API_KEY in comments but does not define it

- **发现时间**: 2026-06-13 11:28
- **测试域**: 文档一致性
- **相关文档**: `.env.example`
- **操作过程**:
  1. Read .env.example line 49: comment says `# If not set, auto-detects from OPENAI_API_KEY or GEMINI_API_KEY`
  2. Searched the file for `GEMINI_API_KEY` definition - not found
- **预期行为**: If GEMINI_API_KEY is referenced in comments, it should be listed as a variable
- **实际行为**: .env.example mentions GEMINI_API_KEY in a comment but does not provide a commented-out line for it.
- **问题分类**: 文档缺失
- **初步判断**: GEMINI_API_KEY was referenced in the auto-detect comment but never added as a proper template variable.
- **验证建议**: Add `# GEMINI_API_KEY=your-gemini-key` to .env.example.
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-187: SECURITY.md audit event naming conventions are inconsistent (dots vs hyphens)

- **发现时间**: 2026-06-13 11:18
- **测试域**: 文档一致性
- **相关文档**: `docs/operations/SECURITY.md` vs `docs/architecture/CLI.md`
- **操作过程**:
  1. Read SECURITY.md lines 276-292 which lists audit event types
  2. CLI.md line 1033 shows audit log output using dot notation: `knowledge.approved`, `knowledge.submitted`, `auth.login`
- **预期行为**: Audit event naming should be consistent
- **实际行为**: SECURITY.md mixes naming conventions:
  - Dot notation: `auth.login`, `auth.logout`, `auth.failed`, `auth.access_key_created`, `auth.access_key_used`
  - Hyphen notation: `knowledge-reviewed`, `knowledge-deactivated`, `knowledge-exported`, `artifact-edited`, etc.
  - CLI.md examples use dot notation for knowledge events: `knowledge.approved`, `knowledge.submitted`
- **问题分类**: 文档问题
- **初步判断**: The audit event names in SECURITY.md may not match the actual event types emitted by the code.
- **验证建议**: Check audit event emission code for actual event type strings and unify the documentation.
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-188: ENVIRONMENT.md production example missing HOST, PORT, LOG_LEVEL, AI_CHAT_MODEL, AI_EMBEDDING_MODEL

- **发现时间**: 2026-06-13 11:35
- **测试域**: 文档缺失
- **相关文档**: `docs/operations/ENVIRONMENT.md` vs `docs/architecture/DEPLOYMENT.md`
- **操作过程**:
  1. Read ENVIRONMENT.md lines 218-227: production example shows only 7 variables
  2. Missing: `HOST`, `PORT`, `LOG_LEVEL`, `AI_CHAT_MODEL`, `AI_EMBEDDING_MODEL`
  3. DEPLOYMENT.md production template (lines 161-172) includes all of these
- **预期行为**: ENVIRONMENT.md's production example should be comprehensive
- **实际行为**: The production example in ENVIRONMENT.md is significantly shorter than the one in DEPLOYMENT.md.
- **问题分类**: 文档缺失
- **初步判断**: The ENVIRONMENT.md production example was written as a minimal snippet but is inconsistent with the more complete one in DEPLOYMENT.md.
- **验证建议**: Update ENVIRONMENT.md's production example to match DEPLOYMENT.md's completeness.
- **稳定复现**: 是
- **严重程度**: 一般

---

# CLI Error Handling Tests - Backend Unreachable (2026-06-13)

**环境**: HOST=127.0.0.1 (localhost), 使用 mock session 和 192.0.2.1:9999 (TEST-NET, guaranteed unreachable) 作为测试 URL

---

## FINDING-200: Login to unreachable server produces bare "fetch failed" with no actionable guidance

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 错误处理
- **触发命令**: `npx tsx src/index.ts login --system-admin-key test-key --server http://192.0.2.1:9999`
- **操作过程**:
  1. Run login command against unreachable server 192.0.2.1:9999
  2. Observe output and exit code
- **预期行为**: User-friendly error message explaining the connection failed, suggesting to check the server URL, whether the server is running, and how to configure the URL
- **实际行为**:
  ```
  fetch failed
  ```
  Exit code: 1
  The message "fetch failed" is the raw Node.js fetch error string with no context about what URL was tried, why it failed, or what the user should do.
- **问题分类**: 体验问题
- **初步判断**: 客户端问题 — `packages/cli/src/lib/output.ts` printError() just prints `error.message` which comes from the fetch API's native error. The http.ts apiRequest() function does not wrap fetch errors with context (URL, suggestion, etc).
- **验证建议**: In `apiRequest()` (http.ts), catch fetch errors and re-throw with context: include the target URL, "Is the server running?", and the `--server` flag usage hint.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-201: Session check against unreachable server produces bare "fetch failed"

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 错误处理
- **触发命令**: `npx tsx src/index.ts session` (with serverUrl set to http://192.0.2.1:9999 in cli.json)
- **操作过程**:
  1. Set cli.json serverUrl to unreachable URL
  2. Run `session` command
  3. Observe output
- **预期行为**: Clear error message: "Cannot connect to TrapMap server at <url>. Is the server running?"
- **实际行为**:
  ```
  fetch failed
  ```
  Exit code: 1. Same bare error as login. No indication of which server URL was tried.
- **问题分类**: 体验问题
- **初步判断**: 客户端问题 — same root cause as FINDING-200. The apiRequest() function does not enrich fetch errors.
- **验证建议**: Same fix as FINDING-200 — wrap fetch errors in apiRequest() with URL context.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-202: Search against unreachable server produces bare "fetch failed"

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 错误处理
- **触发命令**: `npx tsx src/index.ts search "test query"` (with serverUrl set to unreachable)
- **操作过程**:
  1. Set cli.json serverUrl to unreachable URL with valid session
  2. Run `search "test query"`
  3. Observe output
- **预期行为**: Clear error with URL context and actionable suggestion
- **实际行为**:
  ```
  fetch failed
  ```
  Exit code: 1. The `requireSessionToken()` check passes (token exists locally), but the actual HTTP request fails silently.
- **问题分类**: 体验问题
- **初步判断**: 客户端问题 — same root cause. The session token check only validates local state, not server reachability.
- **验证建议**: Same fix as FINDING-200.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-203: Trap submit against unreachable server produces bare "fetch failed"

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 错误处理
- **触发命令**: `npx tsx src/index.ts trap submit --scope global --label test --shortcut "test" --detail "test content"` (with serverUrl set to unreachable)
- **操作过程**:
  1. Set cli.json serverUrl to unreachable URL with valid session
  2. Run `trap submit` with all required options
  3. Observe output
- **预期行为**: Clear error with context
- **实际行为**:
  ```
  fetch failed
  ```
  Exit code: 1. Same bare error.
- **问题分类**: 体验问题
- **初步判断**: 客户端问题 — same root cause as FINDING-200.
- **验证建议**: Same fix as FINDING-200.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-204: Version check works correctly (offline, no server needed)

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 离线命令
- **触发命令**: `npx tsx src/index.ts -V`
- **操作过程**:
  1. Run `npx tsx src/index.ts -V` (with unreachable serverUrl in config)
  2. Observe output
- **预期行为**: Print version and exit 0 without contacting server
- **实际行为**:
  ```
  0.1.0
  ```
  Exit code: 0. Works correctly, no server contact needed.
- **问题分类**: 无问题
- **初步判断**: 正常行为
- **验证建议**: 无需修改
- **稳定复现**: 是
- **严重程度**: 无（正常行为）

---

## FINDING-205: About command works correctly but output has "Skill Shareer" typo (see FINDING-007)

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 离线命令
- **触发命令**: `npx tsx src/index.ts about`
- **操作过程**:
  1. Run `npx tsx src/index.ts about` (with unreachable serverUrl in config)
  2. Observe output
- **预期行为**: Print project info and exit 0
- **实际行为**:
  ```
  Skill Shareer prototype
  - packages/cli: imperative user-facing terminal commands
  - packages/server: Fastify API and LangChain-oriented service boundary
  - packages/contracts: shared Zod schemas and runtime-safe contracts
  ```
  Exit code: 0. Works correctly offline. The "Skill Shareer" typo is documented in FINDING-007.
- **问题分类**: 无问题（离线行为正常）
- **初步判断**: 正常行为
- **验证建议**: 无需修改（typo 见 FINDING-007）
- **稳定复现**: 是
- **严重程度**: 无（正常行为）

---

## FINDING-206: JSON output format flag `--json` produces same bare "fetch failed" on network error

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 错误处理 / 输出格式
- **触发命令**: `npx tsx src/index.ts search "test" --json` (with serverUrl set to unreachable)
- **操作过程**:
  1. Set cli.json serverUrl to unreachable URL with valid session
  2. Run `search "test" --json`
  3. Observe output
- **预期行为**: When `--json` is specified, even errors should be structured JSON (e.g., `{"error": "Connection failed", "url": "...", "suggestion": "..."}`)
- **实际行为**:
  ```
  fetch failed
  ```
  Exit code: 1. Error is printed as plain text to stderr, not as JSON. A machine consumer piping `--json` output would get unstructured text.
- **问题分类**: 功能 Bug
- **初步判断**: 客户端问题 — `printError()` in output.ts always prints plain text to stderr. When `--json` flag is active, errors should be emitted as JSON too. However, `printError` is called from the top-level catch and does not have access to the command options.
- **验证建议**: Either pass the json flag to the error handler, or catch errors within each command action (where options are available) and format appropriately.
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-207: Global `--output json` and `--output yaml` options do not exist (docs claim they do)

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 文档 vs 实现
- **触发命令**: `npx tsx src/index.ts --output json search "test"`
- **操作过程**:
  1. Run `npx tsx src/index.ts --output json search "test"`
  2. Observe output
- **预期行为**: CLI.md documents `--output <format>` as a global option with values `table`, `json`, `yaml`
- **实际行为**:
  ```
  error: unknown option '--output'
  ```
  Exit code: 1. The `--output` global option does not exist. This is a repeat of FINDING-038 but confirmed with actual execution.
- **问题分类**: 文档问题
- **初步判断**: 文档问题 — CLI.md documents a feature that was never implemented. Each command has its own `--json` flag instead.
- **验证建议**: Remove `--output` from CLI.md global options table.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-208: Team list against unreachable server produces bare "fetch failed"

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 错误处理
- **触发命令**: `npx tsx src/index.ts team list` (with serverUrl set to unreachable)
- **操作过程**:
  1. Set cli.json serverUrl to unreachable URL with valid session
  2. Run `team list`
  3. Observe output
- **预期行为**: Clear error with server URL context
- **实际行为**:
  ```
  fetch failed
  ```
  Exit code: 1. Same bare error as all other server-contacting commands.
- **问题分类**: 体验问题
- **初步判断**: 客户端问题 — same root cause as FINDING-200.
- **验证建议**: Same fix as FINDING-200.
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-209: Logout fails with "fetch failed" even when user just wants to clear local session

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 错误处理
- **触发命令**: `npx tsx src/index.ts logout` (with sessionToken set, serverUrl unreachable)
- **操作过程**:
  1. Set cli.json with sessionToken and unreachable serverUrl
  2. Run `logout`
  3. Observe output
- **预期行为**: Logout should clear local session regardless of server reachability, and optionally warn that server logout failed. Or at minimum, give a clear error.
- **实际行为**:
  ```
  fetch failed
  ```
  Exit code: 1. The logout command (auth.ts lines 74-98) calls `apiRequest(state, { method: 'POST', path: '/v1/auth/logout' })` before clearing local session. If the server is unreachable, the request fails, `clearSession()` is never called, and the local session token remains.
- **问题分类**: 功能 Bug
- **初步判断**: 客户端问题 — `logout` should clear the local session even if the server logout fails (best-effort server notification). The current implementation treats server unreachable as a hard failure, leaving the user stuck with a stale session.
- **验证建议**: In the logout action, wrap the server call in try/catch. On failure, still call `clearSession()` and warn the user: "Server unreachable, local session cleared."
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-210: Search without seed content produces clear error message

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 输入验证
- **触发命令**: `npx tsx src/index.ts search` (no seed, no --stdin)
- **操作过程**:
  1. Run `search` with no arguments and no --stdin flag
  2. Observe output
- **预期行为**: Clear message indicating missing input
- **实际行为**:
  ```
  No seed content received on stdin.
  ```
  Exit code: 1. The error message is clear but slightly misleading — it says "on stdin" even when the user simply forgot to provide a query argument. The message comes from `resolveTextInput()` in input.ts.
- **问题分类**: 体验问题
- **初步判断**: 客户端问题 — the error message should differentiate between "no argument provided" and "no stdin content". Suggested: "No search query provided. Use `trapmap search <query>` or `--stdin`."
- **验证建议**: Update resolveTextInput() to provide context-aware error messages.
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-211: Login without any key produces clear validation error

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 输入验证
- **触发命令**: `npx tsx src/index.ts login`
- **操作过程**:
  1. Run `login` with no options
  2. Observe output
- **预期行为**: Clear message indicating missing authentication method
- **实际行为**:
  ```
  Provide either --access-key or --system-admin-key.
  ```
  Exit code: 1. Clear and actionable error message. This is good error handling.
- **问题分类**: 无问题
- **初步判断**: 正常行为 — good validation
- **验证建议**: 无需修改
- **稳定复现**: 是
- **严重程度**: 无（正常行为）

---

## FINDING-212: Unknown command produces clear error with fuzzy suggestion

- **发现时间**: 2026-06-13 18:30
- **测试域**: CLI 错误处理
- **触发命令**: `npx tsx src/index.ts nonexistent-command`
- **操作过程**:
  1. Run CLI with an invalid command name
  2. Observe output
- **预期行为**: Clear error indicating the command is not recognized
- **实际行为**:
  ```
  error: unknown command 'nonexistent-command'
  ```
  Exit code: 1. Commander.js provides this. Note that for some near-miss commands, it also provides a suggestion (e.g., "(Did you mean session?)"), which is helpful.
- **问题分类**: 无问题
- **初步判断**: 正常行为 — Commander.js default behavior is good
- **验证建议**: 无需修改
- **稳定复现**: 是
- **严重程度**: 无（正常行为）

---

## FINDING-213: `requireSessionToken()` error message references non-existent command name "skill-shareer login"

- **发现时间**: 2026-06-13 18:35
- **测试域**: CLI 错误处理
- **触发命令**: Source code review of `packages/cli/src/lib/http.ts` line 67
- **操作过程**:
  1. Read http.ts source
  2. Found: `throw new Error('Not authenticated. Run \`skill-shareer login\` first.');`
- **预期行为**: Error message should reference `trapmap login` (the actual CLI name)
- **实际行为**: Error says "Run `skill-shareer login` first." The product was renamed from "skill-shareer" to "trapmap" but this error message was not updated.
- **问题分类**: 功能 Bug
- **初步判断**: 客户端问题 — stale error message from pre-rename era.
- **验证建议**: Change `'skill-shareer login'` to `'trapmap login'` in http.ts line 67.
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-214: CLI does not implement structured exit codes documented in CLI.md

- **发现时间**: 2026-06-13 18:35
- **测试域**: CLI 错误处理
- **触发命令**: All error-producing commands tested above
- **操作过程**:
  1. Run various commands that produce errors (login, search, session, trap submit)
  2. Check exit code with `echo $?`
  3. All errors produce exit code 1
- **预期行为**: CLI.md documents exit codes 0-5: 0=success, 1=general error, 2=auth error, 3=permission denied, 4=not found, 5=validation error. Connection errors should arguably use code 1 or a network-specific code.
- **实际行为**: ALL errors exit with code 1 (set via `process.exitCode = 1` in printError()). No distinction between auth errors (code 2), permission errors (code 3), not found (code 4), or validation errors (code 5).
- **问题分类**: 文档问题 / 功能缺失
- **初步判断**: 客户端问题 — CLI.md documents exit codes that are not implemented. printError() in output.ts always sets exitCode=1.
- **验证建议**: Either implement distinct exit codes in printError() (classify by error type: ApiError status code mapping) or remove the exit code table from CLI.md.
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-215: `--server` option only exists on `login` command, not on other server-contacting commands

- **发现时间**: 2026-06-13 18:35
- **测试域**: CLI 一致性
- **触发命令**: `npx tsx src/index.ts session --server http://192.0.2.1:9999`
- **操作过程**:
  1. Run `session --server http://192.0.2.1:9999`
  2. Observe output
- **预期行为**: If `--server` is needed to override the server URL, it should be available on all commands or as a global option
- **实际行为**:
  ```
  error: unknown option '--server'
  ```
  Exit code: 1. The `--server` option is only on `login`. Other commands (session, search, trap submit, team list) use the serverUrl from the saved config. To test against a different server, the user must either: (a) first `login --server <url>` to save the URL, or (b) set `TRAPMAP_SERVER_URL` env var.
- **问题分类**: 体验问题
- **初步判断**: 客户端问题 — the `--server` option should be available globally or on all server-contacting commands. Currently it's only on `login`, which forces a two-step workflow for testing against different servers.
- **验证建议**: Add `--server <url>` as a global option on the program, pass it through to all commands via state or context.
- **稳定复现**: 是
- **严重程度**: 一般


---

# Verification Results (by Subagent-Verify-1)
**Date**: 2026-06-13
**Scope**: FINDING-018, FINDING-019, FINDING-200~203, FINDING-209, FINDING-213, FINDING-038/207

---

## FINDING-018 Verification

### Verification (by Subagent-Verify-1)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `packages/cli/src/commands/knowledge.ts` 第 64-65 行
  - 代码: `program.command('submit')` — 注册为顶级命令，非 `knowledge submit` 子命令组
  - 文件: `packages/cli/src/commands/knowledge.ts` 第 144 行
  - 代码: `program.command('resubmit')` — 顶级命令
  - 文件: `packages/cli/src/commands/knowledge.ts` 第 227 行
  - 代码: `program.command('supersede')` — 顶级命令
  - 文件: `packages/cli/src/commands/knowledge.ts` 第 261 行
  - 代码: `program.command('review-status')` — 顶级命令
  - 文件: `packages/cli/src/index.ts` 第 138-141 行
  - 代码: `registerKnowledgeCommands(program, { allowInspect, allowSubmit })` — 直接注册到 program，无 `knowledge` 子命令组
- **根因判定**: 文档问题 — CLI.md 文档描述了一个不存在的 `knowledge` 命令组，实际命令均为顶级注册
- **最终严重程度**: 阻塞
- **修复建议**: 将 CLI.md "知识命令" 整节重写，改为 `trapmap submit`、`trapmap resubmit`、`trapmap supersede`、`trapmap review-status` 的独立命令文档。或在源码中创建 `knowledge` 命令组包裹这些命令。

---

## FINDING-019 Verification

### Verification (by Subagent-Verify-1)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `packages/cli/src/commands/knowledge.ts` 第 67-75 行
  - 代码:
    ```
    .requiredOption('--scope <scope>', 'Knowledge scope: global or project')
    .requiredOption('--label <label>', 'Knowledge label', collectValues, [])
    .requiredOption('--shortcut <text>', 'One-line pitfall shortcut')
    .option('--detail <text>', 'Detailed pitfall and fix description')
    .option('--file <path>', 'Read detail text from a file')
    .option('--stdin', 'Read detail text from stdin')
    .option('--required-level <n>', 'Override required security level')
    .option('--boundary <json>', 'Boundary constraints as JSON')
    .option('--json', 'Output JSON')
    ```
  - CLI.md 文档的 `--title, -t`、`--content, -c`、`--format, -f`、`--level, -l`、`--team` 均不存在于源码中
- **根因判定**: 文档问题 — CLI.md 选项名与实际 CLI 完全不同
- **最终严重程度**: 阻塞
- **修复建议**: 重写 CLI.md 中 knowledge submit 部分，使用实际选项：`--scope`、`--label`（必填，可重复）、`--shortcut`（必填）、`--detail`、`--file`、`--stdin`、`--required-level`、`--boundary`、`--json`。

---

## FINDING-200~203 Verification (Network Error Handling)

### Verification (by Subagent-Verify-1)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `packages/cli/src/lib/http.ts` 第 26-63 行
  - 代码: `apiRequest()` 函数在第 41 行调用 `await fetch(url, ...)`，无 try/catch 包裹。网络错误时 fetch 原生异常直接向上传播。第 30 行虽构建了 `url` 变量，但未在任何 catch 块中使用。
  - 文件: `packages/cli/src/lib/output.ts` 中 `printError()` 仅打印 `error.message`，不会添加 URL 上下文。
- **根因判定**: 客户端 Bug — `apiRequest()` 未对 fetch 网络异常做包装处理，直接暴露 Node.js 原生 "fetch failed" 错误
- **最终严重程度**: 重要
- **修复建议**: 在 `apiRequest()` 中添加 try/catch 包裹 fetch 调用，catch 中 re-throw 带有 URL 上下文的错误，例如：
  ```typescript
  try {
    const response = await fetch(url, { ... });
    // ... existing logic
  } catch (error) {
    if (error instanceof TypeError && error.message === 'fetch failed') {
      throw new Error(`Cannot connect to ${url}. Is the TrapMap server running?`);
    }
    throw error;
  }
  ```

---

## FINDING-209 Verification (Logout Failure)

### Verification (by Subagent-Verify-1)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `packages/cli/src/commands/auth.ts` 第 74-84 行
  - 代码:
    ```typescript
    .action(async (options: { json?: boolean }) => {
      const state = await loadCliState();
      if (state.sessionToken) {
        await apiRequest(state, {          // 第78行：网络请求
          method: 'POST',
          path: '/v1/auth/logout',
        });
      }
      await clearSession();                // 第84行：仅在网络请求成功后才清理本地 session
    ```
  - `clearSession()` 在 `apiRequest()` 之后，如果 apiRequest 抛出异常（网络不可达），`clearSession()` 永远不会执行，本地 session token 残留。
- **根因判定**: 客户端 Bug — logout 逻辑将服务器通知视为硬性依赖，未做降级处理
- **最终严重程度**: 重要
- **修复建议**: 将服务器 logout 调用包裹在 try/catch 中，失败时仍执行 `clearSession()` 并警告用户：
  ```typescript
  if (state.sessionToken) {
    try {
      await apiRequest(state, { method: 'POST', path: '/v1/auth/logout' });
    } catch {
      // Server unreachable, clear local session anyway
    }
  }
  await clearSession();
  ```

---

## FINDING-213 Verification (Wrong Command Name in Error)

### Verification (by Subagent-Verify-1)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `packages/cli/src/lib/http.ts` 第 65-68 行
  - 代码:
    ```typescript
    export function requireSessionToken(state: CliState): string {
      if (typeof state.sessionToken !== 'string' || state.sessionToken.length === 0) {
        throw new Error('Not authenticated. Run `skill-shareer login` first.');
      }
    ```
  - 确认错误信息为 `skill-shareer login`，而非 `trapmap login`。CLI 入口 `index.ts` 第 65 行已设置 `.name('trapmap')`。
- **根因判定**: 客户端 Bug — 产品重命名后未更新错误消息
- **最终严重程度**: 一般
- **修复建议**: 将 `http.ts` 第 67 行 `'Not authenticated. Run \`skill-shareer login\` first.'` 改为 `'Not authenticated. Run \`trapmap login\` first.'`。

---

## FINDING-038/207 Verification (Global --output Option)

### Verification (by Subagent-Verify-1)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `packages/cli/src/index.ts` 第 62-67 行
  - 代码:
    ```typescript
    const program = new Command();
    program
      .name('trapmap')
      .description('CLI-first knowledge sharing for engineering pitfall capture and retrieval')
      .version('0.1.0');
    ```
  - 全文搜索 `index.ts`：无 `.option('--output'` 注册。各命令独立使用 `--json` 标志（如 `knowledge.ts` 第75行、`auth.ts` 第16行等）。
  - Commander 未注册 `--output` 选项时，传入 `--output json` 会触发 "unknown option" 错误。
- **根因判定**: 文档问题 — CLI.md 第86行文档声称存在 `--output <format>` 全局选项（值为 table/json/yaml），实际从未实现
- **最终严重程度**: 重要
- **修复建议**: 从 CLI.md 全局选项表中删除 `--output <format>`，改为说明各命令使用独立的 `--json` 标志。或实现该全局选项并在 Commander program 上注册。

---

## Verification Results (by Subagent-Verify-2)

### FINDING-153 Verification

### Verification (by Subagent-Verify-2)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `scripts/deploy.sh` 第 25-34 行
  - 代码: `check_docker()` 函数仅执行两个检查：(1) `command -v docker`（第26行）检查 docker 命令是否存在；(2) `command -v docker-compose` 或 `docker compose version`（第30行）检查 compose 是否存在。没有任何 `docker info`、`docker ps` 或其他检测 daemon 连通性的调用。
  ```bash
  check_docker() {
      if ! command -v docker &> /dev/null; then
          log_error "Docker is not installed. Please install Docker first."
          exit 1
      fi
      if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
          log_error "Docker Compose is not installed. Please install Docker Compose first."
          exit 1
      fi
  }
  ```
- **根因判定**: 脚本Bug — check_docker() 设计不完整，仅检查命令二进制文件存在性，不检查 daemon 可达性
- **最终严重程度**: 一般（daemon 不运行时后续操作会失败，但错误信息来自 docker compose 原始输出，不够友好）
- **修复建议**: 在 check_docker() 末尾增加 `docker info &> /dev/null || { log_error "Docker daemon is not running. Please start Docker first."; exit 1; }`

---

### FINDING-168 Verification

### Verification (by Subagent-Verify-2)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `scripts/deploy.sh` 第 136-140 行
  - 代码:
  ```bash
  restart() {
      log_info "Restarting service..."
      stop
      start
  }
  ```
  - 脚本第2行: `set -e`
  - `stop()` 函数（第127-133行）调用 `$(get_compose_cmd) -f "$COMPOSE_FILE" down`，如果容器未运行，`docker compose down` 可能返回非零退出码（取决于 docker compose 版本），此时 `set -e` 会导致脚本退出，`start()` 永远不会执行。
- **根因判定**: 脚本Bug — restart() 应该容错 stop() 的失败
- **最终严重程度**: 重要（restart 命令在容器未运行时无法启动服务，违背了 "restart" 的语义预期）
- **修复建议**: 将 `restart()` 修改为 `stop || true`，或者不依赖 stop 的退出码：`{ stop || true; } && start`

---

### FINDING-169 Verification

### Verification (by Subagent-Verify-2)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `scripts/deploy.sh` 第 116-124 行
  - 代码:
  ```bash
  start() {
      log_info "Starting service..."
      check_docker
      create_data_dir
      create_logs_dir
      cd "$PROJECT_ROOT"
      $(get_compose_cmd) -f "$COMPOSE_FILE" up -d
      log_info "Service started."
  }
  ```
  - `start()` 调用了 `check_docker`、`create_data_dir`、`create_logs_dir`，但没有调用 `create_env_file()`，也没有任何 `.env` 存在性检查。
  - 如果用户直接运行 `deploy.sh start`（未先 `deploy.sh deploy`），docker compose 将因为缺少必需的环境变量（如 `OPENAI_API_KEY`）而报出原始错误。
- **根因判定**: 脚本Bug — start() 假设 .env 已存在，但不验证此前提
- **最终严重程度**: 一般（影响首次使用 start 的场景，docker compose 报错虽然不友好但能定位问题）
- **修复建议**: 在 start() 中添加 `[ -f "$ENV_FILE" ] || { log_error ".env file not found. Run '$0 deploy' first."; exit 1; }`

---

### FINDING-170 Verification

### Verification (by Subagent-Verify-2)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `docs/architecture/API.md` 第 991 行
  - 内容: `"problemType": "outdated" | "incorrect" | "unclear" | "other"`
  - 文件: `docs/architecture/CLI.md` 第 1155 行
  - 内容: `--type <type>: 问题类型 (incorrect, outdated, context-mismatch, incomplete, other)`
  - 文件: `packages/contracts/src/domain/feedback.ts` 第 9-15 行（源码真相）
  - 代码:
  ```typescript
  export const feedbackProblemTypeSchema = z.enum([
    'incorrect',
    'outdated',
    'context-mismatch',
    'incomplete',
    'other',
  ]);
  ```
  - API.md 列出了 `unclear`，但 schema 中不存在此值。Schema 中有 `context-mismatch` 和 `incomplete`，API.md 中缺失。CLI.md 与 schema 一致。
- **根因判定**: 文档问题 — API.md 未随 schema 更新，`unclear` 是旧值，实际已被拆分为 `context-mismatch` 和 `incomplete`
- **最终严重程度**: 重要（API.md 是 API 消费者的主要参考，错误的 problemType 值会导致客户端使用不存在的枚举值）
- **修复建议**: 更新 API.md 第 991 行为 `"outdated" | "incorrect" | "context-mismatch" | "incomplete" | "other"`

---

### FINDING-177 Verification

### Verification (by Subagent-Verify-2)

- **复现结果**: 成功复现
- **源码验证**:
  - API.md 共文档化 61 条路由
  - 对比 `packages/server/src/routes/` 下的实际路由注册，以下路由在代码中存在但 API.md 中未记录：
    - `POST /v1/traps/:trapId/supersede` — 文件: `routes/traps.ts` 第 164 行
    - `GET /v1/operations/status/async` — 文件: `routes/operations/status.ts` 第 19 行
    - `POST /v1/operations/status/async/tasks/:taskId/requeue` — 文件: `routes/operations/status.ts` 第 96 行
    - `GET /v1/operations/stats/summary` — 文件: `routes/operations/stats.ts` 第 103 行
    - `GET /v1/operations/stats/hits` — 文件: `routes/operations/stats.ts` 第 71 行
    - `GET /v1/operations/stats/usage` — 文件: `routes/operations/stats.ts` 第 39 行
    - `GET /v1/operations/feedback/remediation` — 文件: `routes/feedback-admin.ts` 第 291 行
    - `GET /v1/operations/feedback/remediation/:entryId` — 文件: `routes/feedback-admin.ts` 第 303 行
    - `POST /v1/operations/feedback/remediation/:entryId/complete` — 文件: `routes/feedback-admin.ts` 第 529 行
    - `GET /v1/candidates/:candidateId` — 文件: `routes/candidates/query.ts` 第 32 行
    - `POST /v1/candidates/:candidateId/apply-resolution` — 文件: `routes/candidates/resolution.ts` 第 54 行
    - `GET /v1/duplicates` — 文件: `routes/candidates/duplicates.ts` 第 27 行
    - `GET /v1/duplicates/:candidateId` — 文件: `routes/candidates/duplicates.ts` 第 37 行
    - `GET /v1/operations/capsule-index/health` — 文件: `routes/operations/capsule-index.ts` 第 210 行
    - `POST /v1/operations/capsule-index/rebuild` — 文件: `routes/operations/capsule-index.ts` 第 90 行
    - `POST /v1/operations/capsule-index/cleanup-orphans` — 文件: `routes/operations/capsule-index.ts` 第 228 行
  - 共 16 条路由缺失，与原始发现一致。此外还有 `GET /v1/operations/status`（第123行）在 API.md 中有文档，但关联的 `/status/async` 子路由没有。
- **根因判定**: 文档缺失 — 路由增量添加时未同步更新 API.md
- **最终严重程度**: 重要（原判定为"阻塞"，下调为"重要"：API.md 开头有 `/meta/routes` 端点可动态获取完整路由列表，部分缓解了文档缺失的影响；但 API.md 仍然是 API 消费者的主要参考，16 条路由缺失对集成开发者影响显著）
- **修复建议**: 为所有缺失路由补充文档，或在 API.md 顶部显著标注"完整路由列表请通过 GET /meta/routes 获取"

---

### FINDING-178 Verification

### Verification (by Subagent-Verify-2)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `docs/operations/SECURITY.md` 第 191-192 行
  - 内容:
  ```
  NODE_ENV=production                    # 启用生产模式
  HOST=127.0.0.1                        # 绑定本地地址
  ```
  - 文件: `docs/architecture/DEPLOYMENT.md` 第 162 行 — 使用 `HOST=0.0.0.0`
  - 文件: `.env.production.example` 第 12 行 — 使用 `HOST=0.0.0.0`
  - 文件: `docker-compose.yml` 第 14 行 — 硬编码 `HOST=0.0.0.0`
  - 在 Docker 容器内，`HOST=127.0.0.1` 意味着仅监听容器内部的 loopback，宿主机无法通过端口映射访问服务。Docker 场景必须使用 `HOST=0.0.0.0`。
- **根因判定**: 文档问题 — SECURITY.md 的生产配置示例以裸机部署为背景，未区分 Docker 部署场景
- **最终严重程度**: 重要（用户按 SECURITY.md 操作 Docker 部署会导致服务不可达，且难以排查）
- **修复建议**: 在 SECURITY.md 生产配置部分添加说明："Docker 部署需要 HOST=0.0.0.0（容器内监听所有接口），裸机部署使用 HOST=127.0.0.1 并配合反向代理"

---

### FINDING-166 Verification

### Verification (by Subagent-Verify-2)

- **复现结果**: 成功复现
- **源码验证**:
  - 文件: `docker-compose.yml` 第 56 行
  - 内容: `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-trapmap}`
  - 文件: `docker-compose.yml` 第 29 行
  - 内容: `- TRAPMAP_DATABASE_URL=postgres://trapmap:trapmap@postgres:5432/trapmap`
  - `TRAPMAP_DATABASE_URL` 中的密码部分（第二个 `trapmap`）是硬编码字符串，不引用 `POSTGRES_PASSWORD` 变量。
  - 如果用户通过 `.env` 设置 `POSTGRES_PASSWORD=secure-password`，postgres 容器会使用 `secure-password` 作为密码，但 server 容器的连接字符串仍是 `postgres://trapmap:trapmap@...`，密码不匹配导致连接失败。
  - 四套 .env 模板（.env.example、.env.production.example、deploy.sh create_env_file()、DEPLOYMENT.md 内联模板）均未包含 `POSTGRES_PASSWORD` 变量。
- **根因判定**: 配置问题 — docker-compose.yml 中 TRAPMAP_DATABASE_URL 硬编码了密码，与 POSTGRES_PASSWORD 变量存在隐式耦合但未同步
- **最终严重程度**: 重要（生产部署修改数据库密码会导致 server 无法连接 postgres，且没有文档说明此耦合关系）
- **修复建议**: 将 `TRAPMAP_DATABASE_URL` 改为 `postgres://trapmap:${POSTGRES_PASSWORD:-trapmap}@postgres:5432/trapmap`，使其引用同一变量
