# TrapMap Docker 部署后测试 - Raw Findings
**Date**: 2026-06-13
**测试环境**: Docker (postgres + neo4j + server), localhost:4000

---

## FINDING-D001: pnpm dev:cli -- 传递参数时 Commander.js 报 "too many arguments"

- **发现时间**: 2026-06-13
- **测试域**: CLI 调用方式
- **触发命令**: `pnpm dev:cli -- login --system-admin-key <key> --server <url>`
- **操作过程**:
  1. 执行 `pnpm dev:cli -- login --system-admin-key eval-local-admin-key-do-not-use-in-production --server http://127.0.0.1:4000`
  2. 报错 `error: too many arguments for 'login'. Expected 0 arguments but got 4`
  3. 直接执行 `cd packages/cli && pnpm tsx src/index.ts login --system-admin-key <key> --server <url>` 成功
- **预期行为**: `pnpm dev:cli -- <command> [options]` 应正常传递参数
- **实际行为**: pnpm 的 `--` 和 tsx 的 `--` 叠加导致 Commander.js 将选项解析为位置参数
- **问题分类**: 功能 Bug
- **初步判断**: 客户端问题（CLI 构建配置）
- **验证建议**: 检查 package.json 中 dev:cli 脚本的配置
- **稳定复现**: 是
- **严重程度**: 重要（影响所有 CLI 命令调用）

---

## FINDING-D002: 内网 IP 192.168.5.222:4000 不可达（防火墙阻塞）

- **发现时间**: 2026-06-13
- **测试域**: 网络访问
- **触发命令**: `curl http://192.168.5.222:4000/health`
- **操作过程**:
  1. Docker 容器端口映射 `0.0.0.0:4000 -> 4000`
  2. `curl http://127.0.0.1:4000/health` 成功
  3. `curl http://192.168.5.222:4000/health` 超时无响应
  4. `curl http://0.0.0.0:4000/health` 成功
  5. `ss -tlnp` 确认 4000 端口绑定在 0.0.0.0
- **预期行为**: 内网 IP 应可访问
- **实际行为**: 被主机防火墙阻塞
- **问题分类**: 环境配置问题
- **初步判断**: 防火墙配置问题（非应用 bug）
- **验证建议**: `sudo iptables -L -n | grep 4000` 检查防火墙规则
- **稳定复现**: 是
- **严重程度**: 重要（影响内网部署）

---

## FINDING-D003: 服务器日志仍显示 "Skill Shareer" 旧名称

- **发现时间**: 2026-06-13
- **测试域**: 服务端启动
- **触发命令**: `docker logs trapmap-server`
- **操作过程**:
  1. 启动服务器容器
  2. 查看日志
  3. 发现 `msg: "Skill Shareer server started"`
- **预期行为**: 应显示 "TrapMap server started"
- **实际行为**: 显示旧名称 "Skill Shareer"
- **问题分类**: 功能 Bug
- **初步判断**: 服务端问题
- **验证建议**: 搜索代码中的 "Skill Shareer" 字符串
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-D100: `team create` 使用位置参数而非 `--name` 标志

- **发现时间**: 2026-06-13 14:53
- **测试域**: 团队管理
- **触发命令**: `cd packages/cli && pnpm tsx src/index.ts team create --name "Test Team Alpha" --json`
- **操作过程**:
  1. 按测试计划执行 `team create --name "Test Team Alpha" --json`
  2. Commander.js 报错 `error: unknown option '--name'`
  3. 查看 `team.ts` 源码确认 `team create` 签名为 `.argument('<name>', ...)`（位置参数）
  4. 使用 `team create "Test Team Alpha" --json` 成功，返回 `{"id":"team_1","name":"Test Team Alpha","slug":"test-team-alpha",...}`
- **预期行为**: 测试计划中 `team create --name <name>` 应工作
- **实际行为**: CLI 使用位置参数 `team create <name>`，而非 `--name` 标志
- **问题分类**: 文档问题（测试计划与实际 CLI 接口不一致）
- **初步判断**: 测试计划写错，CLI 设计无误
- **稳定复现**: 是
- **严重程度**: 建议（更新测试计划或 CLI 帮助文档）

---

## FINDING-D101: `member list` 命令不存在

- **发现时间**: 2026-06-13 14:54
- **测试域**: 成员管理
- **触发命令**: `cd packages/cli && pnpm tsx src/index.ts member list --json`
- **操作过程**:
  1. 以 system-admin（level 10）登录并选择 team_1
  2. 执行 `member list --json`
  3. 报错 `error: unknown command 'list'`
  4. 执行 `member --help` 确认仅存在 `create` 和 `update` 两个子命令
- **预期行为**: 测试计划预期 `member list` 可列出团队成员
- **实际行为**: CLI 的 `member` 命令组仅注册了 `create` 和 `update` 子命令，无 `list`
- **问题分类**: 功能缺失
- **初步判断**: `registerMemberCommands` 中未注册 `list` 子命令；服务端 `/v1/members` GET 端点可能已存在但 CLI 未暴露
- **稳定复现**: 是
- **严重程度**: 重要（管理员无法通过 CLI 查看团队成员列表）

---

## FINDING-D102: `team select` 使用位置参数而非 `--team-id` 标志

- **发现时间**: 2026-06-13 14:54
- **测试域**: 团队管理
- **触发命令**: `cd packages/cli && pnpm tsx src/index.ts team select --team-id team_1`
- **操作过程**:
  1. 按测试计划格式 `team select --team-id <id>` 执行
  2. 报错 `error: unknown option '--team-id'`
  3. 查看 `team.ts` 确认签名为 `.argument('<teamId>', ...)`（位置参数）
  4. 使用 `team select team_1` 成功，返回 session 信息
- **预期行为**: 测试计划中 `team select --team-id <id>` 应工作
- **实际行为**: CLI 使用位置参数 `team select <teamId>`，而非 `--team-id` 标志
- **问题分类**: 文档问题（测试计划与实际 CLI 接口不一致）
- **初步判断**: 测试计划写错，CLI 设计无误
- **稳定复现**: 是
- **严重程度**: 建议（更新测试计划）

---

## FINDING-D103: `about` 命令仍显示旧名称 "Skill Shareer"

- **发现时间**: 2026-06-13 14:56
- **测试域**: CLI 入口
- **触发命令**: `cd packages/cli && pnpm tsx src/index.ts about`
- **操作过程**:
  1. 执行 `about` 命令
  2. 输出 `Skill Shareer prototype`
  3. 确认 `index.ts` 第 73 行硬编码了旧名称
- **预期行为**: 应显示 "TrapMap" 或当前产品名
- **实际行为**: 显示 "Skill Shareer"（与 FINDING-D003 同类问题）
- **问题分类**: 功能 Bug
- **初步判断**: `packages/cli/src/index.ts` 第 73 行未更新
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-D104: `session` 命令在未认证时不会报错，行为正确但 exit code 始终为 0

- **发现时间**: 2026-06-13 14:55
- **测试域**: 认证
- **触发命令**: `cd packages/cli && pnpm tsx src/index.ts session`（logout 后执行）
- **操作过程**:
  1. 以 system-admin 登录
  2. 执行 `logout`（exit 0）
  3. 确认 `~/.trapmap/cli.json` 中 `sessionToken` 和 `session` 均为 `null`
  4. 执行 `session`
  5. 输出 `Authenticated: no`，exit code 0
- **预期行为**: 未认证状态下的 `session` 输出 "Authenticated: no"
- **实际行为**: 行为正确。退出码 0 可能有争议——语义上 "not authenticated" 不一定是成功
- **问题分类**: 体验问题
- **初步判断**: 设计选择——session 命令始终展示状态而非断言已认证。退出码 0 可接受
- **稳定复现**: 是
- **严重程度**: 建议（可考虑返回非零退出码表示未认证）

---

## FINDING-D105: 完整认证+团队管理流程正常工作

- **发现时间**: 2026-06-13 14:56
- **测试域**: 认证/团队管理（端到端）
- **触发命令**: 多命令组合
- **操作过程**:
  1. `login --system-admin-key <key>` -- 成功，session_6 创建
  2. `team create "Test Team Alpha"` -- 成功，team_1 创建
  3. `team list` -- 成功，显示 1 个团队
  4. `team select team_1` -- 成功，active team 设为 team_1
  5. `member create test-user-alpha --team team_1` -- 成功，member_1 创建（level 0）
  6. `member update member_1 --level 1` -- 成功，level 升至 1
  7. `access-key:create member_1 --team team_1` -- 成功，key `ssr_key_qpOhQgaNwcSvEUiSY3Ecscob` 发行
  8. `logout` -- 成功
  9. `session` -- 显示 `Authenticated: no`（正确）
  10. `login --access-key ssr_key_qpOhQgaNwcSvEUiSY3Ecscob` -- 成功，以 test-user-alpha 身份登录（level 1）
  11. `session` -- 显示 `Authenticated: yes, User: test-user-alpha, Security level: 1, Active team: Test Team Alpha`
- **预期行为**: 端到端流程应全部成功
- **实际行为**: 全部成功，无阻塞性问题
- **问题分类**: 无（通过项）
- **初步判断**: 核心认证和团队管理功能完整可用
- **稳定复现**: 是
- **严重程度**: 无（通过项）

---

## FINDING-D200: `submit` 命令缺少 `--scope` 必填参数提示不明确

