# TrapMap 端到端测试报告

**测试日期**: 2026-06-13
**测试方式**: Subagent-Driven Development（6 个并行测试 subagent + 2 个 verification subagent）
**测试环境**: 开发机（Arch Linux），CLI 客户端直接测试，Docker 后端未启动（阻塞于 sudo 权限）
**测试覆盖**: 文档一致性、CLI 命令、错误处理、部署脚本、配置审计

---

## 摘要

| 指标 | 数值 |
|------|------|
| 测试 subagent 数 | 4 个探索 + 2 个验证 |
| 发现总数 | 105 个 |
| 已验证（源码确认） | 13 个关键 findings |
| 阻塞级 | 2 个 |
| 重要级 | 19 个 |
| 一般级 | 30+ 个 |
| 建议级 | 50+ 个 |

**未测试范围**（需 Docker 后端）：
- 实际 API 端点功能（/health, /ready, CRUD 操作）
- v1/v2/v3 检索功能
- Neo4j 图计划功能
- 团队/成员管理
- 生命周期状态转换
- 反馈/衰减/维护功能

---

## 阻塞问题（2 个）

### BLOCKING-1: CLI.md 知识命令组完全不存在

- **Finding**: FINDING-018（已验证）
- **严重程度**: 阻塞
- **根因**: 文档问题
- **描述**: `docs/architecture/CLI.md` 整个"知识命令"章节文档记录了 `knowledge submit`、`knowledge list`、`knowledge inspect`、`knowledge resubmit` 等命令组。但实际 CLI 中：
  - `packages/cli/src/knowledge.ts` 注册的是顶层命令：`submit`、`resubmit`、`supersede`、`review-status`
  - 不存在 `knowledge` 命令组
  - 用户按文档操作会得到 `error: unknown command 'knowledge'`
- **源码验证**: `packages/cli/src/commands/knowledge.ts` 第 64、144、227、261 行确认
- **修复建议**: 重写 CLI.md "知识命令"章节，使用实际命令名和参数

### BLOCKING-2: `submit` 命令选项文档完全错误

- **Finding**: FINDING-019（已验证）
- **严重程度**: 阻塞
- **根因**: 文档问题
- **描述**: CLI.md 记录 `submit` 的选项为 `--title`、`--content`、`--format`、`--level`、`--team`，但实际选项为 `--scope`、`--label`、`--shortcut`、`--detail`、`--file`、`--stdin`、`--required-level`、`--boundary`、`--json`
- **源码验证**: `packages/cli/src/commands/knowledge.ts` 第 67-75 行确认
- **修复建议**: 更新 CLI.md 中 submit 命令的完整参数说明

---

## 重要问题（19 个）

### IMPORTANT-1: 所有网络错误仅显示 "fetch failed"，无 URL 上下文

- **Finding**: FINDING-200~203（已验证）
- **根因**: 客户端 Bug
- **描述**: 服务器不可达时，所有 CLI 命令（login、session、search、trap submit 等）只输出 `fetch failed`，没有目标 URL、建议操作或错误原因
- **源码验证**: `packages/cli/src/lib/http.ts` 第 41 行，`fetch()` 无 try/catch，网络异常直接抛出
- **修复建议**: 包装 fetch 错误，添加 URL 和 "请检查服务器是否运行" 提示

### IMPORTANT-2: `logout` 在服务器不可达时不清除本地会话

- **Finding**: FINDING-209（已验证）
- **根因**: 客户端 Bug
- **描述**: `logout` 命令先调用 `apiRequest()` 通知服务器，再调用 `clearSession()`。服务器不可达时异常阻止 `clearSession()` 执行，用户被困在过期会话中
- **源码验证**: `packages/cli/src/commands/auth.ts` 第 78-84 行
- **修复建议**: 将 `clearSession()` 放在 finally 块中，无论服务器通知是否成功都清除本地会话

### IMPORTANT-3: 错误信息引用旧名称 "skill-shareer"

- **Finding**: FINDING-213（已验证）
- **根因**: 客户端 Bug
- **描述**: `requireSessionToken()` 错误信息写的是 `skill-shareer login`，而非 `trapmap login`
- **源码验证**: `packages/cli/src/lib/http.ts` 第 67 行
- **修复建议**: 替换为 `trapmap login`

### IMPORTANT-4: `--json` 标志不产生 JSON 格式错误

- **Finding**: FINDING-206（已验证）
- **根因**: 客户端 Bug
- **描述**: 使用 `--json` 标志时，成功响应为 JSON，但错误仍然输出纯文本到 stderr
- **修复建议**: 统一错误输出格式

