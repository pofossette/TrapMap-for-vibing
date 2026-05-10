# TrapMap 文档重构计划

> 旧 `plan.md`（CLI 工具适配输出优化方案）已归档至 `docs/archived/plan-cli-tool-adapter.md`。

---

## 现状简评

TrapMap 是一个 **pnpm + TypeScript monorepo**，包含 4 个包（cli / server / contracts / skills）和一个独立 eval 系统，采用 Fastify 5 + Commander 14 + Zod 4 技术栈，实现了一个面向团队的工程知识（Trap）和技能（Skill）共享平台，核心能力包括 RBAC 权限、7 状态生命周期、三代检索管线（v1 语义 / v2 capsule / v3 graph-plan）、异步候选摄取、去重检测、衰减维护、反馈治理、多工具 CLI 渲染适配以及完整的评测框架。现有 30+ 篇文档覆盖较广，但存在 **api-surface.md 严重过时、部署文档与实际 Dockerfile/docker-compose.yml 不一致、多处交叉引用指向不存在的文件、部分 CLI 命令（output profile / skill 子命令）缺失文档、术语表和数据模型遗漏新实体** 等问题。

---

## 全新文档目录结构规划

```
docs/
├── README.md                              # 文档总览索引（重写）
├── PACKAGES.md                            # 包职责与依赖关系（更新）
│
├── guides/
│   ├── GETTING_STARTED.md                 # 快速开始：本地 + Docker（修正 Node 版本 / 补充 eval）
│   ├── CODE_GUIDE.md                      # 源码导读（补充 prompt provider / cache 子系统）
│   ├── CONTRIBUTING.md                    # 投稿指南（补充 eval 质量门、清理 gitignore 内容）
│   └── CLIENT_INTEGRATION.md             # [新建] 客户端集成指南（从 README 提取并扩展）
│
├── architecture/
│   ├── ARCHITECTURE.md                    # 系统架构总览（修正 Docker Compose 示例 / 补 prompt 系统）
│   ├── API.md                             # REST API 全量参考（已是最新，微调边界端点路径）
│   ├── CLI.md                             # CLI 命令全量参考（补充 output profile / skill 子命令）
│   ├── FLOW.md                            # 系统流程图（移除 Phase 编号引用）
│   ├── MODULES.md                         # 模块详解（修正 scripts 列表 / datasets 路径）
│   ├── RENDERING.md                       # [新建] CLI 多工具渲染适配层
│   ├── DEPLOYMENT.md                      # 部署指南（对齐实际 Dockerfile / docker-compose.yml）
│   └── TROUBLESHOOTING.md                 # 故障排查（修正 require() 为 ESM import）
│
├── operations/
│   ├── SECURITY.md                        # 安全指南（补充 rate limiting / 移除死链）
│   ├── TESTING.md                         # 测试与评测指南（补充包级测试命令）
│   ├── ENVIRONMENT.md                     # 环境变量参考（补齐缺失变量）
│   ├── PROMPT_PROVIDERS.md                # Prompt Provider 架构（已是最新，小修）
│   ├── PROMPT_CACHING.md                  # Prompt 缓存系统（已是最新，小修）
│   └── CI_CD.md                           # [新建] CI/CD 流水线说明
│
├── reference/
│   ├── DATA_MODEL.md                      # 数据模型（补充 FeedbackEntry / DecayState / MaintenanceMeta）
│   ├── GLOSSARY.md                        # 术语表（补充 feedback / decay / maintenance / evidence / boundary）
│   ├── PERFORMANCE.md                     # 性能指南（补充 INDEX_BATCH_SIZE 等环境变量）
│   ├── api-surface.md                     # API 契约速查（全面扩充至当前全量端点）
│   ├── xml-system-prompt-methodology.md   # XML Prompt 方法论（已是最新，小修）
│   └── CHANGELOG.md                       # 版本日志（移至 docs/reference/ 或保留在根目录）
│
├── archived/
│   ├── plan-cli-tool-adapter.md           # 已归档的旧 plan.md
│   └── README.md                          # 归档说明
```

---

## Task List

### 第一优先级：修正错误和不一致

- [x] **T01 — 重写 `docs/reference/api-surface.md`**：当前仅覆盖 v1 原始 20 个端点，缺少 feedback / decay / maintenance / evidence / boundary / artifact / candidate / trap / skill / admin / migrate / status 等 40+ 端点。基于 `routes/` 和 `API.md` 全量同步。
  > 源码依据：`packages/server/src/routes/*.ts`、`docs/architecture/API.md`

- [x] **T02 — 修正 `docs/architecture/DEPLOYMENT.md`**：文档中 Dockerfile 和 docker-compose.yml 示例与实际文件不一致（实际 Dockerfile 为 3-stage node:22-alpine，实际 docker-compose.yml 缺少 PostgreSQL 服务）。对齐 `packages/server/Dockerfile` 和根目录 `docker-compose.yml`。
  > 源码依据：`packages/server/Dockerfile`、`docker-compose.yml`

