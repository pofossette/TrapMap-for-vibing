# TrapMap 文档漂移总审计与对齐执行计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于当前代码真相源完成一次仓库级文档逆向审计，修复已确认的文档漂移，识别需要“补实现或删承诺”的功能性漂移，并补齐防二次漂移的测试与守卫。

**Architecture:** 以 `package.json`、`packages/server/package.json`、`packages/server/src/config.ts`、`packages/server/src/lib/ai/**`、`.github/workflows/*.yml`、`docker-compose.yml`、`packages/server/src/app.ts` 与 `packages/server/src/lib/persistence/schema/**` 作为唯一事实源。执行顺序采用“先归档旧计划，再冻结真相矩阵，再修高信号文档，再修深层架构文档，最后补 guard/tests/evals”的五阶段推进。

**Tech Stack:** Markdown, TypeScript, pnpm, Vitest, Fastify, Drizzle, PostgreSQL, GitHub Actions

---

## 0. 审计边界与归档

- [x] 旧根计划已归档到 `docs/archive/old_plan_back.md`
- [x] 新执行计划写回 `plan.md`
- [x] 本轮校对范围仅覆盖”当前活跃文档”
- [x] 显式排除 `docs/archived/**`、`docs/superpowers/plans/**`、`docs/superpowers/specs/**`、历史报告型文档，除非其内容仍被活跃文档引用

## 1. 漂移审计结论

### 1.1 已确认的描述性漂移

- [x] `docs/guides/GETTING_STARTED.md` 与代码不一致：将 `AI_PROVIDER` 写成默认 `openai`，但运行时实际为”显式配置优先，其次 `OPENAI_API_KEY` / `GEMINI_API_KEY` 自动识别，否则 `fallback`”
- [x] `docs/operations/ENVIRONMENT.md` 需要按 `packages/server/src/config.ts` 与 `packages/server/src/lib/ai/provider-config.ts` 重写默认值、Provider 自动解析、Embedding override 与 `AI_PROMPT_TEMPLATE_FILE` 语义
- [x] `docs/architecture/ARCHITECTURE.md` 仍把 AI provider 叙述成”默认 openai”，与当前 provider auto-detect/fallback 逻辑不一致
- [x] `docs/architecture/DEPLOYMENT.md` 包含与现状不一致的部署示例、变量说明与运行姿态，需要以 `docker-compose.yml` / `packages/server/Dockerfile` / root scripts 重写
- [x] `docs/README.md` 仍有旧 CLI 启动方式（`pnpm --filter @trapmap/cli dev -- --help`），应统一到根脚本入口 `pnpm dev:cli`
- [x] `docs/architecture/components/PERSISTENCE.md` 仍以旧 `Store/JsonStore/PostgresStore` 抽象大段描述当前实现，且对 JSON fallback 的篇幅与定位失衡
- [x] `docs/architecture/components/EVALUATION.md` 仍按旧的 `evals/**/cases/*.yaml` 结构描述评测，而仓库当前以 `run.ts`、`smoke.ts`、`core.ts`、`scenarios/**`、TS dataset 为主
- [x] `docs/operations/TESTING.md`、`docs/operations/CI_CD.md`、`docs/reference/DOCS_TRUTH_MATRIX.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md` 需要继续扩展到”深层组件文档”和”承诺型运维能力”的漂移守护

### 1.2 待定的功能性漂移

- [x] `docs/operations/ENVIRONMENT.md` / `docs/architecture/components/RETRIEVAL.md` 把 `rebuildAllCapsuleIndexes()` 描述成可操作能力，但当前仅有库函数与测试，没有稳定的 CLI / root script / 运维入口；需决定”补命令”还是”删承诺”
- [x] `docs/architecture/DEPLOYMENT.md` 提供 Kubernetes / Helm 部署章节，但仓库未见 Helm chart 或 k8s manifests；需决定”补交付物”还是”降级为未来规划/删除”
- [x] `docs/architecture/DEPLOYMENT.md` 的 `DEBUG` 等变量未见运行时消费；需决定”补实现”还是”从文档删除”