### IMPORTANT-5: 全局 `--output` 选项文档存在但未实现

- **Finding**: FINDING-038、FINDING-207（已验证）
- **根因**: 文档问题
- **描述**: CLI.md 记录了全局 `--output <format>` 选项（支持 json/yaml/table），但 `packages/cli/src/index.ts` 第 62-67 行未注册此选项
- **源码验证**: Commander 程序仅注册 `.name()`、`.description()`、`.version()`
- **修复建议**: 要么实现该功能，要么从文档中移除

### IMPORTANT-6: `member create/update` 签名与文档严重不符

- **Finding**: FINDING-015、FINDING-016
- **根因**: 文档问题
- **描述**: CLI.md 中 `member create` 和 `member update` 的参数名、选项与实际实现完全不同
- **修复建议**: 对照源码重写文档

### IMPORTANT-7: `access-key create` 签名与文档不符

- **Finding**: FINDING-017
- **根因**: 文档问题
- **描述**: 文档中的参数名和选项与实际实现不匹配
- **修复建议**: 对照源码重写文档

### IMPORTANT-8: API.md 缺少 16 个路由的文档

- **Finding**: FINDING-177（已验证）
- **根因**: 文档缺失
- **描述**: 以下路由在 API.md 中完全缺失：
  - `supersede`、`async status`、`stats`（3 个）、`badcases export`、`remediation`（3 个）、`candidates`（2 个）、`duplicates`（2 个）、`capsule-index`（3 个）
- **注**: `/meta/routes` 端点提供动态路由列表，部分弥补
- **修复建议**: 补充缺失路由文档或在文档中注明使用 `/meta/routes`

### IMPORTANT-9: feedback 类型定义跨文档不一致

- **Finding**: FINDING-170（已验证）
- **根因**: 文档问题
- **描述**:
  - `docs/architecture/API.md` 第 991 行：`outdated/incorrect/unclear/other`
  - `docs/architecture/CLI.md`：`incorrect/outdated/context-mismatch/incomplete/other`
  - `packages/contracts/src/domain/feedback.ts` 第 9-15 行（实际 schema）：与 CLI.md 一致
  - API.md 使用了已不存在的 `unclear` 类型
- **修复建议**: 更新 API.md 使用实际 schema 类型

### IMPORTANT-10: /health 和 /ready 响应结构跨文档不一致

- **Finding**: FINDING-171、FINDING-172
- **根因**: 文档问题
- **描述**: GETTING_STARTED.md、API.md、DEPLOYMENT.md 对 /health 和 /ready 的响应结构描述各不相同
- **修复建议**: 统一为实际响应结构

### IMPORTANT-11: SECURITY.md HOST 配置与 Docker 部署矛盾

- **Finding**: FINDING-178（已验证）
- **根因**: 文档问题
- **描述**: SECURITY.md 第 192 行建议生产环境使用 `HOST=127.0.0.1`，但 Docker 部署需要 `HOST=0.0.0.0`（docker-compose.yml 第 14 行）
- **修复建议**: 区分容器内 HOST 和宿主机 HOST 的配置建议

### IMPORTANT-12: `restart()` 在无容器运行时会失败

- **Finding**: FINDING-168（已验证）
- **根因**: 脚本 Bug
- **描述**: `scripts/deploy.sh` 第 136-140 行，`restart()` 调用 `stop` 然后 `start`，`set -e` 下 `stop` 失败（无容器）会导致 `start` 不执行
- **修复建议**: `stop` 命令忽略错误或检查容器是否存在

### IMPORTANT-13: POSTGRES_PASSWORD 与 DATABASE_URL 隐藏耦合

- **Finding**: FINDING-166（已验证）
- **根因**: 配置问题
- **描述**: `docker-compose.yml` 第 29 行硬编码 `TRAPMAP_DATABASE_URL=postgres://trapmap:trapmap@postgres:5432/trapmap`，第 56 行使用 `${POSTGRES_PASSWORD:-trapmap}`。修改 `POSTGRES_PASSWORD` 不会自动更新连接字符串
- **修复建议**: 从 DATABASE_URL 中引用 `$POSTGRES_PASSWORD` 变量

### IMPORTANT-14: 4 个 TRAPMAP_DECAY_* 环境变量完全未文档化

- **Finding**: FINDING-173
- **根因**: 文档缺失
- **描述**: 代码中使用了 4 个衰减相关环境变量，但 ENVIRONMENT.md 和 .env.example 均未记录
- **修复建议**: 补充到 ENVIRONMENT.md