- **发现时间**: 2026-06-13 15:48
- **测试域**: 知识生命周期
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts submit --shortcut "docker socket permission denied" --detail "When running Docker without sudo..." --json`
- **操作过程**:
  1. 按测试计划执行 submit 命令（未指定 `--scope`）
  2. 报错 `error: required option '--scope <scope>' not specified`
  3. help 文档显示 `--scope` 为 required option
- **预期行为**: 测试计划中的 submit 命令应可直接执行，或 help 文档明确标注 `--scope` 为必填
- **实际行为**: `--scope` 是必填项但 help 显示 `Knowledge scope: global or project` 未标注 "required"
- **问题分类**: 文档问题
- **初步判断**: 测试计划遗漏 `--scope` 参数；CLI help 也未明确标注必填
- **稳定复现**: 是
- **严重程度**: 建议（help 输出应标注 required）

---

## FINDING-D201: `submit` 命令 `--label` 默认值为 `[]` 但服务端强制要求至少一个 label

- **发现时间**: 2026-06-13 15:49
- **测试域**: 知识生命周期
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts submit --scope global --shortcut "docker socket permission denied" --detail "..." --json`
- **操作过程**:
  1. 补充 `--scope global` 后重新执行 submit
  2. 服务端返回 400: `Too small: expected array to have >=1 items`，路径指向 `labels`
  3. help 文档显示 `--label <label> (default: [])`，暗示可选
- **预期行为**: `--label` 若为必填，help 应标注 required；若为可选，服务端应接受空数组
- **实际行为**: CLI 端 `--label` 默认 `[]` 可不传，但服务端 Zod schema 要求 `labels` 数组 `min(1)`
- **问题分类**: 功能 Bug
- **初步判断**: CLI 和服务端的验证规则不一致。CLI 应在本地校验 `--label` 非空，或服务端放宽为可选
- **稳定复现**: 是
- **严重程度**: 重要（阻塞所有不带 label 的提交）

---

## FINDING-D202: system-admin 身份无法执行 `submit` / `review-status` / `trap list` 等用户操作

- **发现时间**: 2026-06-13 15:50
- **测试域**: 知识生命周期
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts submit --scope global --label "docker" --shortcut "docker socket permission denied" --detail "..." --json`
- **操作过程**:
  1. 以 system-admin（level 10）登录后执行 submit
  2. 服务端返回 403: `This workflow requires a real member account instead of the virtual system admin`
  3. 同样错误出现在 `review-status`、`trap list` 等命令
  4. 需要创建 member -> 发行 access-key -> 重新登录才能操作
- **预期行为**: system-admin 可直接执行核心业务操作，或至少 CLI 文档说明需要 member 身份
- **实际行为**: system-admin 是虚拟账户，无法执行 submit/review-status/trap list 等操作，必须额外创建 member
- **问题分类**: 体验问题
- **初步判断**: 安全设计合理（system-admin 不应拥有个人数据），但测试流程增加了额外步骤，且 CLI 无提示引导
- **稳定复现**: 是
- **严重程度**: 一般（不影响功能，但增加操作复杂度）

---

## FINDING-D203: Docker 镜像与源码不同步——`pg-repository.js` 使用旧列名 `revision` 导致 submit 500 错误

- **发现时间**: 2026-06-13 15:52
- **测试域**: 知识生命周期
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts submit --scope global --label "docker" --shortcut "docker socket permission denied" --detail "..." --json`
- **操作过程**:
  1. 以 member（level 1）身份登录后执行 submit
  2. 服务端返回 500: `Unexpected server error`
  3. 查看 `docker logs trapmap-server` 发现 `column "revision" of relation "knowledge_revisions" does not exist`
  4. 对比数据库 schema（`revision_no`）与 Docker 镜像内 `dist/lib/knowledge/pg-repository.js`（`revision`）
  5. 确认源码已更新为 `revision_no`（pg-repository.ts line 108），但 Docker 镜像中的编译产物仍是旧版
  6. 同样的问题存在于 `lifecycle_events` 表的 INSERT 语句中（dist 中使用 `revision` 而 DB 列为 `revision_no`）
  7. DB 中 migration 0006 已正确执行（列已从 `revision` 重命名为 `revision_no`），但 dist 文件未对应更新
- **预期行为**: Docker 镜像的编译产物应与数据库 migration 状态一致
- **实际行为**: 镜像中 `dist/lib/knowledge/pg-repository.js` 使用旧列名 `revision`，而 DB 已通过 migration 0006 重命名为 `revision_no`，导致 INSERT 失败
- **问题分类**: 功能 Bug
- **初步判断**: Docker 镜像构建时间早于 migration 0006 提交。需要重新构建 Docker 镜像（`docker build`）以包含最新编译产物。**此为阻塞性问题**——所有知识提交操作均会 500 失败
- **稳定复现**: 是（只要镜像未重建）
- **严重程度**: 阻塞（submit、appendRevision 等写入操作全部失败）

---

## FINDING-D204: CLI 命令表面 `help` 与 `api:list` 不一致——权限门控命令隐藏但 help 仍显示

- **发现时间**: 2026-06-13 15:55
- **测试域**: CLI 命令体系
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts api:list` 与 `help` 对比
- **操作过程**:
  1. 以 member（level 1）身份登录后执行 `api:list`
  2. 返回约 20 个命令（submit, review-status, trap list 等）
  3. 执行 `help` 返回约 30 个命令（包含 admin:evidence, evidence:update, list, edit, deactivate, export 等额外命令）
  4. 确认 `api:list` 基于 `collectCommandPaths(program)` 只列出注册到 program 的命令
  5. 而 `help` 由 Commander.js 自动列出所有 `.command()` 注册的子命令，包括权限门控但已注册的命令
- **预期行为**: `api:list` 应与 `help` 显示一致的命令集，或明确说明差异
- **实际行为**: `api:list` 列出的是实际可用命令（基于权限），而 `help` 列出的是所有已注册命令（不考虑权限）
- **问题分类**: 体验问题
- **初步判断**: `api:list` 通过 `visibility` 对象进行门控，但 `help` 直接由 Commander.js 输出所有注册命令。二者设计意图不同，但用户会困惑
- **稳定复现**: 是
- **严重程度**: 一般（容易误导用户尝试无权限命令）

---

## FINDING-D205: 测试计划中 `review:queue` 和 `review:approve` 命令在 CLI 中不存在

- **发现时间**: 2026-06-13 15:56
- **测试域**: 知识生命周期/审批流程
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts review:queue --help`
- **操作过程**:
  1. 测试计划要求 "检查 review queue help, 然后 list pending items"
  2. 执行 `review:queue --help` 返回顶层 help（Commander.js 将其解析为未知命令后显示默认 help）
  3. 执行 `review:approve --help` 同样返回顶层 help
  4. 确认 `api:list` 中不包含 `review:queue` 或 `review:approve`
  5. 确认服务端 `/v1/knowledge/review-queue` 和 `/v1/knowledge/review` 端点存在且可用
  6. CLI 代码中 `registerReviewCommands` 可能存在但未被 `index.ts` 正确注册，或已被移除
- **预期行为**: CLI 应提供 `review:queue` 和 `review:approve` 命令以完成审批流程
- **实际行为**: CLI 没有暴露审批相关命令，尽管服务端 API 已实现。无法通过 CLI 完成 "approve items" 测试步骤
- **问题分类**: 功能缺失
- **初步判断**: CLI 端缺少 review 子命令注册（或 `registerReviewCommands` 已被移除/重构），导致审批流程无法通过 CLI 操作
- **稳定复现**: 是
- **严重程度**: 重要（管理员无法通过 CLI 执行审批，知识生命周期断裂）

---

## FINDING-D206: 测试计划中 `search --mode v2` / `--mode v3` 不存在——应使用 `--v2` 标志或 `--mode semantic|hybrid|graph-assisted`

- **发现时间**: 2026-06-13 15:58
- **测试域**: 检索
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts search "docker permission" --mode v2 --json`
- **操作过程**:
  1. 按测试计划执行 `search "docker permission" --mode v2 --json`
  2. 服务端返回 400: `Invalid option: expected one of "semantic"|"hybrid"|"graph-assisted"`
  3. 执行 `--mode v3 --json` 同样返回 400
  4. 查看 `search --help` 确认：
     - `--mode <mode>` 接受 `semantic|hybrid|graph-assisted`（默认 semantic）
     - `--v2` 是独立布尔标志（"Use capsule-native v2 retrieval (Phase 14)"）
  5. 执行 `search "docker permission" --v2 --json` 成功返回 `{"capsules":[],...}`
  6. 执行 `search "docker permission" --mode hybrid --json` 成功
  7. 执行 `search "docker permission" --mode graph-assisted --json` 成功
- **预期行为**: 测试计划中 `--mode v2` / `--mode v3` 应工作
- **实际行为**: `--mode` 接受 `semantic|hybrid|graph-assisted` 三种模式；v2 检索通过独立的 `--v2` 标志启用；v3 模式不存在
- **问题分类**: 文档问题（测试计划与实际 CLI 接口不一致）
- **初步判断**: 测试计划中 v2/v3 是基于旧版 CLI 接口写的。当前 CLI 中 v2 是布尔标志，v3 不存在
- **稳定复现**: 是
- **严重程度**: 建议（更新测试计划）

---

## FINDING-D207: `search` 命令在无已批准条目时返回空结果（符合预期但测试流程被阻塞）

- **发现时间**: 2026-06-13 15:59
- **测试域**: 检索
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts search "docker permission" --json`
- **操作过程**:
  1. 由于 FINDING-D203 阻塞了所有 submit，数据库中无任何条目
  2. 执行 `search "docker permission" --json` 返回 `{"globalConstraints":[],"projectKnowledge":[],"refinementSummary":null,"summary":null}`
  3. 执行 `search "docker permission" --v2 --json` 返回 `{"capsules":[],"profileHints":[],"refinementSummary":null,"summary":null}`
  4. 执行 `search "docker permission" --mode hybrid --json` 返回同样空结果
  5. `list --json` 返回 `{"items":[],"nextCursor":null,"total":0}`