- [x] **T03 — 修正 `docker-compose.yml`**：生产部署需要 PostgreSQL，但当前 compose 文件只有 server 服务。参考 DEPLOYMENT.md 中的理想版本，补回 PostgreSQL 服务定义。
  > 源码依据：`docker-compose.yml`、`packages/server/src/lib/persistence/postgres-store.ts`

- [x] **T04 — 修正 `.env.production.example`**：缺少 `TRAPMAP_DATABASE_URL`（生产应使用 PG）、`AI_PROMPT_PROVIDER`、`AI_PROMPT_TEMPLATE_FILE`、`EMBEDDING_*` 系列变量。同步 `.env.example` 中的完整配置项。
  > 源码依据：`packages/server/src/config.ts`、`.env.example`

- [x] **T05 — 修正 `.env.example`**：缺少 `OPENAI_API_KEY` 必需变量。补充 `SESSION_SECRET` 等安全相关变量。
  > 源码依据：`packages/server/src/config.ts`、`docs/operations/SECURITY.md`

### 第二优先级：消除死链和引用错误

- [x] **T06 — 清理不存在的交叉引用**：多处文档引用 `architecture/components/AUTH.md`、`GOVERNANCE.md`、`RETRIEVAL.md`、`EVALUATION.md`，这些文件不存在。将引用改为指向实际存在的文档（SECURITY.md / MODULES.md / TESTING.md）。
  > 涉及文件：`docs/operations/SECURITY.md`、`docs/operations/TESTING.md`、`docs/reference/PERFORMANCE.md`

- [x] **T07 — 统一 Node.js 版本声明**：Dockerfile 使用 node:22-alpine，但 GETTING_STARTED.md 和 ARCHITECTURE.md 声称 Node.js 20+。统一为 Node.js 20+（兼容 22）。
  > 涉及文件：`docs/guides/GETTING_STARTED.md`、`docs/architecture/ARCHITECTURE.md`

- [x] **T08 — 统一术语不一致**：
  - `GLOSSARY.md` 中 Manual Resolution 定义为 `independent/merged`，API 实际为 `merge/discard/keep_both`
  - `DATA_MODEL.md` 中 Member 用 `handle/roleTemplate`，API 文档用 `username/role`
  - `MODULES.md` 中 `cases/` 目录名，evals 实际为 `datasets/`
  > 涉及文件：`docs/reference/GLOSSARY.md`、`docs/reference/DATA_MODEL.md`、`docs/architecture/MODULES.md`

### 第三优先级：补充缺失文档

- [x] **T09 — 新建 `docs/architecture/RENDERING.md`**：CLI 多工具渲染适配层文档。覆盖 tool profile 模型（claude-code / codex / opencode / generic）、RenderKind 类型、RenderEnvelope 结构、renderer registry、四种 renderer 行为差异、--json 绕过机制、回退策略。
  > 源码依据：`packages/cli/src/lib/output-profile.ts`、`packages/cli/src/lib/output.ts`

- [x] **T10 — 更新 `docs/architecture/CLI.md`**：补充 `output profile show/set` 命令、`skill` 子命令族（search-by-content / edit / history / review:queue / review:approve / review:reject / duplicate-job fetch/resolve/apply-resolution）。修正 about 命令输出中 "Skill Shareer" 为 "TrapMap"。
  > 源码依据：`packages/cli/src/commands/output-profile.ts`、`packages/cli/src/commands/skill.ts`

- [x] **T11 — 新建 `docs/guides/CLIENT_INTEGRATION.md`**：从 README.md 中提取"客户端集成与配置"章节并扩展。覆盖 Skill 工件结构、检索 → 激活流程、Claude Code / Codex / OpenCode 落地方式、MCP 关系、activation policy 四状态模型。
  > 源码依据：`packages/cli/src/lib/activation-policy.ts`、`packages/cli/src/lib/artifact-bundle.ts`、README.md

- [x] **T12 — 新建 `docs/operations/CI_CD.md`**：CI/CD 流水线文档。覆盖 ci.yml（typecheck / lint / test / coverage 四并行 job）、eval.yml（PR smoke / 周调度 core / 手动触发）、baseline 回归检测机制、GitHub Actions 输出变量、PR 评论集成。
  > 源码依据：`.github/workflows/ci.yml`、`.github/workflows/eval.yml`、`evals/scripts/eval-ci.ts`

### 第四优先级：数据模型和术语补全

- [x] **T13 — 更新 `docs/reference/DATA_MODEL.md`**：补充 `FeedbackEntry`（状态机：new → triaged → resolved/dismissed）、`DecayState`（active → review-due → stale → expired → superseded）、`MaintenanceMetadata`（owner、reviewBy、lastVerifiedAt）实体。补充 KnowledgeEntry 遗漏字段：`labels`、`shortcut`、`detail`。
  > 源码依据：`packages/contracts/src/domain/feedback.ts`、`packages/contracts/src/domain/decay.ts`、`packages/contracts/src/domain/maintenance.ts`、`packages/server/src/lib/store/types/feedback-records.ts`