### 1.3 并行执行工作流

- [ ] 并行 Lane A: 根入口与开发者高频文档
  - `README.md`
  - `docs/README.md`
  - `docs/guides/GETTING_STARTED.md`
  - `docs/guides/CONTRIBUTING.md`
  - `docs/operations/TESTING.md`
  - `docs/operations/ENVIRONMENT.md`
- [ ] 并行 Lane B: 架构与部署文档
  - `architecture.md`
  - `docs/architecture/ARCHITECTURE.md`
  - `docs/architecture/DEPLOYMENT.md`
  - `docs/architecture/API.md`
  - `docs/architecture/CLI.md`
  - `docs/architecture/components/PERSISTENCE.md`
  - `docs/architecture/components/EVALUATION.md`
- [ ] 并行 Lane C: 真相矩阵、评测说明与防漂移守卫
  - `docs/reference/DOCS_TRUTH_MATRIX.md`
  - `docs/reference/SYSTEM_TRUTH_SOURCES.md`
  - `docs/reference/DATABASE_SCHEMA.md`
  - `evals/README.md`
  - `evals/retrieval/README.md`
  - `evals/summary/README.md`
  - `evals/graph-extraction/README.md`
  - `scripts/complexity-budgets.json`
  - `scripts/check-doc-drift.ts`
  - `scripts/__tests__/check-doc-drift.test.ts`
  - `packages/server/src/__tests__/docs-truth-smoke.test.ts`
- [ ] 每个 Lane 完成后必须回到主线程做一次 truth-source 交叉复核，再合并进入下一阶段

---

## 2. 待校对全量文档清单

### 2.1 P0: 根入口与高频使用文档

- [ ] `README.md` -> 优先级：高
- [ ] `architecture.md` -> 优先级：高
- [ ] `docs/README.md` -> 优先级：高
- [ ] `docs/guides/GETTING_STARTED.md` -> 优先级：高
- [ ] `docs/guides/CONTRIBUTING.md` -> 优先级：高
- [ ] `docs/guides/CODE_GUIDE.md` -> 优先级：高
- [ ] `docs/guides/CLIENT_INTEGRATION.md` -> 优先级：中
- [ ] `docs/operations/ENVIRONMENT.md` -> 优先级：高
- [ ] `docs/operations/TESTING.md` -> 优先级：高
- [ ] `docs/operations/CI_CD.md` -> 优先级：高
- [ ] `docs/operations/SECURITY.md` -> 优先级：中
- [ ] `docs/operations/PROMPT_PROVIDERS.md` -> 优先级：中
- [ ] `docs/operations/PROMPT_CACHING.md` -> 优先级：中

### 2.2 P1: 架构与组件文档

- [ ] `docs/architecture/ARCHITECTURE.md` -> 优先级：高
- [ ] `docs/architecture/DEPLOYMENT.md` -> 优先级：高
- [ ] `docs/architecture/API.md` -> 优先级：高
- [ ] `docs/architecture/CLI.md` -> 优先级：高
- [ ] `docs/architecture/FLOW.md` -> 优先级：中
- [ ] `docs/architecture/MODULES.md` -> 优先级：中
- [ ] `docs/architecture/CACHING.md` -> 优先级：中
- [ ] `docs/architecture/GRAPH_RETRIEVAL.md` -> 优先级：中
- [ ] `docs/architecture/TROUBLESHOOTING.md` -> 优先级：中
- [ ] `docs/architecture/components/README.md` -> 优先级：中
- [ ] `docs/architecture/components/PERSISTENCE.md` -> 优先级：高
- [ ] `docs/architecture/components/EVALUATION.md` -> 优先级：高
- [ ] `docs/architecture/components/RETRIEVAL.md` -> 优先级：高
- [ ] `docs/architecture/components/AI_PROVIDER.md` -> 优先级：高
- [ ] `docs/architecture/components/AUTH.md` -> 优先级：中
- [ ] `docs/architecture/components/ASYNC_INFRASTRUCTURE.md` -> 优先级：中
- [ ] `docs/architecture/components/CLIENT.md` -> 优先级：中
- [ ] `docs/architecture/components/GOVERNANCE.md` -> 优先级：中
- [ ] `docs/architecture/components/INDEXING.md` -> 优先级：中
- [ ] `docs/architecture/components/ARTIFACTS.md` -> 优先级：中
- [ ] `docs/architecture/components/DEPENDENCY_ANALYSIS.md` -> 优先级：低
- [ ] `docs/architecture/components/INGESTION.md` -> 优先级：低
- [ ] `docs/architecture/components/REVIEW.md` -> 优先级：低
- [ ] `docs/architecture/components/UPDATE.md` -> 优先级：低
- [ ] `docs/architecture/components/DECAY.md` -> 优先级：低
- [ ] `docs/architecture/components/DELETION.md` -> 优先级：低
- [ ] `docs/architecture/components/FEEDBACK.md` -> 优先级：低
- [ ] `docs/architecture/components/KNOWLEDGE_LIFECYCLE.md` -> 优先级：低