- **预期行为**: 搜索应返回已批准的知识条目
- **实际行为**: 由于 submit 500 错误导致无条目入库，搜索返回空结果。检索逻辑本身正常工作
- **问题分类**: 测试环境问题（由 FINDING-D203 引起的级联影响）
- **初步判断**: 检索功能无独立 bug，但无法验证端到端流程。需先修复 D203 后重新测试
- **稳定复现**: 是
- **严重程度**: 重要（阻塞检索端到端验证）

---

## FINDING-D208: `review-status` 命令对 system-admin 返回 403，需 member 身份

- **发现时间**: 2026-06-13 15:50
- **测试域**: 知识生命周期
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts review-status --json`
- **操作过程**:
  1. 以 system-admin 登录后执行 `review-status --json`
  2. 返回 403: `This workflow requires a real member account instead of the virtual system admin`
  3. 切换为 member 登录后执行成功，返回 `{"items":[]}`
- **预期行为**: `review-status` 应对 system-admin 可用（用于检查提交历史）
- **实际行为**: system-admin 无法查看 review status，必须使用 member 账号
- **问题分类**: 体验问题
- **初步判断**: 与 D202 同类问题——system-admin 是虚拟账户，不关联个人提交数据
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-D209: `lifecycle_events` 表 INSERT 同样存在列名不一致（`revision` vs `revision_no`）

- **发现时间**: 2026-06-13 16:00
- **测试域**: 服务端数据库层
- **触发命令**: `docker exec trapmap-server cat /app/packages/server/dist/lib/knowledge/pg-repository.js` + DB schema 查询
- **操作过程**:
  1. 检查 Docker 镜像内 `dist/lib/knowledge/pg-repository.js` 第 160 行：`INSERT INTO lifecycle_events (... revision ...)`
  2. 查询 DB 中 `lifecycle_events` 表的列：`revision_no`（非 `revision`）
  3. 对比源码 `pg-repository.ts` 第 131 行：已使用 `revision_no`（正确）
  4. 确认 Docker 镜像的编译产物同样未更新此表的 INSERT 语句
- **预期行为**: `lifecycle_events` 的 INSERT 应使用 `revision_no`
- **实际行为**: dist 文件中仍使用 `revision`，与 DB schema 不匹配
- **问题分类**: 功能 Bug（与 D203 同源）
- **初步判断**: 同 D203——Docker 镜像编译产物早于 migration 0006，需重建镜像
- **稳定复现**: 是（只要镜像未重建）
- **严重程度**: 阻塞（与 D203 同级，影响所有写入操作）

---

## FINDING-D210: 测试计划步骤 8 "Approve items" 无法执行——CLI 无 approve 命令且 submit 已失败

- **发现时间**: 2026-06-13 16:01
- **测试域**: 知识生命周期/审批流程
- **触发命令**: 无法执行（命令不存在）
- **操作过程**:
  1. 测试计划要求 "Approve at least 2 items"
  2. 由于 D203 阻塞 submit，无待审批条目
  3. 即使有条目，D205 表明 CLI 无 `review:approve` 命令
  4. 服务端 API `POST /v1/knowledge/review` 存在且工作正常（通过 curl 验证端点可达），但 CLI 未暴露
- **预期行为**: CLI 应支持 approve 操作以完成审批流程
- **实际行为**: 无法通过 CLI 完成审批。即使手动 curl 调用 API，也因无待审批条目而无法测试
- **问题分类**: 功能缺失（由 D203 + D205 共同导致）
- **初步判断**: 需先修复 D203（重建镜像）使 submit 成功，再修复 D205（添加 CLI approve 命令）
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-D211: `list` 命令对 system-admin 返回 403

- **发现时间**: 2026-06-13 16:02
- **测试域**: 知识生命周期
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts list --json`（以 system-admin 身份）
- **操作过程**:
  1. 以 system-admin 登录后执行 `list --json`
  2. 返回 403: `This workflow requires a real member account instead of the virtual system admin`
  3. `api:list` 输出中也不包含 `list` 命令（对 member 而言，`list` 需要 `knowledge:export` 权限）
- **预期行为**: system-admin 应可列出所有条目（管理用途）
- **实际行为**: system-admin 被拒绝。`list` 需要 `knowledge:export` 权限
- **问题分类**: 体验问题
- **初步判断**: 与 D202 同类。`list` 需要 `knowledge:export` 权限，而默认 user roleTemplate 不包含此权限
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-D212: `deactivate` 命令在 CLI help 中存在但 `api:list` 不显示（权限门控）

- **发现时间**: 2026-06-13 16:03
- **测试域**: 知识生命周期
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts deactivate --help`
- **操作过程**:
  1. `deactivate --help` 成功，显示 Usage: `trapmap deactivate [options] <entryId>`
  2. `api:list` 输出中不包含 `deactivate`
  3. 确认 `index.ts` 中 `allowKnowledgeDeactivate` 需要 `knowledge:update` 权限 + level >= 1
  4. member（level 1, roleTemplate: user）的默认 permissions 不包含 `knowledge:update`
- **预期行为**: 测试计划中 "Deactivate one entry" 应可通过 CLI 执行
- **实际行为**: `deactivate` 命令存在但对普通 member 不可见（需要 `knowledge:update` 权限）
- **问题分类**: 体验问题
- **初步判断**: 需要将 member 升级为 reviewer/admin 角色才能看到 deactivate 命令
- **稳定复现**: 是
- **严重程度**: 一般（测试计划未考虑权限需求）

---

## FINDING-D213: 测试计划遗漏 `--scope` 和 `--label` 必填参数——影响步骤 2/3/4

- **发现时间**: 2026-06-13 15:48
- **测试域**: 测试计划完整性
- **触发命令**: 测试计划步骤 2/3/4 的 submit 命令
- **操作过程**:
  1. 测试计划步骤 2: `submit --shortcut "..." --detail "..." --json` 缺少 `--scope` 和 `--label`
  2. 测试计划步骤 3: 同上
  3. 测试计划步骤 4: 同上
  4. 实际需要: `submit --scope global --label <label> --shortcut "..." --detail "..." --json`
- **预期行为**: 测试计划中的命令应可直接复制执行
- **实际行为**: 所有 submit 命令缺少必填的 `--scope` 和 `--label` 参数
- **问题分类**: 文档问题
- **初步判断**: 测试计划编写时未验证 CLI 最新接口，需更新所有 submit 命令
- **稳定复现**: 是
- **严重程度**: 建议（更新测试计划）

---

---

## FINDING-D300: `feedback submit` 对 system-admin 返回 401——`resolveAuthContext` 设置 `user: null` 导致认证失败

- **发现时间**: 2026-06-13 15:02
- **测试域**: 反馈
- **触发命令**: `pnpm tsx src/index.ts feedback knowledge_18 --type incorrect --description "test feedback" --json`
- **操作过程**:
  1. 以 system-admin（level 10）登录
  2. 执行 `feedback knowledge_18 --type incorrect --description "test feedback" --json`
  3. 返回 401: `Not authenticated`
  4. 直接 curl 测试 `POST /v1/feedback` 带相同 bearer token 也返回 401
  5. 同一 token 在 `GET /v1/auth/session` 正常工作
  6. 检查 `session.ts` 第 234-248 行：system-admin 路径返回 `user: null`
  7. 检查 `feedback.ts` 第 65 行：`if (!auth.user?.id)` 对 system-admin 为 true，抛出 401
  8. 以 member（level 1）身份执行同一命令成功
- **预期行为**: system-admin 应可提交 feedback（或至少返回 403 而非 401）
- **实际行为**: `resolveAuthContext` 对 system-admin 设置 `user: null`，而 feedback 路由检查 `auth.user?.id` 为 null 时抛出 401
- **问题分类**: 功能 Bug
- **初步判断**: `feedback.ts` 第 65 行应检查 `auth.subjectType === 'system-admin'` 或使用 `auth.actorId` 而非 `auth.user?.id`。其他路由（如 feedback-admin）使用 `requirePermission` 正确处理了 system-admin
- **稳定复现**: 是
- **严重程度**: 重要（system-admin 无法通过 feedback 路由提交反馈）

---

## FINDING-D301: `feedback-list` 返回所有条目 ID 均为 "feedback_1"——`nextId()` 未生成唯一 ID

- **发现时间**: 2026-06-13 15:03
- **测试域**: 反馈
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts feedback-list --json`
- **操作过程**:
  1. 之前通过 feedback 命令提交了 3 条不同的反馈（不同 entryId、不同 description、不同时间）
  2. 执行 `feedback-list --json`
  3. 返回 3 条记录，但所有记录的 `id` 字段均为 `"feedback_1"`
  4. 3 条记录内容不同（entryId 分别为 knowledge_18、knowledge_18、fake-entry-id）
- **预期行为**: 每条反馈应有唯一 ID（如 feedback_1、feedback_2、feedback_3）
- **实际行为**: 所有反馈 ID 相同为 "feedback_1"，导致 batch 操作（如 `feedback-batch --ids feedback_1`）只能操作第一条
- **问题分类**: 功能 Bug
- **初步判断**: feedback repository 的 `nextId()` 方法未正确递增计数器，或使用了固定的 ID 前缀。需要检查 feedback repo 的 ID 生成逻辑
- **稳定复现**: 是
- **严重程度**: 重要（ID 冲突导致 batch 操作无法精确选择反馈条目）

---

## FINDING-D302: `feedback-list` 中 `entryShortcut` 对所有条目显示 "unknown"——知识条目存在但 lookup 失败