### IMPORTANT-15: RUNTIME_MODE 环境变量未文档化

- **Finding**: FINDING-174
- **根因**: 文档缺失
- **修复建议**: 补充到 ENVIRONMENT.md

### IMPORTANT-16: TRAPMAP_GRAPH_DB_* 变量缺失于 .env 文件

- **Finding**: FINDING-183、FINDING-184
- **根因**: 配置缺失
- **描述**: Neo4j 图数据库相关环境变量在 `.env.example` 和 `.env.production.example` 中均缺失
- **修复建议**: 补充完整的图数据库配置模板

### IMPORTANT-17: Evidence sourceType/evidenceLevel 跨文档不一致

- **Finding**: FINDING-180
- **根因**: 文档问题
- **描述**: API.md 和 CLI.md 对 evidence 的 sourceType 和 evidenceLevel 枚举值描述完全不同
- **修复建议**: 对照 contracts schema 统一

### IMPORTANT-18: `supersede` 命令存在但未文档化

- **Finding**: FINDING-020
- **根因**: 文档缺失
- **描述**: CLI 有 `supersede` 命令（用于替换知识条目），但 CLI.md 完全未提及
- **修复建议**: 补充文档

### IMPORTANT-19: `load` 命令存在但未文档化

- **Finding**: FINDING-030
- **根因**: 文档缺失
- **描述**: CLI 有 `load` 命令（用于批量导入），但 CLI.md 完全未提及
- **修复建议**: 补充文档

---

## 一般问题（部分关键项）

| # | Finding | 描述 | 根因 |
|---|---------|------|------|
| 1 | 022 | `search` 用 `--max-results` 不是文档中的 `--limit` | 文档问题 |
| 2 | 024 | `review:queue` 用 `--status` 不是 `--limit` | 文档问题 |
| 3 | 028 | `review:queue/approve/reject` 用冒号分隔符，文档用空格 | 文档问题 |
| 4 | 035 | `skill duplicate-job resolve` 选项格式与文档不同 | 文档问题 |
| 5 | 040 | 全局 `--url` 选项文档记录但未实现（只有 `login --server`） | 文档问题 |
| 6 | 153 | `check_docker()` 只检查 docker 二进制存在，不检查 daemon 连接 | 脚本 Bug |
| 7 | 158 | `create_env_file()` .env 已存在时静默跳过 | 脚本设计 |
| 8 | 159 | `clean()` 确认可通过管道绕过 | 脚本安全 |
| 9 | 161 | deploy.sh .env 模板缺少 9 个 docker-compose 引用的变量 | 配置缺失 |
| 10 | 162 | deploy.sh vs deploy-quick.sh 行为差异大 | 文档缺失 |
| 11 | 163 | DEPLOYMENT.md 未提及 deploy.sh 或 deploy-quick.sh | 文档缺失 |
| 12 | 165 | .env.example vs .env.production.example 不一致 | 配置问题 |
| 13 | 169 | `start()` 不检查 .env 是否存在 | 脚本设计 |
| 14 | 175 | USE_DB_SEARCH 环境变量未文档化 | 文档缺失 |
| 15 | 176 | LOG_LEVEL 环境变量未文档化 | 文档缺失 |
| 16 | 179 | 无文档说明 HOST 绑定行为（localhost vs all interfaces） | 文档缺失 |
| 17 | 181 | CLI.md 文档记录 `--password` 标志但 SECURITY.md 说不存在 | 文档矛盾 |
| 18 | 182 | CLI.md 说 `access-key create` 但 SECURITY.md 说 `member key:create` | 文档矛盾 |
| 19 | 185 | TRAPMAP_SYSTEM_ADMIN_KEY 在 .env.example 标为必需但实际可选 | 文档问题 |
| 20 | 186 | GEMINI_API_KEY 在注释中引用但未定义 | 配置问题 |
| 21 | 187 | 审计事件命名不一致（点 vs 连字符） | 文档问题 |
| 22 | 188 | ENVIRONMENT.md 生产示例缺少 HOST、PORT 等 | 文档缺失 |

---

## 建议改进（部分）

| # | 描述 |
|---|------|
| 1 | `about` 命令输出包含 "Skill Shareer" 旧名称 |
| 2 | `--help` 在叶子命令上不显示子命令帮助 |
| 3 | `api:list` 输出不完整 |
| 4 | 退出码文档化但未实现 |
| 5 | `search` 无 seed 时错误信息 "No seed content received on stdin." 略有误导 |
| 6 | deploy.sh help 无版本信息 |
| 7 | deploy.sh 无参数时显示 "Unknown command: " 空字符串 |