### 2.3 P2: 参考文档、评测说明与 Skill 文档

- [ ] `docs/PACKAGES.md` -> 优先级：中
- [ ] `docs/PACKAGE_STACK_RATIONALE.md` -> 优先级：中
- [ ] `docs/reference/SYSTEM_TRUTH_SOURCES.md` -> 优先级：高
- [ ] `docs/reference/DOCS_TRUTH_MATRIX.md` -> 优先级：高
- [ ] `docs/reference/DATA_MODEL.md` -> 优先级：中
- [ ] `docs/reference/DATABASE_SCHEMA.md` -> 优先级：高
- [ ] `docs/reference/api-surface.md` -> 优先级：高
- [ ] `docs/reference/GLOSSARY.md` -> 优先级：低
- [ ] `docs/reference/PERFORMANCE.md` -> 优先级：低
- [ ] `docs/reference/xml-system-prompt-methodology.md` -> 优先级：低
- [ ] `evals/README.md` -> 优先级：中
- [ ] `evals/retrieval/README.md` -> 优先级：中
- [ ] `evals/summary/README.md` -> 优先级：中
- [ ] `evals/graph-extraction/README.md` -> 优先级：中
- [ ] `packages/skills/trapmap-knowledge-workflow/SKILL.md` -> 优先级：中
- [ ] `packages/skills/trapmap-knowledge-workflow/references/cli-index.md` -> 优先级：中
- [ ] `packages/skills/trapmap-knowledge-workflow/references/registration.md` -> 优先级：中
- [ ] `packages/skills/trapmap-knowledge-workflow/references/retrieval.md` -> 优先级：中
- [ ] `packages/skills/trapmap-knowledge-workflow/references/review.md` -> 优先级：中
- [ ] `packages/skills/trapmap-knowledge-workflow/references/artifacts.md` -> 优先级：中
- [ ] `packages/skills/trapmap-knowledge-workflow/references/feedback.md` -> 优先级：低
- [ ] `packages/skills/trapmap-knowledge-workflow/references/maintenance.md` -> 优先级：低
- [ ] `packages/skills/trapmap-knowledge-workflow/references/accumulation.md` -> 优先级：低

---

## 阶段一：冻结真相源与漂移分类

### 1. 任务清单