- **发现时间**: 2026-06-13 15:03
- **测试域**: 反馈
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts feedback-list --json`
- **操作过程**:
  1. feedback-list 返回的条目中 entryId 为 "knowledge_18"（该条目在 maintenance-list 中显示 shortcut 为 "fix docker permission"）
  2. 但 feedback-list 返回中 entryShortcut 为 "unknown"
  3. 检查 feedback-admin.ts 第 229-233 行：通过 `knowledgeRepo.listByFilter({})` 获取所有条目
  4. feedback 条目的 entryId 可能不在 knowledgeEntries 中（如 fake-entry-id），或 knowledgeEntries 为空
- **预期行为**: 对已知条目（如 knowledge_18）应显示其 shortcut（"fix docker permission"）
- **实际行为**: 所有条目的 entryShortcut 均为 "unknown"
- **问题分类**: 功能 Bug
- **初步判断**: `knowledgeRepo.listByFilter({})` 可能返回空（与 search 返回空的原因相同——store 中的条目可能不是通过正常审批流程入库的），或 lookup map 构建逻辑有误
- **稳定复现**: 是
- **严重程度**: 一般（不影响功能但降低可读性）

---

## FINDING-D303: `admin:evidence` 命令调用错误 API 路径 `/v1/knowledge/list`——应为 `/v1/operations/knowledge`

- **发现时间**: 2026-06-13 15:04
- **测试域**: 证据
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts admin:evidence --json`
- **操作过程**:
  1. 以 system-admin 登录（有 `knowledge:review` 权限）
  2. 执行 `admin:evidence --json`
  3. 返回 404: `Knowledge entry not found`
  4. 检查 evidence.ts 第 64-65 行：CLI 请求路径为 `/v1/knowledge/list`
  5. 服务端无 `GET /v1/knowledge/list` 路由——该路径被解析为 `GET /v1/knowledge/:entryId` 其中 entryId="list"
  6. 服务端实际路由为 `GET /v1/operations/knowledge`（在 app.ts 第 89 行注册）
  7. curl 直接测试 `GET /v1/operations/knowledge` 返回正常数据
- **预期行为**: `admin:evidence` 应列出知识条目及其证据状态
- **实际行为**: CLI 使用了错误的 API 路径，导致 404
- **问题分类**: 功能 Bug
- **初步判断**: `evidence.ts` 第 65 行应改为 `/v1/operations/knowledge` 而非 `/v1/knowledge/list`
- **稳定复现**: 是
- **严重程度**: 重要（admin:evidence 命令完全不可用）

---

## FINDING-D304: `search` 命令始终返回空结果——条目未通过正常审批流程入库导致无 embeddings

- **发现时间**: 2026-06-13 15:05
- **测试域**: 检索
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts search "docker" --json`
- **操作过程**:
  1. 数据库中存在 3 条知识条目（knowledge_16/17/18），在 maintenance-list 中可见
  2. 执行 `search "docker" --json` 返回 `{"globalConstraints":[],"projectKnowledge":[],"refinementSummary":null,"summary":null}`
  3. 执行 `search "docker permission" --json` 同样返回空
  4. 执行 `search "nginx 502" --json` 同样返回空
  5. `maintenance-list --json` 正常返回 3 条条目（lifecycleState: "agent-pass"）
  6. 条目的 lifecycleState 为 "agent-pass"（非 "approved"），可能未生成 embeddings
- **预期行为**: search 应返回匹配的知识条目
- **实际行为**: 所有搜索均返回空结果。条目存在但检索管线无法找到它们
- **问题分类**: 功能 Bug
- **初步判断**: 条目的 lifecycleState 为 "agent-pass" 而非 "approved"，可能未进入检索索引。或者条目通过直接 store 写入（非正常 submit+approve 流程）创建，缺少 embeddings。与 FINDING-D203/D209 的 Docker 镜像问题相关
- **稳定复现**: 是
- **严重程度**: 重要（核心检索功能不可用）

---

## FINDING-D305: `search --output yaml` 不存在——CLI 无全局 `--output` 格式切换选项

- **发现时间**: 2026-06-13 15:05
- **测试域**: 输出格式
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts search "test" --output yaml`
- **操作过程**:
  1. 执行 `search "test" --output yaml`
  2. Commander.js 报错 `error: unknown option '--output'`
  3. 检查 `search --help`：仅有 `--json` 标志，无 `--output` 选项
  4. CLI 使用 `output profile` 子命令管理输出配置，而非 per-command `--output` 标志
- **预期行为**: 测试计划预期 `--output yaml` 可用
- **实际行为**: CLI 不支持 `--output` 全局格式切换。JSON 输出通过 `--json` 标志启用
- **问题分类**: 文档问题（测试计划与实际 CLI 不一致）
- **初步判断**: 测试计划编写时假设了 `--output` 标志，实际 CLI 使用 `--json` 标志 + `output profile` 子命令
- **稳定复现**: 是
- **严重程度**: 建议（更新测试计划）

---

## FINDING-D306: `decay-stale` / `decay-batch` / `decay-search` 命令间歇性 "unknown command" 失败——CLI 模块初始化竞态

- **发现时间**: 2026-06-13 15:06
- **测试域**: 衰减
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts decay-stale --json`（及 decay-batch、decay-search）
- **操作过程**:
  1. 执行 `decay-stale --json` 返回 `{"items":[],"total":0}`（成功）
  2. 紧接着再次执行同一命令，返回 `error: unknown command 'decay-stale'`
  3. 再次执行又成功——行为不稳定
  4. 同一现象影响 `audit`、`evidence:update`、`maintenance-list`、`admin:evidence`、`maintenance-verify`、`decay-batch` 等命令
  5. `feedback`（submit）命令始终正常（使用不同权限门控路径）
  6. `help <cmd>` 始终成功——help 路径不依赖 session 加载
  7. 检查 index.ts 第 28 行：`const cliState = await loadCliState()` 在模块顶层执行
  8. `loadCliState()` 读取 `~/.trapmap/cli.json`，如果读取失败或返回 null，所有基于权限的命令注册会被跳过
- **预期行为**: 命令应始终可用（已登录且有权限时）
- **实际行为**: 约 50% 的调用返回 "unknown command"，间歇性失败
- **问题分类**: 功能 Bug
- **初步判断**: `loadCliState()` 在模块顶层执行（index.ts 第 28 行），读取文件时存在竞态条件。可能原因：(1) 文件锁问题——多个 tsx 进程同时读写 `~/.trapmap/cli.json`；(2) 文件系统缓存导致间歇性读取失败；(3) `loadCliState()` 内部的错误处理将读取失败静默为 null，导致所有权限门控命令被跳过
- **稳定复现**: 是（间歇性，约 50% 概率）
- **严重程度**: 阻塞（核心管理命令不可靠）

---

## FINDING-D307: `decay-stale` 条目的 `decayState`、`freshnessType`、`ageDays`、`lastVerifiedAt` 均为 null

- **发现时间**: 2026-06-13 15:06
- **测试域**: 衰减
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts maintenance-list --json`
- **操作过程**:
  1. 执行 `maintenance-list --json` 返回 3 条条目
  2. 所有条目的以下字段均为 null：`decayState`、`freshnessType`、`ageDays`、`lastVerifiedAt`、`supersededById`、`maintainer`、`reviewBy`
  3. 条目的 `updatedAt` 为今天的时间戳
  4. 执行 `decay-stale --state active --json` 返回空（无 active 状态条目）
  5. 执行 `decay-stale --json` 返回空
- **预期行为**: 已入库条目应有 decay 元数据（至少 decayState 和 ageDays）
- **实际行为**: 所有衰减相关字段均为 null，条目无法被 decay 管线识别
- **问题分类**: 功能 Bug
- **初步判断**: 条目通过直接 store 写入（非正常 submit+approve 流程）创建，未初始化 decayMeta。或 decay 计算逻辑未正确运行
- **稳定复现**: 是
- **严重程度**: 一般（衰减管线条目元数据不完整）

---

## FINDING-D308: `decay-batch` 和 `maintenance-verify` 对非 "approved" 条目返回 "Only approved entries can be modified"

- **发现时间**: 2026-06-13 15:07
- **测试域**: 衰减/维护
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts decay-batch --action extend --entries knowledge_18 --extend-days 30 --dry-run --json`
- **操作过程**:
  1. 执行 `decay-batch --action extend --entries knowledge_18 --extend-days 30 --dry-run --json`
  2. 返回 `eligible: false, ineligibilityReason: "Only approved entries can be modified"`
  3. 执行 `maintenance-verify --entries knowledge_18 --dry-run --json`
  4. 同样返回 `eligible: false, ineligibilityReason: "Only approved entries can be modified"`
  5. knowledge_18 的 lifecycleState 为 "agent-pass"（非 "approved"）
- **预期行为**: admin 操作应对 lifecycleState 为 "agent-pass" 的条目也可用
- **实际行为**: 只有 lifecycleState 为 "approved" 的条目才能被 decay-batch 和 maintenance-verify 操作
- **问题分类**: 体验问题
- **初步判断**: 条目的 lifecycleState 为 "agent-pass"（由 agent 自动通过），不是 "approved"（需人工审批）。这是预期行为——未经人工审批的条目不应被管理操作修改。但测试环境中条目无法通过正常审批流程（因 D203 阻塞），导致无法测试这些命令的实际功能
- **稳定复现**: 是
- **严重程度**: 一般（设计合理但阻塞测试验证）

---

## FINDING-D309: `audit --action <value>` 服务端返回验证错误 "expected array, received string"

- **发现时间**: 2026-06-13 15:08
- **测试域**: 审计
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts audit --action entry.created --json`
- **操作过程**:
  1. 执行 `audit --action entry.created --json`
  2. CLI 正确将 `--action` 收集为数组（Commander.js accumulator 模式，audit.ts 第 38-41 行）
  3. CLI 发送 `GET /v1/operations/audit?action=entry.created`
  4. 服务端返回 400: `Invalid input: expected array, received string`
  5. 服务端的 Zod schema 期望 `action` 参数为数组，但 URL query string 传递的是单个字符串
  6. 不带 `--action` 参数的 `audit --limit 5 --json` 正常工作