---

## 文档问题汇总（按文档分组）

### docs/architecture/CLI.md（问题最多）
- 知识命令组不存在（BLOCKING）
- submit 参数完全错误（BLOCKING）
- member create/update 签名错误
- access-key create 签名错误
- search/review:queue 参数名错误
- 冒号 vs 空格分隔符不一致
- --output/--url 全局选项未实现
- supersede/load 命令未记录
- --json 选项未记录
- 与 SECURITY.md 矛盾（--password、access-key create vs member key:create）

### docs/architecture/API.md
- feedback 类型使用已废弃的 `unclear`
- 缺少 16 个路由文档
- /health 和 /ready 响应结构不一致
- evidence 枚举值与 CLI.md 不一致

### docs/operations/ENVIRONMENT.md
- 缺少 4 个 TRAPMAP_DECAY_* 变量
- 缺少 RUNTIME_MODE
- 缺少 USE_DB_SEARCH
- 缺少 LOG_LEVEL
- 生产示例缺少 HOST、PORT

### docs/operations/SECURITY.md
- HOST 配置与 Docker 部署矛盾
- 与 CLI.md 命令名矛盾

### docs/architecture/DEPLOYMENT.md
- 未提及 deploy.sh / deploy-quick.sh
- /health /ready 响应结构与其他文档不一致

### .env.example / .env.production.example
- 缺少 TRAPMAP_GRAPH_DB_* 变量
- 两者之间不一致
- GEMINI_API_KEY 引用但未定义

---

## 部署脚本问题汇总

| 问题 | 文件:行号 | 严重程度 |
|------|-----------|----------|
| restart() 在无容器时失败 | deploy.sh:136-140 | 重要 |
| check_docker() 不检查 daemon | deploy.sh:25-34 | 一般 |
| start() 不检查 .env | deploy.sh:116-124 | 一般 |
| create_env_file() 静默跳过 | deploy.sh:47 | 一般 |
| clean() 确认可绕过 | deploy.sh:157-170 | 一般 |
| .env 模板缺 9 个变量 | deploy.sh:49-71 | 一般 |
| POSTGRES_PASSWORD 耦合 | docker-compose.yml:29,56 | 重要 |
| docker-compose.yml 无 Neo4j | docker-compose.yml | 重要 |

---

## 附录 A: 测试环境详情

- **OS**: Arch Linux (kernel 7.0.11-arch1-1)
- **Node.js**: v22.x (pnpm workspace)
- **Docker**: v29.5.2（daemon 未启动，需 sudo）
- **CLI 测试方式**: `pnpm dev:cli -- <command>`
- **AI Provider**: openai-compatible (token-plan-sgp.xiaomimimo.com)
- **Embedding Provider**: google-genai (gemini-embedding-2)

## 附录 B: Subagent 执行记录

| Subagent | 类型 | 测试域 | Findings 数 | 耗时 |
|----------|------|--------|-------------|------|
| #1 | 探索 | CLI 帮助 vs 文档对比 | 45 | ~5.5min |
| #2 | 探索 | CLI 无服务器错误处理 | 16 | ~15min |
| #3 | 探索 | 文档一致性审计 | 19 | ~13min |
| #4 | 探索 | deploy.sh 脚本行为 | 20 | ~9min |
| Verify-1 | 验证 | 阻塞级 CLI findings | 6 verified | ~1min |
| Verify-2 | 验证 | 部署和文档 findings | 7 verified | ~3.5min |

## 附录 C: 未测试功能（需 Docker 后端）

以下功能需要部署 PostgreSQL + pgvector + Neo4j 后端才能测试：

1. **认证流程**: login → session → logout 完整流程
2. **团队管理**: team create/list/select, member CRUD
3. **知识生命周期**: submit → review → approve → deactivate 全流程
4. **检索功能**: v1/v2/v3 搜索、label/scope 过滤、GraphPlan
5. **工件管理**: import, artifact-export, activate
6. **反馈系统**: feedback, feedback-list, feedback-batch
7. **衰减/维护**: decay-stale, maintenance-list/verify
8. **Evidence/Evidence**: evidence:update, admin:evidence
9. **审计日志**: audit 命令
10. **输出格式**: --json, --output yaml

**建议**: Docker 启动后执行 Phase 2 的 Subagent A-H 全量功能测试。

---

*报告生成时间: 2026-06-13*
*测试工具: Claude Code Subagent-Driven Development*
*原始 findings: reports/raw-findings-2026-06-13.md*