- [ ] 逆向核对 `package.json`、`packages/server/package.json`、`packages/server/src/config.ts`
- [ ] 逆向核对 `packages/server/src/lib/ai/provider-config.ts`、`packages/server/src/lib/ai/prompts.ts`
- [ ] 逆向核对 `.github/workflows/ci.yml`、`.github/workflows/eval.yml`
- [ ] 逆向核对 `docker-compose.yml`、`packages/server/Dockerfile`
- [ ] 逆向核对 `packages/server/src/app.ts` 中 `/health`、`/ready`、`/meta/routes`
- [ ] 更新 `docs/reference/DOCS_TRUTH_MATRIX.md`
- [ ] 更新 `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- [ ] 建立“描述性漂移 / 功能性漂移 / 删除承诺”三分类表

### 2. 阶段完成标准 (DoD)

- [ ] 每一类高风险事实都能定位到唯一真相源文件
- [ ] `DOCS_TRUTH_MATRIX.md` 覆盖命令、环境变量、provider、部署、评测、深层组件文档、运维入口
- [ ] 所有后续阶段的文档修改都能引用本阶段冻结的真相矩阵

### 3. 每个阶段要做的文档更新

- [ ] 重写 `docs/reference/DOCS_TRUTH_MATRIX.md` 中下列 topic 行
  - Root workspace commands
  - Server-only DB commands
  - Runtime env defaults
  - AI provider/model defaults
  - Deployment defaults
  - Health/readiness endpoints
  - Eval workflow
  - Deep architecture component docs
  - Operator-only internal APIs
- [ ] 修正 `docs/reference/SYSTEM_TRUTH_SOURCES.md`，删除重复描述，保留单一权威映射

### 4. 每个阶段要做的测试/Eval更新

- [ ] 扩展 `packages/server/src/__tests__/docs-truth-smoke.test.ts`，断言 truth matrix 覆盖新增 topic
- [ ] 运行 `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`

### 5. 必要的示例结构或代码

```markdown
| Topic | Authoritative Source | Secondary Docs | Drift Type |
|---|---|---|---|
| Runtime env defaults | `packages/server/src/config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/ARCHITECTURE.md` | descriptive |
| AI provider/model defaults | `packages/server/src/lib/ai/provider-config.ts` | `docs/operations/ENVIRONMENT.md`, `docs/architecture/DEPLOYMENT.md`, `docs/architecture/components/AI_PROVIDER.md` | descriptive |
| Capsule index rebuild operator surface | `packages/server/src/lib/retrieval/capsules/repositories/index-rebuild.ts` + exposed scripts | `docs/operations/ENVIRONMENT.md`, `docs/architecture/components/RETRIEVAL.md` | functional-or-delete |
```

---

## 阶段二：修复根入口、开发上手与运维高频文档

### 1. 任务清单

- [ ] `README.md`：统一启动命令、默认地址、配置入口、truth-source 引导
- [ ] `docs/README.md`：统一 CLI/Server 启动方式、评测入口、PG-first 姿态
- [ ] `docs/guides/GETTING_STARTED.md`：修正 AI provider 默认叙述、保留 package-scoped DB 命令
- [ ] `docs/guides/CONTRIBUTING.md`：补“修改 truth source 后必须同步哪些文档/守卫”
- [ ] `docs/operations/ENVIRONMENT.md`：按运行时真实默认值重写
- [ ] `docs/operations/TESTING.md`：按真实 eval 入口、真实 CI 触发条件、真实 smoke/core 结构重写
- [ ] `docs/operations/CI_CD.md`：同步 CI job、guardrails、eval 触发器与 baseline 逻辑

### 2. 阶段完成标准 (DoD)

- [ ] 新同事只看 `README.md` + `GETTING_STARTED.md` + `ENVIRONMENT.md` 即不会执行不存在的命令
- [ ] 所有高频文档对 `HOST`、`PORT`、`TRAPMAP_DATABASE_URL`、`TRAPMAP_DATA_FILE`、`AI_PROVIDER`、`AI_PROMPT_TEMPLATE_FILE` 的描述与代码一致
- [ ] 所有高频文档明确区分“推荐主路径”和“兼容回退路径”

### 3. 每个阶段要做的文档更新

- [ ] 修改 `README.md`
- [ ] 修改 `docs/README.md`
- [ ] 修改 `docs/guides/GETTING_STARTED.md`
- [ ] 修改 `docs/guides/CONTRIBUTING.md`
- [ ] 修改 `docs/operations/ENVIRONMENT.md`
- [ ] 修改 `docs/operations/TESTING.md`
- [ ] 修改 `docs/operations/CI_CD.md`

### 4. 每个阶段要做的测试/Eval更新

- [ ] 为 `README.md` / `docs/README.md` / `GETTING_STARTED.md` 增加 docRules，约束 `pnpm dev:cli`、`127.0.0.1`、`.data/skill-shareer.json`
- [ ] 为 `ENVIRONMENT.md` 增加 docRules，约束 auto-detect/fallback/provider 列表
- [ ] 为 `TESTING.md` / `CI_CD.md` 增加 docRules，约束 `pnpm eval:ci`、`pnpm eval:ci:core`、guardrail 命令
- [ ] 更新 `packages/server/src/__tests__/docs-truth-smoke.test.ts`
- [ ] 运行
  - `pnpm check:docs-drift`
  - `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`
  - `pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts`

### 5. 必要的示例结构或代码

```markdown
## AI Provider 配置（运行时真实语义）