- **预期行为**: `audit --action entry.created` 应返回过滤后的审计记录
- **实际行为**: 服务端 Zod schema 验证失败——URL query params 天然是字符串，但 schema 期望数组
- **问题分类**: 功能 Bug
- **初步判断**: 服务端 audit 路由的 query schema 对 `action` 字段使用了 `z.array()` 但未正确处理 URL query string（单值 vs 数组）。Fastify 的 querystring 解析器需要 `action[]=value` 格式才能解析为数组，但 CLI 发送的是 `action=value`
- **稳定复现**: 是
- **严重程度**: 一般（`--action` 过滤不可用，其他 audit 功能正常）

---

## FINDING-D310: `feedback submit` 以 member 身份提交时返回的 `submittedBy.securityLevel` 为 1 而非实际值 0

- **发现时间**: 2026-06-13 15:09
- **测试域**: 反馈
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts feedback knowledge_18 --type incorrect --description "test feedback" --json`
- **操作过程**:
  1. 以 test-user-alpha（level 0）登录
  2. 执行 `feedback knowledge_18 --type incorrect --description "test feedback" --json`
  3. 返回成功，但 `submittedBy.securityLevel` 为 1
  4. 查看 feedback.ts 第 192 行：`securityLevel: auth.securityLevel`
  5. `resolveAuthContext` 对 user 类型从 membership 获取 securityLevel
  6. member_1 的 securityLevel 被更新为 1（FINDING-D105 中 `member update member_1 --level 1`）
  7. 但 feedback-list 返回中 securityLevel 为 0（因为 feedback-admin.ts 第 254 行硬编码为 0）
- **预期行为**: submittedBy.securityLevel 应反映实际用户 level
- **实际行为**: feedback submit 返回 securityLevel=1（正确），但 feedback-list 返回 securityLevel=0（硬编码）
- **问题分类**: 功能 Bug
- **初步判断**: feedback-admin.ts 第 254 行注释说明 `// We don't have this info stored, default to 0`——securityLevel 未存储在 feedback queue 记录中，只能在提交时显示，列表查询时默认为 0
- **稳定复现**: 是
- **严重程度**: 建议（数据丢失但不影响核心功能）

---

## FINDING-D311: `maintenance-assign --owner-handle` 无法替代 `--owner`——CLI 要求 `--owner <userId>` 为必填

- **发现时间**: 2026-06-13 15:10
- **测试域**: 维护
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts maintenance-assign --entries knowledge_18 --owner-handle test-user-alpha --dry-run --json`
- **操作过程**:
  1. 执行 `maintenance-assign --entries knowledge_18 --owner-handle test-user-alpha --dry-run --json`
  2. Commander.js 报错 `error: required option '--owner <userId>' not specified`
  3. `--owner-handle` 虽然存在但不能替代 `--owner` 的必填要求
  4. 需要同时提供 `--owner <userId>` 和可选的 `--owner-handle <handle>`
- **预期行为**: `--owner-handle` 应可单独使用（自动解析 userId）
- **实际行为**: `--owner` 是必填项，`--owner-handle` 仅作为辅助信息
- **问题分类**: 体验问题
- **初步判断**: CLI 设计上 `--owner` 是必填的用户 ID，`--owner-handle` 是可选的显示名。用户需要知道 userId 才能分配 maintainer。可考虑通过 handle 自动查询 userId
- **稳定复现**: 是
- **严重程度**: 建议（用户体验优化）

---

## FINDING-D312: `about` 命令输出仍为 "Skill Shareer prototype"——与 FINDING-D103 重复确认

- **发现时间**: 2026-06-13 15:11
- **测试域**: CLI 入口
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts about`
- **操作过程**:
  1. 执行 `about` 命令
  2. 输出: `Skill Shareer prototype`
  3. 确认 index.ts 第 73 行仍硬编码旧名称
- **预期行为**: 应显示 "TrapMap"
- **实际行为**: 仍显示 "Skill Shareer"（与 D103 相同，二次确认）
- **问题分类**: 功能 Bug（与 D103 重复）
- **初步判断**: 同 D103
- **稳定复现**: 是
- **严重程度**: 一般（与 D103 同级）

---

## FINDING-D313: `--version` 输出为 "0.1.0"——正常但无构建信息

- **发现时间**: 2026-06-13 15:11
- **测试域**: CLI 入口
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts --version`
- **操作过程**:
  1. 执行 `--version`
  2. 输出: `0.1.0`
- **预期行为**: 版本号输出
- **实际行为**: 正常输出 0.1.0，无构建时间或 commit hash
- **问题分类**: 无（通过项）
- **初步判断**: 版本号来自 package.json，无额外构建信息
- **稳定复现**: 是
- **严重程度**: 无（通过项，可考虑增加构建元信息）

---

## FINDING-D314: `api:list` 缺少 decay、maintenance、audit、evidence 等管理命令——与 `help` 输出不一致

- **发现时间**: 2026-06-13 15:12
- **测试域**: CLI 命令体系
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts api:list`
- **操作过程**:
  1. 执行 `api:list`，返回约 40 个命令
  2. `api:list` 不包含以下已注册命令：`decay-stale`、`decay-batch`、`decay-search`、`maintenance-list`、`maintenance-assign`、`maintenance-verify`、`admin:evidence`、`evidence:update`、`capsule-index`、`migrate`、`status`、`activate`、`artifact-export`
  3. 这些命令在 `help` 中可见且可正常执行（当 session 有效时）
  4. 检查 index.ts 第 83-121 行：`api:list` 的 `availableCommands` 数组硬编码了命令列表，未包含所有注册命令
- **预期行为**: `api:list` 应列出所有当前用户可用的命令
- **实际行为**: `api:list` 遗漏了约 12 个已注册命令
- **问题分类**: 功能 Bug
- **初步判断**: `api:list` 的命令列表是手动维护的，与实际注册的命令不同步。应改为从 Commander.js 程序实例动态获取已注册命令列表
- **稳定复现**: 是
- **严重程度**: 一般（不影响功能但误导用户）

---

## FINDING-D315: `skill search-by-content` 返回空结果——与 D304 同源

- **发现时间**: 2026-06-13 15:13
- **测试域**: 技能
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts skill search-by-content "docker" --json`
- **操作过程**:
  1. 执行 `skill search-by-content "docker" --json`
  2. 返回 `{"matches":[]}`
  3. 数据库中无 skill artifacts（仅有 knowledge entries）
- **预期行为**: 应返回匹配的技能条目
- **实际行为**: 无 skill artifacts 可搜索，返回空
- **问题分类**: 测试环境问题（无 skill 数据）
- **初步判断**: 测试环境中只有 knowledge entries，无 skill artifacts。功能本身正常
- **稳定复现**: 是
- **严重程度**: 无（预期行为，无 skill 数据）

---

## FINDING-D316: `policy resolve --default-policy` 为必填——无默认值

- **发现时间**: 2026-06-13 15:13
- **测试域**: 策略
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts policy resolve --json`
- **操作过程**:
  1. 执行 `policy resolve --json`
  2. 报错 `error: required option '--default-policy <policy>' not specified`
  3. `policy resolve --help` 显示 `--default-policy` 为必填
- **预期行为**: `policy resolve` 应有合理默认值或明确提示
- **实际行为**: `--default-policy` 为必填项，无默认值
- **问题分类**: 体验问题
- **初步判断**: 策略解析需要至少一个输入策略值，设计上合理。但 help 应更明确标注 required
- **稳定复现**: 是
- **严重程度**: 建议（help 应标注 required）

---

## FINDING-D317: `review:queue` 命令在 system-admin 身份下返回空（正常但与 D205 矛盾）

- **发现时间**: 2026-06-13 15:14
- **测试域**: 审批流程
- **触发命令**: `cd /home/wunai/Disks/Data/my-project/Trap-Map/packages/cli && pnpm tsx src/index.ts review:queue --json`
- **操作过程**:
  1. 以 system-admin 登录
  2. 执行 `review:queue --json`
  3. 返回 `{"items":[],"nextCursor":null,"total":0}`
  4. 注意：D205 报告 review:queue 不存在，但此时命令可正常执行
- **预期行为**: review:queue 应列出待审批条目
- **实际行为**: 命令存在且可执行（D205 的 "不存在" 结论需修正），但返回空（无待审批条目）
- **问题分类**: 文档问题（D205 需修正）
- **初步判断**: D205 报告的 "review:queue 不存在" 是间歇性失败（与 D306 的竞态问题同源），命令实际已注册。但因 D203 阻塞 submit，无待审批条目
- **稳定复现**: 否（间歇性，与 D306 同源）
- **严重程度**: 一般（D205 结论需修正）

---

## FINDING-D010: Server 容器健康检查未通过，启动阻塞于缺失 Drizzle migration meta

- **发现时间**: 2026-06-14 10:30
- **测试域**: Docker 启动 / 数据库迁移
- **触发命令**: `curl -s http://127.0.0.1:4000/health`、`docker logs trapmap-server --tail 30`
- **操作过程**:
  1. 按继续测试要求先访问 `/health`
  2. `curl` 无可用健康响应
  3. 查看 `trapmap-server` 日志，重复出现 `Failed to apply database migrations`
  4. 根因日志为 `Failed to start TrapMap server Error: Can't find meta/_journal.json file`
  5. 容器状态保持 `health: starting`，无法进入知识生命周期盲测
- **预期行为**: server 容器启动后 `/health` 返回健康状态，迁移目录可被 Drizzle migrator 正常读取
- **实际行为**: 运行时找不到 `drizzle/meta/_journal.json`，服务启动失败
- **问题分类**: Docker 打包 Bug
- **初步判断**: production 镜像未包含 `packages/server/drizzle/**`，但 `migration-runner.ts` 运行时按 `../../../drizzle` 读取迁移目录
- **验证建议**: 重建镜像后检查容器内 `/app/packages/server/drizzle/meta/_journal.json`，再复测 `/health`
- **稳定复现**: 是（在旧镜像中稳定复现）
- **严重程度**: 阻塞（阻塞真实后端服务与后续 CLI 生命周期盲测）

