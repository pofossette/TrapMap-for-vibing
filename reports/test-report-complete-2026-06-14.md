# TrapMap 端到端测试完整报告

**报告日期**: 2026-06-15（更新）  
**覆盖来源**: 第一轮静态/CLI/文档审计 + 第二轮 Docker 后端补测 + Dockerfile 修复复核 + fresh team_3 盲测闭环  
**测试方式**: Subagent-Driven Development（探索、实现、spec review、code quality review 分离）  
**主服务目标**: `http://127.0.0.1:4000`  
**结论状态**: Docker 后端 fresh team_3 盲测主链路已通过 17/18 步骤。submit → agent-pass → GET entry → review-queue → approve → search(graph-assisted/hybrid/semantic) → deactivate 全闭环。唯一残留：deactivate 以 system-admin 调用时响应序列化返回 404（但操作已成功写入 DB）。

---

## 摘要

| 指标 | 数值 |
|------|------|
| 第一轮记录项 | 105 个 |
| Docker raw findings | 60 个（含通过项、重复确认和环境项） |
| 本轮新增 Docker findings | D010-D033 |
| 已确认可用链路 | combined `/health`、system-admin 登录、team create、member create/update、access-key 登录、submit、GET entry、review-queue、approve、search(graph-assisted/hybrid/semantic)、deactivate（DB 写入成功） |
| 当前主阻塞 | deactivate 以 system-admin 调用时响应序列化返回 404（`getUser("system-admin")` 无 users 行），但操作实际写入 DB 成功 |
| 已代码修复 | Dockerfile 打包、migration journal、lease/system-admin 兼容修补 |
| Fresh team_3 盲测 | 17/18 步骤通过，knowledge_24 完成 submit→agent-pass→approve→search→deactivate 全闭环 |

---

## Docker 补测结论

第二轮 Docker 测试已验证认证和团队管理基本链路可用，但知识生命周期闭环尚未完成。本轮继续时，server 容器未能通过健康检查，日志显示 Drizzle migrator 找不到 `meta/_journal.json`，根因是 production 镜像未包含 `packages/server/drizzle/**`。

已在 [packages/server/Dockerfile](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/Dockerfile:54) 修复迁移资产复制，并在 [packages/server/Dockerfile](/home/wunai/Disks/Data/my-project/Trap-Map/packages/server/Dockerfile:42) 改为复用 `deps` 阶段依赖，避免 production stage 二次访问 npm registry。该修复已通过 subagent spec review 与 code quality review。

修复后 `docker compose up -d --build server` 成功，`/health` 返回 HTTP 200。中途曾通过 `.env` 临时设置 `RUNTIME_MODE=api` 绕过旧数据卷缺列导致的 worker 崩溃；在 migration runner 加入兼容修补后已移除该临时配置，并确认默认 `combined` 模式健康。随后确认 access-key 与 submit 可用，但 approve/deactivate 仍因 PG repo 与 snapshot 路径不一致返回 `Knowledge entry not found`。

---

## 阻塞问题

### BLOCKING-1: CLI.md 知识命令组完全不存在

- **Finding**: 第一轮 FINDING-018
- **根因**: 文档问题
- **影响**: 用户按文档执行 `knowledge submit/list/inspect` 会得到 unknown command；实际命令是顶层 `submit`、`resubmit`、`supersede`、`review-status`。

### BLOCKING-2: `submit` 命令选项文档完全错误

- **Finding**: 第一轮 FINDING-019 / Docker D200-D201 / D213
- **根因**: 文档与 CLI/API schema 不一致
- **影响**: 文档中的 `--title`、`--content` 等参数不可用；实际需要 `--scope`、至少一个 `--label`、`--shortcut` 和 detail 输入。

### BLOCKING-3: Docker server 旧镜像缺失 Drizzle migration meta

- **Finding**: D010 / D011
- **根因**: Dockerfile production stage 未复制 `packages/server/drizzle`
- **影响**: server 启动时报 `Can't find meta/_journal.json file`，`/health` 不可用，阻塞后续 CLI 盲测。
- **状态**: 已代码修复，待 Docker daemon 可用后重建复验。

### BLOCKING-4: approve/deactivate 对刚提交的 PG entry 返回 not found

- **Finding**: D020
- **根因**: submit 写入结构化 PG repo，但 approve/deactivate 仍通过 snapshot `data.knowledgeEntries` 查找
- **影响**: submit -> approve -> search -> deactivate 生命周期闭环无法完成。
- **状态**: ✅ 已修复（2026-06-15 fresh team_3 盲测确认 approve 和 deactivate 操作均成功）

### BLOCKING-5: deactivate 以 system-admin 调用时响应序列化返回 404

- **Finding**: D029
- **根因**: `toKnowledgeEntry()` -> `toActorRef()` -> `getUser("system-admin")` 在 users 表查不到虚拟账户
- **影响**: deactivate 操作实际写入 DB 成功，但客户端收到 404 错误响应
- **状态**: 新发现（2026-06-15），需修复 `getUser()` 对 system-admin 的容错处理

---

## 重要问题