| 变量 | 说明 | 默认行为 |
|---|---|---|
| `AI_PROVIDER` | `openai` \| `openai-compatible` \| `ollama` \| `google-genai` | 显式值优先；未设置时按 `OPENAI_API_KEY` / `GEMINI_API_KEY` 自动解析；都不存在时为 `fallback` |
| `AI_CHAT_MODEL` | chat 模型 | provider 默认值；`openai` 为 `gpt-4o-mini` |
| `AI_PROMPT_TEMPLATE_FILE` | 本地模板覆盖文件 | 默认未设置；不自动加载任意文件 |
```

```bash
pnpm dev:server
pnpm dev:cli
pnpm --filter @trapmap/server db:migrate
pnpm eval:ci
pnpm eval:ci:core
```

---

## 阶段三：修复架构、部署与深层组件文档

### 1. 任务清单

- [ ] `architecture.md`：保证高层架构摘要不落后于 PG-first / repos-first 现状
- [ ] `docs/architecture/ARCHITECTURE.md`：修正 provider 默认语义、eval 结构、启动序列、路由与存储边界
- [ ] `docs/architecture/DEPLOYMENT.md`：按 `docker-compose.yml`、`packages/server/Dockerfile`、真实 env 变量与 healthcheck 重写
- [ ] `docs/architecture/API.md`：核对与 `/meta/routes`、实际 routes 注册表的一致性
- [ ] `docs/architecture/CLI.md`：核对与 `packages/cli/src/index.ts`、`packages/cli/src/commands/**` 的一致性
- [ ] `docs/architecture/components/PERSISTENCE.md`：弱化过时的 store 接口说明，改为 repos/store 兼容边界、schema 目录、JSON fallback 定位
- [ ] `docs/architecture/components/EVALUATION.md`：改成当前 TS-based eval 架构
- [ ] `docs/architecture/components/RETRIEVAL.md` 与 `AI_PROVIDER.md`：核对 operator surface 与 provider 真实能力
- [ ] 复查 `docs/architecture/components/AUTH.md`、`ASYNC_INFRASTRUCTURE.md`、`CLIENT.md` 中的地址、端点、运行时默认值

### 2. 阶段完成标准 (DoD)

- [ ] 任一架构文档都不再把 JSON store 叙述成默认主路径
- [ ] 部署文档中的变量、端口、healthcheck、provider 示例与真实 compose / Dockerfile 一致
- [ ] 组件文档中凡是面向操作者的命令或入口，必须要么能在仓库中执行，要么显式标注“内部 API / 未暴露”
- [ ] API / CLI 文档抽样对照真实路由和命令树后无明显断裂

### 3. 每个阶段要做的文档更新

- [ ] 修改 `architecture.md`
- [ ] 修改 `docs/architecture/ARCHITECTURE.md`
- [ ] 修改 `docs/architecture/DEPLOYMENT.md`
- [ ] 修改 `docs/architecture/API.md`
- [ ] 修改 `docs/architecture/CLI.md`
- [ ] 修改 `docs/architecture/components/PERSISTENCE.md`
- [ ] 修改 `docs/architecture/components/EVALUATION.md`
- [ ] 修改 `docs/architecture/components/RETRIEVAL.md`
- [ ] 修改 `docs/architecture/components/AI_PROVIDER.md`
- [ ] 按抽样结果修正 `docs/architecture/components/AUTH.md`、`ASYNC_INFRASTRUCTURE.md`、`CLIENT.md`

### 4. 每个阶段要做的测试/Eval更新

- [ ] 新增 docRules 覆盖 `DEPLOYMENT.md`、`PERSISTENCE.md`、`EVALUATION.md`、`AI_PROVIDER.md`
- [ ] 为 `API.md` / `CLI.md` 设计最小 smoke 断言
  - API: 必含当前高频端点，如 `/health`、`/ready`、`/v1/retrieval/skills/search-by-content`
  - CLI: 必含当前根入口与默认 server URL 说明
- [ ] 如选择“补实现”而非“删承诺”，同步新增相应测试
  - capsule index rebuild 命令 smoke test
  - k8s/Helm 交付物存在性 test 或 manifest lint
- [ ] 运行
  - `pnpm check:docs-drift`
  - `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`

### 5. 必要的示例结构或代码

```markdown
## Docker Compose 默认部署

1. `docker-compose.yml` 默认走 PostgreSQL。
2. `server` 暴露 `4000:4000`，容器内 `HOST=0.0.0.0`。
3. 健康检查命中 `http://127.0.0.1:4000/health`。
4. JSON 文件模式仅作为兼容回退，必须单独标注，不得与默认路径混写。
```

```json
{
  "path": "/ready",
  "method": "GET",
  "expectedShape": {
    "ok": true,
    "queueWorkerRunning": "boolean",
    "database": "postgres | json-store"
  }
}
```

---

## 阶段四：修复参考文档、评测说明与 Skill 工作流文档

### 1. 任务清单

- [ ] `docs/PACKAGES.md`：复查包职责与 repo 边界是否仍准确
- [ ] `docs/PACKAGE_STACK_RATIONALE.md`：删除与实现脱节的技术选型表述
- [ ] `docs/reference/DATABASE_SCHEMA.md`：与 `packages/server/src/lib/persistence/schema/**` 同步
- [ ] `docs/reference/api-surface.md`：与当前 contracts/routes 校对
- [ ] `evals/README.md`、`evals/retrieval/README.md`、`evals/summary/README.md`、`evals/graph-extraction/README.md`：同步真实 runner、tier、dataset/scenario 结构
- [ ] `packages/skills/trapmap-knowledge-workflow/SKILL.md` 及 `references/**`：核对是否引用了旧命令、旧目录或旧治理流程

### 2. 阶段完成标准 (DoD)

- [ ] 参考文档不再复述已被 truth docs 管控的旧事实
- [ ] Eval README 与实际脚本入口、fixture 目录、baseline 行为一致
- [ ] Skill workflow 文档里的命令、路径、角色边界与当前 monorepo 结构一致

### 3. 每个阶段要做的文档更新

- [ ] 修改 `docs/PACKAGES.md`
- [ ] 修改 `docs/PACKAGE_STACK_RATIONALE.md`
- [ ] 修改 `docs/reference/DATABASE_SCHEMA.md`
- [ ] 修改 `docs/reference/api-surface.md`
- [ ] 修改 `evals/README.md`
- [ ] 修改 `evals/retrieval/README.md`
- [ ] 修改 `evals/summary/README.md`
- [ ] 修改 `evals/graph-extraction/README.md`
- [ ] 修改 `packages/skills/trapmap-knowledge-workflow/SKILL.md`
- [ ] 修改 `packages/skills/trapmap-knowledge-workflow/references/*.md`

### 4. 每个阶段要做的测试/Eval更新

- [ ] 若 `DATABASE_SCHEMA.md` 改动，更新相关 docRules / smoke test
- [ ] 为 eval README 增加 docRules，约束 `run.ts`、`smoke.ts`、`core.ts`、`eval:ci`
- [ ] 若 Skill workflow 文档修改了命令表面，补 CLI smoke 或脚本断言
- [ ] 运行
  - `pnpm check:docs-drift`
  - `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`

### 5. 必要的示例结构或代码

````markdown
## Retrieval Eval 目录真相

```text
evals/retrieval/
├── run.ts
├── smoke.ts
├── core.ts
├── lib/
└── scenarios/
```

> 若文档提到 `cases/*.yaml`，应视为过时描述，必须改写。
````

---

## 阶段五：处理功能性漂移并补防二次漂移守卫

### 1. 任务清单

- [ ] 对每个“待定功能性漂移”做决策：`implement` / `delete-doc-claim`
- [ ] 若保留 capsule index rebuild 运维承诺：
  - [ ] 暴露稳定命令入口（CLI、root script 或 server operations route）
  - [ ] 文档改为引用该稳定入口
- [ ] 若保留 Kubernetes / Helm 部署承诺：
  - [ ] 新增最小可用 chart/manifests
  - [ ] 文档改为引用仓库内真实路径
- [ ] 若不保留上述承诺：
  - [ ] 从文档中删除或改成“未来计划 / 内部能力”
- [ ] 扩展 `scripts/complexity-budgets.json`
- [ ] 扩展 `packages/server/src/__tests__/docs-truth-smoke.test.ts`
- [ ] 必要时扩展 `scripts/check-doc-drift.ts` 的规则能力

### 2. 阶段完成标准 (DoD)

- [ ] 所有面向使用者或运维者的能力声明都能在仓库中找到执行入口、脚本、路由或交付物
- [ ] 无法兑现的承诺已从活跃文档中删除
- [ ] 新增守卫足以覆盖本次发现的高频漂移类别

### 3. 每个阶段要做的文档更新

- [ ] 修改所有引用 capsule index rebuild 的文档
- [ ] 修改所有引用 Kubernetes / Helm 的文档
- [ ] 修改所有声明 `DEBUG` 或其他未消费变量的文档
- [ ] 在 `docs/guides/CONTRIBUTING.md` 增加“新增文档承诺时必须同时补 guard/test”的约束

### 4. 每个阶段要做的测试/Eval更新

- [ ] 为每个被保留的运维入口补 smoke test
- [ ] 为每个被删除的承诺补 `mustNotContain` 规则
- [ ] 运行
  - `pnpm check:docs-drift`
  - `pnpm test -- --run scripts/__tests__/check-doc-drift.test.ts`
  - `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts`
  - `pnpm eval:smoke`

### 5. 必要的示例结构或代码

```json
{
  "file": "docs/architecture/DEPLOYMENT.md",
  "mustNotContain": [
    "DEBUG=false",
    "Helm Chart 值文件"
  ]
}
```

```bash
# 若决定保留该能力，至少需要一个稳定入口，示例：
pnpm ops:rebuild-capsule-indexes
```

---

## 3. 全局完成标准

- [x] 所有 P0/P1 文档完成逆向核对
- [x] 所有高风险描述性漂移被修正
- [x] 所有功能性漂移都被决策为”补实现”或”删承诺”
- [x] `DOCS_TRUTH_MATRIX.md` 和 `SYSTEM_TRUTH_SOURCES.md` 成为后续文档维护入口
- [x] `scripts/complexity-budgets.json` 与 `docs-truth-smoke.test.ts` 对本轮漂移类别形成防线
- [x] 至少完成一次 `pnpm check:docs-drift` + `pnpm test -- --run packages/server/src/__tests__/docs-truth-smoke.test.ts` + `pnpm eval:smoke`

## 4. Sub-agent 执行建议

- [ ] 推荐先并行拉起 3 个 sub-agent
  - Lane A 负责高频文档修正
  - Lane B 负责架构/部署/组件文档修正
  - Lane C 负责 truth docs、guardrails、tests/evals
- [ ] 每个 sub-agent 只拥有不重叠的写入范围，避免互相覆盖
- [ ] 主线程只负责
  - 统一漂移分类标准
  - 审核功能性漂移决策
  - 合并 truth matrix 与测试策略
- [ ] 阶段二、三可并行
- [ ] 阶段五必须串行收口，因为它决定“实现还是删承诺”