---

## FINDING-D011: `packages/server/Dockerfile` production 镜像遗漏 `packages/server/drizzle`

- **发现时间**: 2026-06-14 10:40
- **测试域**: Docker 构建
- **触发文件**: `packages/server/Dockerfile`
- **操作过程**:
  1. 对照容器日志中的 `Can't find meta/_journal.json file`
  2. 检查 `packages/server/src/lib/persistence/migration-runner.ts`
  3. 确认运行时路径解析为 `/app/packages/server/drizzle`
  4. 检查 Dockerfile，production stage 原本只复制 `package.json`、`tsconfig.json`、`dist`
  5. 已在 Dockerfile 中补充 `COPY packages/server/drizzle ./packages/server/drizzle`
- **预期行为**: production 镜像包含运行时迁移资产
- **实际行为**: 旧镜像缺失迁移资产；代码层修复已完成，但容器复验受后续 Docker 访问问题阻断
- **问题分类**: Docker 打包 Bug
- **初步判断**: 修复方向正确，并已通过 subagent spec review 与 code quality review；仍需在可访问 Docker daemon 的环境中执行 `docker compose up -d --build server` 复验
- **稳定复现**: 旧镜像稳定复现；修复后尚未完成容器级复验
- **严重程度**: 阻塞

---

## FINDING-D012: production stage 二次 `pnpm install` 依赖公网 registry，导致 Docker rebuild 失败

- **发现时间**: 2026-06-14 10:50
- **测试域**: Docker 构建稳定性
- **触发命令**: `docker compose up -d --build server`
- **操作过程**:
  1. 首次修复 `drizzle` copy 后重建镜像
  2. build stage 通过后，production stage 再次执行 `pnpm install --frozen-lockfile`
  3. 多个 npm tarball 下载出现 `ECONNRESET` / `ERR_SOCKET_TIMEOUT`
  4. 最终失败：`ECONNRESET request to https://registry.npmjs.org/glob/-/glob-10.5.0.tgz failed`
  5. 已修改 Dockerfile，使 production stage 复用 `deps` 阶段的 `node_modules`，不再二次联网安装
- **预期行为**: Docker rebuild 应尽量复用已解析依赖，不应在 final stage 重复拉取完整依赖集
- **实际行为**: 旧 Dockerfile 在 production stage 二次联网安装，导致构建受 registry 网络抖动影响
- **问题分类**: Docker 构建稳定性问题
- **初步判断**: 已用 `COPY --from=deps` 复用 root/contracts/server 的 `node_modules`；代价是 final 镜像包含 devDependencies，属于后续优化项
- **稳定复现**: 在当前网络条件下复现
- **严重程度**: 重要（阻塞部署重建；不直接说明应用逻辑错误）

---

## FINDING-D013: 当前受限会话无法访问 Docker daemon，阻塞最终健康复验与 CLI 生命周期盲测

- **发现时间**: 2026-06-14 11:00
- **测试域**: 测试环境 / Docker 权限
- **触发命令**: `docker ps`、`docker version`、`curl -s -o /tmp/trapmap-health.out -w '%{http_code}' http://127.0.0.1:4000/health`
- **操作过程**:
  1. Dockerfile 二次修复通过 subagent spec review 与 code quality review
  2. 尝试重新执行 `docker compose up -d --build server`
  3. 当前会话无法连接 `/var/run/docker.sock`，`docker ps` / `docker version` 返回 socket 访问错误
  4. `curl /health` 返回 HTTP 502，且无响应正文，无法判断是否为旧容器、代理层或服务本身状态
  5. 因无法重建并确认 server healthy，未继续执行 submit -> review -> approve -> search v1/v2/v3 -> deactivate 盲测
- **预期行为**: 测试会话可访问 Docker daemon，并能在修复后重建容器、确认 `/health`
- **实际行为**: Docker daemon 在当前会话不可用，最终容器复验与 CLI 生命周期盲测未完成
- **问题分类**: 测试环境阻塞
- **初步判断**: 不是 TrapMap 代码逻辑结论；需要在具备 Docker socket 权限的终端继续执行复验
- **稳定复现**: 当前会话稳定复现
- **严重程度**: 阻塞（阻塞本轮盲测收尾）

---

## FINDING-D014: Docker build context 包含 `.codegraph/daemon.sock`，构建时持续报 socket 无法打包

- **发现时间**: 2026-06-14 11:11
- **测试域**: Docker 构建
- **触发命令**: `docker compose up -d --build server`
- **操作过程**:
  1. 多次重建 server 镜像
  2. 构建上下文发送阶段持续输出 `Can't add file .../.codegraph/daemon.sock to tar: archive/tar: sockets not supported`
  3. 构建未因此失败，但每次都会产生错误日志
- **预期行为**: `.dockerignore` 应排除本地 daemon/socket 文件
- **实际行为**: `.codegraph/daemon.sock` 进入 build context 扫描并产生错误
- **问题分类**: Docker 构建卫生问题
- **初步判断**: `.dockerignore` 缺少 `.codegraph/`
- **稳定复现**: 是
- **严重程度**: 一般

---

## FINDING-D015: `@trapmap/server` 自引用 symlink 初始修复方向错误，导致新镜像启动时报 `ERR_MODULE_NOT_FOUND`

- **发现时间**: 2026-06-14 11:13
- **测试域**: Docker 运行时模块解析
- **触发命令**: `docker logs trapmap-server --tail 80`
- **操作过程**:
  1. 首次修复 Dockerfile 后新镜像启动
  2. 容器不断重启，日志报 `Cannot find package '@trapmap/server' imported from /app/packages/server/dist/lib/indexing/adapters/index.js`
  3. 排查发现 symlink 目标写为 `../../../dist`
  4. 修正为 `../../dist` 后该错误消失
- **预期行为**: `@trapmap/server/lib/...` self import 能解析到 `/app/packages/server/dist`
- **实际行为**: 错误 symlink 指向了错误目录，导致 ESM package 解析失败
- **问题分类**: Dockerfile 修复回归
- **初步判断**: symlink 相对路径应以 `/app/packages/server/node_modules/@trapmap` 为基准，`../../dist` 才是 `/app/packages/server/dist`
- **稳定复现**: 是（错误版本稳定复现）
- **严重程度**: 阻塞

---

## FINDING-D016: Drizzle journal 漏登记 0015-0018，导致已运行数据库跳过 lease/outbox 等迁移

- **发现时间**: 2026-06-14 11:15
- **测试域**: 数据库迁移
- **触发命令**: `docker logs trapmap-server --tail 100`
- **操作过程**:
  1. 修复 `drizzle/` 打包后，迁移日志显示 `Migrations applied successfully`
  2. server 随后崩溃：`column "lease_until" does not exist`
  3. 检查 `packages/server/drizzle/meta/_journal.json`
  4. 发现 journal 从 `0014_round11_dive_log_columns` 直接跳到 `0019_phase5_shared_jobs_feedback_remediation`
  5. 漏掉 `0015_phase0_atomic_delivery_and_leases` 到 `0018_phase4_query_traceability_and_badcase_capture`
  6. 已补 journal，并在 migration runner 加入幂等兼容修补以修复已错过 0015 的数据库
- **预期行为**: journal 按迁移文件顺序包含 0015-0018，老数据库也能补齐缺列
- **实际行为**: 旧数据卷已记录后续迁移，Drizzle 不会自动补跑漏掉的 0015
- **问题分类**: 数据库迁移 Bug
- **初步判断**: 需要保留兼容修补或提供一次性 repair migration，避免已部署数据库永久缺列
- **稳定复现**: 是
- **严重程度**: 阻塞（combined worker 和 /health runtime snapshot 均受影响）

---

## FINDING-D017: `access-key:create` 以 system-admin 发行时触发 `users(id)` 外键失败

- **发现时间**: 2026-06-14 11:28
- **测试域**: 认证 / Access Key
- **触发命令**: `pnpm tsx src/index.ts access-key:create member_1 --team team_1 --json`
- **操作过程**:
  1. system-admin 登录成功
  2. 创建 team、submitter、reviewer 成功
  3. 执行 `access-key:create` 返回 500
  4. server 日志显示 INSERT `access_keys.issued_by_user_id = system-admin`
  5. `access_keys.issued_by_user_id` 外键引用 `users(id)`，但 system-admin 是虚拟账户，新库中没有对应 users 行
  6. 在 migration runner 中插入/更新 `users('system-admin')` 后，access key 创建成功
- **预期行为**: system-admin 可发行 access key，或服务端明确拒绝并给出业务错误
- **实际行为**: 新库中触发 500 内部错误
- **问题分类**: 服务端 PG 兼容 Bug
- **初步判断**: system-admin 作为虚拟发行者必须满足 FK，或 schema/route 需允许 nullable issuer
- **稳定复现**: 是（修复前）
- **严重程度**: 阻塞（阻塞真实 member 登录）

---

## FINDING-D018: `review-status` / `review:queue` 返回的知识条目缺 revision/history，触发客户端契约校验失败

- **发现时间**: 2026-06-14 11:29
- **测试域**: 审批流程 / 响应契约
- **触发命令**: `review-status knowledge_19 --json`、`review:queue --status agent-pass --json`
- **操作过程**:
  1. submitter 提交 `knowledge_19` 成功，submit 响应中 `history` 和 `metadata.revisionCount` 正常
  2. 执行 `review-status knowledge_19 --json`
  3. 返回 400：`metadata.revisionCount` expected >= 1
  4. reviewer 执行 `review:queue --status agent-pass --json`
  5. 返回 400：`latestRevision.revision` expected >=1、`history` expected >=1、`metadata.revisionCount` expected >=1