- [x] **T14 — 更新 `docs/reference/GLOSSARY.md`**：补充 feedback、decay、maintenance、evidence、boundary、activation-policy、candidate、duplicate-case、entity-lineage、tool-profile、render-kind 等术语。
  > 源码依据：`packages/contracts/src/domain/*.ts`

### 第五优先级：指南类文档增强

- [x] **T15 — 更新 `docs/guides/GETTING_STARTED.md`**：补充评测系统设置步骤（`pnpm eval:smoke`）、补充 rtk 前缀说明、扩展 FAQ（如何配置 AI provider、如何运行 eval）。
  > 源码依据：`package.json` scripts、`evals/README.md`

- [x] **T16 — 更新 `docs/guides/CODE_GUIDE.md`**：补充 prompt provider 子系统（`lib/ai/providers/`、`lib/ai/prompts.ts`、`lib/ai/cache/`、`lib/ai/dynamic/`）的导读说明。补充 embedding provider 独立配置与 `lib/ai/provider-config.ts` 的关系。
  > 源码依据：`packages/server/src/lib/ai/`

- [x] **T17 — 更新 `docs/guides/CONTRIBUTING.md`**：补充评测系统作为 PR 质量门的说明（eval.yml smoke tier 在 PR 路径匹配时自动触发）。精简 gitignore 内容（移至 README 或独立文件）。
  > 源码依据：`.github/workflows/eval.yml`

### 第六优先级：运维文档增强

- [x] **T18 — 更新 `docs/operations/ENVIRONMENT.md`**：补齐缺失变量：`EMBEDDING_PROVIDER`、`EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY`、`EMBEDDING_MODEL`、`SESSION_SECRET`、`SESSION_TTL_MS`、`ALLOWED_ORIGINS`、`CORS_ALLOWED_ORIGINS`、`RATE_LIMIT_MAX`、`INDEX_BATCH_SIZE`、`INDEX_CONCURRENCY`。
  > 源码依据：`packages/server/src/config.ts`、`.env.example`、`.env.production.example`

- [x] **T19 — 更新 `docs/operations/SECURITY.md`**：补充 rate limiting 作为安全措施的说明。移除指向不存在的 `architecture/components/AUTH.md` 和 `GOVERNANCE.md` 的引用。补充完整的审计事件类型列表（不仅限于 auth 事件）。
  > 源码依据：`packages/server/src/lib/session.ts`、`packages/server/src/lib/rbac.ts`、`packages/server/src/routes/operations/audit.ts`

- [x] **T20 — 更新 `docs/operations/TESTING.md`**：补充包级测试命令（`pnpm --filter @trapmap/server test`）。修正 `architecture/components/` 死链引用。
  > 源码依据：`package.json` scripts

- [x] **T21 — 更新 `docs/architecture/TROUBLESHOOTING.md`**：修正 `require()` 为 ESM import（项目为 ESM 模式）。更新 v1.4 known issues 至当前状态。
  > 源码依据：`packages/server/src/lib/persistence/create-store.ts`

### 第七优先级：结构优化

- [x] **T22 — 更新 `docs/README.md`**：重新生成文档索引以反映新目录结构。补充 rendering 文档、CLIENT_INTEGRATION 文档、CI_CD 文档的链接。修正 security model 交叉引用。
  > 依赖：T09–T12 完成后执行

- [x] **T23 — 更新 `docs/PACKAGES.md`**：补充 `packages/skills/` 的详细说明（trapmap-knowledge-workflow 控制路径、参考文件清单）。修正 Mermaid 图中 Server → CLI 的关系标注（HTTP 调用，非包依赖）。
  > 源码依据：`packages/skills/trapmap-knowledge-workflow/SKILL.md`

- [x] **T24 — 更新 `docs/reference/PERFORMANCE.md`**：补充 `INDEX_BATCH_SIZE` 和 `INDEX_CONCURRENCY` 环境变量。移除指向不存在的 `architecture/components/RETRIEVAL.md` 的引用。
  > 源码依据：`packages/server/src/lib/indexing/`、`docs/operations/ENVIRONMENT.md`

- [x] **T25 — 更新 `CHANGELOG.md`**：补充 v1.5+ 变更记录（CLI tool-adapter 输出优化、feedback/decay/maintenance 功能、candidate pipeline、skill 命令族等）。
  > 源码依据：`git log --oneline`、`docs/archived/plan-cli-tool-adapter.md`

---

## 执行约定

1. **源码溯源**：每篇文档中的关键逻辑或 API 说明必须标注对应源码文件路径。
2. **一次 1-2 个任务**：每次完成 T01–T25 中的 1-2 个任务后，更新本 plan.md 的 checkbox 并汇报。
3. **先读后写**：修改任何已有文档前，先读取其当前内容，确保只做增量修改而非覆盖。
4. **归档而非删除**：被替换的旧内容移至 `docs/archived/`。