- **D001**: `pnpm dev:cli --` 会破坏 Commander 参数传递，应使用 `cd packages/cli && pnpm tsx src/index.ts <command>`。
- **D012**: 旧 Dockerfile production stage 二次 `pnpm install`，构建依赖公网 registry，已因 `ECONNRESET` 失败；当前修复改为复用 `deps` 依赖。
- **D016**: Drizzle journal 漏登记 0015-0018，导致已运行数据库跳过 lease/outbox 迁移；已加兼容修补。
- **D017**: system-admin 发行 access-key 触发 users FK；已加兼容 system-admin user 修补。
- **D018**: ✅ 已全部修复。fresh blind entries 的 `review-status` 和 `review-queue` 均返回合法完整 entry（D028 确认）。
- **D019**: 已修复。review evidence 输入现在允许服务端补齐 `verifiedAt` / `verifiedBy`。
- **D020**: ✅ 已修复。approve/deactivate 路径已迁移到 PG-first，fresh team_3 盲测确认闭环。
- **D021**: 已通过复验。v1 graph-assisted、v2 hybrid、v3 fallback 均能召回审批通过后的 Docker blind 条目。
- **D027**: ✅ 已修复。review-queue 响应完整（确认 D028）。
- **D029 (新)**: deactivate 以 system-admin 调用时响应序列化返回 404。`getUser("system-admin")` 在 users 表无对应行。操作 DB 写入成功但客户端收到错误响应。
- **D030 (新)**: retrieve/search API 字段名为 `seed` 而非 `query`。
- **D031 (新)**: 知识提交 API 不接受 `projectId`，项目范围由 session active team 决定。
- **D032 (新)**: securityLevel 提升不自动授予 `knowledge:review` 权限，需显式添加。
- **D033 (新)**: approve 响应中 reviewNotes 出现重复条目（同一 ID 出现两次）。
- **D022**: 直接用 `pnpm prune --prod` 裁剪当前 workspace 依赖会移除 `fastify` 等运行时依赖，production-only 镜像优化需另行设计。
- **D101**: `member list` CLI 命令不存在，管理员无法通过 CLI 查看成员列表。
- **D201**: CLI 将 `--label` 表现为可选默认 `[]`，但服务端要求至少一个 label。
- **D202 / D208**: system-admin 是虚拟账户，不能直接执行 submit/review-status 等真实 member 工作流；需要创建 member 并用 access-key 登录。
- **D203 / D209**: 旧 Docker 镜像与 schema/迁移状态不一致，曾导致 submit/lifecycle_events 写入失败；需在新镜像复验中重新确认是否仍存在。
- **D205 / D317**: `review:queue` 实际存在，但 raw findings 内部曾出现“命令不存在”的矛盾结论；最终应归并为命令注册/权限状态需复核。
- **D303**: `admin:evidence` 调用错误 API 路径 `/v1/knowledge/list`。
- **D306**: decay 系列命令曾出现间歇性 unknown command，疑似 CLI 初始化/权限门控竞态。
- **D309**: `audit --action <value>` 服务端期望数组但 CLI 传字符串。

---

## 已确认可用

- system-admin 登录成功。
- `team create`、`team list`、`team select` 可用，但 `team create/select` 使用位置参数而非测试计划中的 `--name` / `--team-id`。
- `member create`、`member update --level` 可用。
- `access-key:create` 可用，access-key 登录真实 member 可用。
- 默认 combined 模式可启动，task worker/outbox worker 已启动，`/health` 为 HTTP 200。
- `submit` 可用；fresh blind 样本 `knowledge_22` / `knowledge_23` / `knowledge_24` 已稳定进入 `agent-pass`。
- review route 的关键单测和 retrieval workflow 单测已通过。
- `review-status`、`approve`、v1 graph-assisted、v2 hybrid、v3 fallback、admin deactivate 已在最新容器中通过复验。
- `review:queue` 对 `agent-pass` 条目已可返回完整响应（D028 确认，D027 已修复）。
- `GET /v1/knowledge/:entryId` 返回完整 entry，`metadata.revisionCount=1`。
- 三种检索模式均能召回审批通过条目：graph-assisted(score=0.9594), hybrid(score=0.9594), semantic(score=0.4333)。
- deactivate DB 写入成功（lifecycleState 变为 `deactivated`），但 system-admin 调用时响应序列化返回 404（D029）。
- fresh team_3 盲测 17/18 步骤通过，knowledge_24 完成 submit→agent-pass→approve→search→deactivate 全闭环。
- `about` 和 `--version` 可执行；但旧报告中 `about` 命名残留需按当前源码/镜像重新复核。

---

## 未完成范围

- ~~知识生命周期闭环~~ ✅ 已通过 fresh team_3 盲测（submit→agent-pass→approve→search→deactivate）
- ~~review queue 序列化~~ ✅ D027 已修复，D028 确认
- deactivate 响应序列化对 system-admin 的兼容（D029）
- Neo4j / graph-assisted / GraphPlan 深度验证（graph routing 当前返回 null，使用 semantic+keyword）
- import / artifact-export / activate 完整验证
- 衰减、维护、反馈、审计等管理功能的端到端数据闭环
- `/ready` 的最终真实响应结构确认

---

## 建议下一步

1. **修复 D029**: `getUser()` / `toActorRef()` 对 system-admin 虚拟账户的容错处理——要么在 users 表 seed system-admin 行（与 D017 一致），要么 `toActorRef()` 对 system-admin ID 返回硬编码 actor ref。当前 deactivate 操作成功但客户端收到 404。
2. **修复 D033**: approve 路由 reviewNotes 去重——同一 review note 被写入两次。
3. **文档同步 D030/D031**: retrieval search 使用 `seed` 非 `query`；knowledge submit 不接受 `projectId`。
4. **权限文档 D032**: 说明 reviewer 需显式 `knowledge:review` 权限，securityLevel 提升不自动授予。
5. Neo4j graph-assisted 深度验证——当前 graph routing 返回 null（backend=memory, mode=disabled）。
6. 衰减、维护、反馈、审计等管理功能端到端数据闭环验证。