- **预期行为**: review-status 和 review queue 应返回符合 `KnowledgeEntry` contract 的完整 revision/history
- **实际行为**: PG repo / snapshot 转换路径返回不完整 entry，客户端无法解析
- **问题分类**: 服务端响应契约 Bug
- **初步判断**: `toKnowledgeEntry(data, entry)` 在 PG 路径依赖 snapshot 数据，未正确携带结构化 revisions/history
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-D019: `review:approve` 带 evidence flags 时服务端契约要求 `verifiedAt` / `verifiedBy`，CLI 未填充

- **发现时间**: 2026-06-14 11:29
- **测试域**: 审批流程 / Evidence
- **触发命令**: `review:approve knowledge_19 --notes ... --source-type internal-experience --evidence-level documented --json`
- **操作过程**:
  1. reviewer 登录成功，具备 `knowledge:review`
  2. 执行带 evidence flags 的 approve
  3. 服务端返回 400：`evidence.verifiedAt` expected string，`evidence.verifiedBy` expected object
- **预期行为**: CLI 只传 source/evidence level 时，服务端应根据 reviewer context 填充 verifiedAt/verifiedBy，或 CLI 本地补齐
- **实际行为**: CLI 与服务端 contract 不一致，导致 evidence 审批不可用
- **问题分类**: CLI / 服务端契约 Bug
- **初步判断**: `review.ts` 注释称服务端填充 verifiedAt/verifiedBy，但实际 schema parse 在填充前要求字段存在
- **稳定复现**: 是
- **严重程度**: 重要

---

## FINDING-D020: `review:approve` / `deactivate` 对刚提交的 PG entry 返回 `Knowledge entry not found`

- **发现时间**: 2026-06-14 11:30
- **测试域**: 知识生命周期
- **触发命令**: `review:approve knowledge_19 --notes ... --json`、`deactivate knowledge_19 --reason ... --json`
- **操作过程**:
  1. submit 创建 PG entry `knowledge_19`
  2. 不带 evidence 执行 `review:approve knowledge_19`
  3. 返回 404 `Knowledge entry not found`
  4. 执行 `deactivate knowledge_19`
  5. 同样返回 404
- **预期行为**: approve/deactivate 应能找到刚由 submit 创建的 entry
- **实际行为**: 读写路径不一致；submit 写入结构化 PG repo，但 approve/deactivate 仍从 snapshot `data.knowledgeEntries` 查找
- **问题分类**: 服务端 PG-first 兼容 Bug
- **初步判断**: 生命周期更新路径尚未完全迁移到 PG repository，导致闭环阻塞
- **稳定复现**: 是
- **严重程度**: 阻塞

---

## FINDING-D021: search v1/v2/v3 接口可达，但未能召回刚提交条目

- **发现时间**: 2026-06-14 11:31
- **测试域**: 检索
- **触发命令**: `search ... --mode graph-assisted --json`、`search ... --v2 --json`、`load ... --fallback v1-graph-assisted --json`
- **操作过程**:
  1. 在 approve 被 D020 阻塞后继续执行检索
  2. v1 返回 `globalConstraints: []`、`projectKnowledge: []`
  3. v2 返回 `capsules: []`、`profileHints: []`
  4. v3 load fallback 到 v1 graph-assisted，但 fallback response 仍为空
- **预期行为**: 审批通过后的条目应可被 v1/v3 召回；v2 至少返回合法 capsule 结构
- **实际行为**: 接口可达且结构合法，但因审批/索引闭环未完成，无法召回目标条目
- **问题分类**: 级联测试阻塞 / 检索链路未闭环
- **初步判断**: v2 空 capsule 在无 skill artifact 时可接受；v1/v3 空结果受 approve/indexing 阻塞影响
- **稳定复现**: 是
- **严重程度**: 重要（由 D020 级联）

---

## FINDING-D022: `pnpm prune --prod` 在当前 workspace Docker 布局下会移除运行时依赖

- **发现时间**: 2026-06-14 11:38
- **测试域**: Docker 镜像优化
- **触发改动**: 在 Dockerfile 中加入 `prod-deps` stage 并执行 `CI=true pnpm prune --prod`
- **操作过程**:
  1. 为解决 production 镜像包含 devDependencies 的质量问题，尝试在 `deps` stage 后执行 `pnpm prune --prod`
  2. 首次执行因非交互环境报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`
  3. 改为 `CI=true pnpm prune --prod` 后构建成功
  4. 新镜像启动失败：`Cannot find package 'fastify' imported from /app/packages/server/dist/app.js`
  5. 回滚该优化后，combined 模式恢复健康
- **预期行为**: production-only 依赖裁剪后仍保留 server 运行时 dependencies
- **实际行为**: 当前 workspace/package node_modules 复制策略配合 `pnpm prune --prod` 会导致运行时依赖缺失
- **问题分类**: Docker 镜像优化风险
- **初步判断**: 需要另行设计生产依赖构建策略，例如 `pnpm deploy`、专门的 server-only build context，或验证过的 prod lockfile/filtered install；不能直接在当前 workspace 布局上 prune
- **稳定复现**: 是
- **严重程度**: 重要（优化项不可直接采用，否则服务无法启动）


---

## FINDING-D023: 真实 blind submit 存在不稳定的 agent review 结果，相同链路首个样本被判为 `agent-rejected`

- **发现时间**: 2026-06-14 12:56
- **测试域**: 知识提交流程 / Blind workflow
- **触发方式**: 使用真实 member access-key 登录后，按 blind payload 提交 project knowledge
- **操作过程**:
  1. 以 submitter member 登录并提交首个 blind payload `docker blind test seed 1781412859`
  2. 服务端返回 `knowledge_20`，`lifecycleState: "agent-rejected"`
  3. agent notes 指向 detail/labels 不完整、evidence marker 不足
  4. 调整为更具体的 Docker daemon socket permission 场景后，第二个 payload `knowledge_21` 才进入 `agent-pass`
- **预期行为**: blind 任务中的 submit 样本至少应稳定进入可审核态，避免因为弱 prompt/payload 直接落入 `agent-rejected`
- **实际行为**: blind payload 质量对 pre-review 结果高度敏感，首个样本未能进入 `agent-pass`
- **问题分类**: 测试链路稳定性 / 预审规则敏感度
- **初步判断**: 这不一定是代码 bug，但会影响盲测脚本稳定性；需要固定更高质量 seed 文本或放宽 pre-review 对 evidence marker 的启发式
- **稳定复现**: 部分稳定（弱 payload 易触发） 
- **严重程度**: 重要

---

## FINDING-D024: `review-status` 读取 `knowledge_21` 仍触发 contracts 校验失败，`metadata.revisionCount` 被序列化为 `0`

- **发现时间**: 2026-06-14 12:57
- **测试域**: review-status / Knowledge serialization
- **触发命令**: `GET /v1/knowledge/knowledge_21`（等价于 CLI `review-status knowledge_21 --json`）
- **操作过程**:
  1. 真实 blind submit 第二个样本 `knowledge_21` 进入 `agent-pass`
  2. 以 submitter token 调用 `GET /v1/knowledge/knowledge_21`
  3. 服务端返回 400 validation_error：`metadata.revisionCount expected >= 1`
- **预期行为**: review-status 应返回符合 contracts 的完整 entry，`metadata.revisionCount` 至少为 `1`
- **实际行为**: 服务端在读取该 entry 时仍生成了不合法的 metadata，说明 D018 未完全收口
- **问题分类**: 服务端序列化/record reconstruction Bug
- **初步判断**: PG/lightweight record 与 `toKnowledgeEntry` 之间仍有 metadata 派生缺口，至少影响 `revisionCount`
- **稳定复现**: 是
- **严重程度**: 阻塞

---

## FINDING-D025: `review:queue --status agent-pass` 对真实 reviewer session 返回 `team_mismatch`

- **发现时间**: 2026-06-14 12:58
- **测试域**: 审核队列 / Team scoping
- **触发命令**: `GET /v1/knowledge/review-queue?status=agent-pass`
- **操作过程**:
  1. 创建 `team_2`、submitter/reviewer member 并用 access-key 登录 reviewer
  2. reviewer session 的 `activeTeam` 为 `team_2`
  3. 调用 review queue with status=agent-pass
  4. 返回 `{"code":"team_mismatch","message":"Active session is not scoped to the requested team"}`
- **预期行为**: reviewer 对其 active team 中的 `agent-pass` project entry 应能查看审核队列
- **实际行为**: review queue 在过滤阶段触发 team scoping 异常，阻塞 blind approve 流程
- **问题分类**: 服务端权限 / Team access Bug
- **初步判断**: active team / membership 权限解析与 queue 过滤逻辑仍不一致，可能与 membership lookup 或 auth context team 绑定相关
- **稳定复现**: 是
- **严重程度**: 阻塞

---

## FINDING-D026: 真实 blind approve 仍返回 `knowledge_not_found`，search 与 deactivate 因此继续级联失败

- **发现时间**: 2026-06-14 12:59
- **测试域**: 知识生命周期闭环
- **触发命令**: `POST /v1/knowledge/review` for `knowledge_21`、`POST /v1/retrieval/search`、`POST /v1/operations/knowledge/knowledge_21/deactivate`
- **操作过程**:
  1. 第二个 blind submit `knowledge_21` 成功进入 `agent-pass`
  2. reviewer 对 `knowledge_21` 执行 approve，返回 `{"code":"knowledge_not_found","message":"Knowledge entry not found"}`
  3. v1 graph-assisted 与 v2 hybrid search 均返回空 `globalConstraints/projectKnowledge`
  4. deactivate 返回 `{"code":"forbidden","message":"Missing required permission: knowledge:update"}`，说明即便 approve 未成功，后续停留在 reviewer 权限约束与未索引态
- **预期行为**: approve 应成功转入 `approved`，随后 v1/v2/v3 能召回条目，再允许具备适当权限的 actor deactivation
- **实际行为**: 真实 blind 流程中 approve 仍未闭环，检索和停用继续级联失败
- **问题分类**: 服务端生命周期 / 检索闭环阻塞
- **初步判断**: 针对单元测试修补后的 review 路由仍未完全解决真实 PG-first blind 路径的 not found；deactivate 还暴露 reviewer 缺少 `knowledge:update` 的权限设计问题
- **稳定复现**: 是
- **严重程度**: 阻塞


---

## FINDING-D027: 最新容器中 fresh blind entry 已可完成 `review-status -> approve -> search(v1/v2/v3 fallback) -> admin deactivate` 主链路，剩余阻塞收敛到 `review:queue` 响应序列化

- **发现时间**: 2026-06-15 10:15
- **测试域**: Docker 后端端到端盲测（最新容器复验）
- **触发方式**: 重建最新 `trapmap-server` 容器后，使用真实 member access-key 与 system-admin token 复验 `knowledge_22/knowledge_23`
- **操作过程**:
  1. fresh blind submit `knowledge_22` / `knowledge_23` 均进入 `agent-pass`
  2. `GET /v1/knowledge/knowledge_22` 与 `GET /v1/knowledge/knowledge_23` 均返回合法完整 entry，`metadata.revisionCount=1`
  3. `POST /v1/knowledge/review` 对 `knowledge_22` 成功返回 `approved`
  4. v1 graph-assisted、v2 hybrid、v3 fallback 均成功召回目标主题条目
  5. `POST /v1/operations/knowledge/knowledge_22/deactivate` 使用 system-admin token 成功将条目转为 `deactivated`
  6. 唯一剩余失败点为 `GET /v1/knowledge/review-queue?status=agent-pass`，返回 validation_error：`items[0].latestSubmission.submittedBy expected object, received undefined`
- **预期行为**: blind 链路全部通过，包含 review queue
- **实际行为**: 生命周期闭环与检索闭环已恢复；review queue 仍因 `latestSubmission.submittedBy` 缺失而失败
- **问题分类**: 服务端序列化缺口
- **初步判断**: queue 路由已改为 full-entry 读取，但 `latestSubmission` 某些历史数据仍未在 response 组装阶段补全 submitter actor
- **稳定复现**: 是
- **严重程度**: 重要（非主闭环阻塞） 

---

## FINDING-D028: review-queue 对 agent-pass 条目已可通过，D027 序列化缺口已修复

- **发现时间**: 2026-06-15 10:40
- **测试域**: 审核队列 / 响应序列化
- **触发命令**: `GET /v1/knowledge/review-queue?status=agent-pass`
- **操作过程**:
  1. fresh blind submit `knowledge_24` 进入 `agent-pass`
  2. 以 reviewer（member_8, securityLevel=2, knowledge:review 权限）登录
  3. 调用 `GET /v1/knowledge/review-queue?status=agent-pass`
  4. 返回 HTTP 200，items 数组包含 `knowledge_24`，`latestSubmission.submittedBy` 正确填充
  5. D027 报告的 `submittedBy expected object, received undefined` 不再复现
- **预期行为**: review queue 应返回 agent-pass 状态条目
- **实际行为**: 已修复，queue 响应完整合法
- **问题分类**: 无（D027 已修复确认）
- **初步判断**: 之前 `latestSubmission.submittedBy` 缺失问题已在最新容器中修复
- **稳定复现**: 是（修复后稳定通过）
- **严重程度**: 无（通过项）

---

## FINDING-D029: deactivate 以 system-admin 调用时响应序列化失败——`getUser("system-admin")` 抛出 "User record not found"

- **发现时间**: 2026-06-15 10:42
- **测试域**: 知识生命周期 / deactivate 响应序列化
- **触发命令**: `POST /v1/operations/knowledge/knowledge_24/deactivate`（Bearer: system-admin token）
- **操作过程**:
  1. fresh blind entry `knowledge_24` 已通过 submit → agent-pass → approve → approved 全流程
  2. 以 system-admin token 调用 `POST /v1/operations/knowledge/knowledge_24/deactivate`
  3. 服务端返回 HTTP 404: `{"code":"user_not_found","message":"User record not found"}`
  4. 检查 server 日志：`Error: User record not found at getUser (knowledge.js:20) at toActorRef (knowledge.js:32) at toKnowledgeEntry (knowledge.js:338)`
  5. 但 lifecycle audit 日志记录了 `knowledge.deactivated (approved → deactivated)`，**操作已成功写入数据库**
  6. 后续 `GET /v1/knowledge/knowledge_24` 确认 `lifecycleState: "deactivated"`，lifecycleHistory 包含 4 个事件
- **预期行为**: deactivate 应返回 200 和更新后的 entry
- **实际行为**: 数据库操作成功，但 `toKnowledgeEntry()` 在序列化响应时调用 `getUser("system-admin")` 查 users 表，system-admin 是虚拟账户无对应行，抛出异常被错误处理为 404
- **问题分类**: 服务端序列化 Bug
- **初步判断**: `packages/server/dist/lib/knowledge.js` 中 `getUser()` 对 system-admin 虚拟 ID 无容错处理。修复方向：(1) 在 users 表 seed system-admin 行（与 D017 修复一致），或 (2) `toActorRef()` 对 system-admin ID 返回硬编码 actor ref 而不查 DB
- **稳定复现**: 是
- **严重程度**: 重要（操作成功但客户端收到 404 错误响应，破坏 API 可靠性）

---

## FINDING-D030: retrieve/search API 字段名为 `seed` 而非 `query`

- **发现时间**: 2026-06-15 10:41
- **测试域**: 检索 API 接口
- **触发命令**: `POST /v1/retrieval/search` with `{"query":"..."}`
- **操作过程**:
  1. 按原始测试 spec 发送 `{"query":"Docker container bind mount space path fails","mode":"graph-assisted"}`
  2. 服务端返回验证错误：`expected string, received undefined`（指向 `seed` 字段）
  3. 改为 `{"seed":"Docker container bind mount space path fails","mode":"graph-assisted"}` 后成功
- **预期行为**: API 文档应明确使用 `seed` 作为查询字段
- **实际行为**: `/v1/retrieval/search` 的请求 schema 要求 `seed` 字段，非 `query`
- **问题分类**: API 文档问题
- **初步判断**: 可能存在另一个 `retrievalRequestSchema` 使用 `query`，但 `/v1/retrieval/search` 端点实际使用 `seed`
- **稳定复现**: 是
- **严重程度**: 建议（API 文档应同步）

---

## FINDING-D031: 知识提交 API 不接受 `projectId` 字段，项目范围由 session active team 决定

- **发现时间**: 2026-06-15 10:40
- **测试域**: 知识提交 API 接口
- **触发命令**: `POST /v1/knowledge` with `{"scope":"project","projectId":"..."}`
- **操作过程**:
  1. 按原始测试 spec 在 submit payload 中加入 `"projectId":"blind-test-project"`
  2. 服务端返回验证错误：`Unrecognized key: "projectId"`
  3. 移除 `projectId` 后成功提交（project 范围由 session active team 隐式确定）
- **预期行为**: API 文档应说明 project 范围的确定方式
- **实际行为**: `POST /v1/knowledge` schema 不包含 `projectId`，project 范围由 `scope: "project"` + session 的 active team 决定
- **问题分类**: API 文档问题
- **初步判断**: 设计合理但文档/客户端需同步
- **稳定复现**: 是
- **严重程度**: 建议

---

## FINDING-D032: securityLevel 提升不自动授予 `knowledge:review` 权限——需显式添加 permissions

- **发现时间**: 2026-06-15 10:41
- **测试域**: 权限模型
- **触发命令**: `PATCH /v1/members/:id` + `GET /v1/knowledge/review-queue`
- **操作过程**:
  1. 创建 reviewer member 并通过 `PATCH /v1/members/:id` 提升 `securityLevel` 到 2
  2. 以该 reviewer 登录后调用 review-queue，返回 403 `Missing required permission: knowledge:review`
  3. 需额外通过 `PATCH /v1/members/:id` 在 `permissions` 数组中显式添加 `"knowledge:review"` 才能访问
  4. `user` roleTemplate 默认权限仅含：session:read, team:list, team:select, knowledge:submit, knowledge:search
- **预期行为**: securityLevel 提升应伴随权限扩展，或文档明确说明需要显式添加
- **实际行为**: securityLevel 与 permissions 是独立维度，level 提升不改变权限集
- **问题分类**: 权限模型设计问题
- **初步判断**: 设计上分离 level 和 permissions 是合理的，但操作文档应说明 reviewer 需要显式添加 `knowledge:review` 权限
- **稳定复现**: 是
- **严重程度**: 一般（需额外配置步骤，但不影响功能）

---

## FINDING-D033: approve 响应中 reviewNotes 出现重复条目

- **发现时间**: 2026-06-15 10:42
- **测试域**: 审批流程 / 响应数据质量
- **触发命令**: `POST /v1/knowledge/review` (approve knowledge_24)
- **操作过程**:
  1. reviewer approve `knowledge_24`
  2. 响应中 `latestRevision.reviewNotes` 包含 2 条记录
  3. 两条记录具有相同 ID（`6a967bf4-2ab9-4dd8-8b9f-b14a8860b966`），内容完全相同
  4. 理论上应只有 1 条 review note
- **预期行为**: reviewNotes 应包含唯一条目
- **实际行为**: approve note 被重复写入，导致 reviewNotes 数组出现完全相同的两条记录
- **问题分类**: 数据质量 Bug
- **初步判断**: review 路由可能在 note 写入时执行了两次 INSERT，或 aggregation 逻辑有去重缺陷
- **稳定复现**: 是
- **严重程度**: 一般（数据冗余但不影响功能）
