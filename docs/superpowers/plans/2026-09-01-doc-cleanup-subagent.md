# Doc Cleanup Subagent Plan — 已删内容清零 + 结构精简

## 目标
- 已删除的 `packages/server (Wave-10)` 历史包袱从 active docs 中彻底移除，不再以“历史说明”“Phase 段落”形式留存。
- 结构更紧凑、可读性更强：每文档 30-50% 瘦身，无废话，信息密度提升。
- 真源对齐：所有 DB 表路径指向 `packages/db/src/schema/*`、路由指向 `packages/service-*/src/routes.ts` 与 `packages/host-local|distributed/src/**/gateway*`，42表一致。

## 约束
- `packages/server` 在 active docs 中出现次数应为 0（除非在 SYSTEM_TRUTH_SOURCES 的“已删除”单一真实声明行中按需保留）。
- 禁止新增 `Phase 0/1/2/3/4`、`Wave-10 已删除` 段落、长历史补充；如需提及迁移，仅一句脚注指向归档。
- 单文件 ≤ 600 行，ARCHITECTURE ≤ 400，GLOSSARY 表格去冗余，组件文档 ≤ 500。
- mermaid 必须可渲染（check:mermaid 绿）。
- 守卫：`check:docs`、`check:stale-package-refs`、`check:table-schema`、`check:mermaid` 必须绿。

## 任务分工（并行）

### Task A — ARCHITECTURE.md (owner: agent-a)
文件：`docs/architecture/ARCHITECTURE.md`
目标：<400 行，现架构唯一真相
- 删除：顶部 Wave-10 历史说明框、全部 Phase 0-5 补充事实段落、Server Bounded Context 7上下文、Server Layer Ownership 5层表、运行时 `packages/server/src/lib/runtime/*` 段落、Server 包章节（### 2. Server 包）、store_snapshot 双写、deployment 中 server Dockerfile 行。
- 保留/新增：宿主入口（host-local/host-distributed）、6 bounded contexts（identity-access/knowledge-write/knowledge-read/governance-review/candidate-ingestion/job-runtime）、backend-core 纯规则层定位、RouteDef 薄路由层、PG-first 持久层（42表）、启动顺序（host-local/host-distributed 统一）、分层图+请求生命周期图（保留精简版，确保 mermaid 渲染）、模块划分改为 Apps/Hosts/Services/Core 四层。
- 去废话：合并可观测/服务发现三行表，不展开 LGTM 细节。

### Task B — PERSISTENCE + RETRIEVAL (+ARTIFACTS 轻量)
文件：`docs/architecture/components/PERSISTENCE.md`、`docs/architecture/components/RETRIEVAL.md`、`docs/architecture/components/ARTIFACTS.md`
PERSISTENCE 目标 ≤ 350 行：
- 删历史说明框、Store 接口/SkillShareerStore/StoreData/JsonStore 三节、store_snapshot 回退叙事、双实现兼容论述。
- 新结构：PostgreSQL 权威（16+pgvector/HNSW/tsvector+GIN）、42表按 owner 列（6 service owners + db schema 真源）、Drizzle baseline 6目录、PG-first 事实（不再提 JsonStore）、索引策略一节。
RETRIEVAL 目标 ≤ 500 行：
- 删历史说明框、所有 `packages/server/src/lib/retrieval/**` 表格行（替换为 `service-knowledge-read/src/*` 真源）、过长 channel 枚举表（压缩为通道类型+一句话职责）、冗余 mermaid（保留 v1/v2/v3 各一图）。
- 新真源：`service-knowledge-read` 三版本检索、recall channels、GraphQueryBackend 约束。
ARTIFACTS 轻量：删历史说明框，路径换 `service-knowledge-write`+`db/schema/artifacts.ts`，保留工件生命周期精简。

### Task C — GLOSSARY.md
文件：`docs/reference/GLOSSARY.md` 目标 ≤ 500 行（现 708）
- 删除顶部 Wave-10 更新框。
- 全量替换：所有 `packages/server/src/lib/persistence/schema/*.ts` → `packages/db/src/schema/*.ts`（对应 artifacts/knowledge/candidates/retrieval 等）；`packages/server/src/lib/retrieval/**` → `packages/service-knowledge-read/src/**`；`packages/server/src/routes/*.ts` → 对应 `packages/service-*/src/routes.ts` 与 `packages/host-*/src/**/gateway*`。
- 删除已压缩表：`skill_artifact_metadata`、`candidate_analyses`、`candidate_manual_results` 等不存在表的行（GLOSSARY 仍列 69表旧表），换为 jsonb 合并说明。
- 压缩：每术语卡“位置表”从 8-12 行压至 3-5 行核心 Zod/DB/Route 三列；移除 Round 3/4 冗长更新脚注，留一句 “结构化子表为准”。

### Task D — DATA_MODEL + DATABASE_SCHEMA + SYSTEM_TRUTH_SOURCES
文件：`docs/reference/DATA_MODEL.md`、`docs/reference/DATABASE_SCHEMA.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`
DATA_MODEL ≤ 500 行：删顶部 Wave-9/Phase 0 长段、store_snapshot 主事实源表、Phase 0原子交付长叙事中“store_snapshot 兼容层”废话；保留 42表权威+回滚边界、PG-first 一句。
DATABASE_SCHEMA 目标 ~300 行：删历史说明框、Phase 1/2 推进长脚注、冗余 “迁移只支持空库” 重复段落归一；保留 42表一览+技术栈。
SYSTEM_TRUTH_SOURCES：精简 Wave-10 重复打钩行，合并已删除条目为一行脚注，六服务边界与 Go 读服务行保留精简。

### Task E — 边界与运营收敛
文件：`docs/reference/api-surface.md`、`docs/architecture/BOUNDARIES.md`、`docs/architecture/DEPLOYMENT.md`、`docs/PACKAGES.md`、`docs/operations/TESTING.md`、`docs/operations/CI_CD.md`、`docs/architecture/OBSERVABILITY.md` 等
- api-surface：删 Wave-10 更新框、Round 3 重复说明，源码依据统一指向 gateway route-defs。
- BOUNDARIES：删 Phase 重复叙事，保留 zone 规则表精简。
- DEPLOYMENT：删 `packages/server/Dockerfile` 历史行，重写部署为 host-local/host-distributed + Go 读服务。
- PACKAGES/TESTING/CI_CD：移除 server 路径、store_snapshot 段落，换 db/owner 真源；瘦身 30%。
- 所有文件移除超长“历史包袱”脚注，保留指向归档的短链接。

## 验收
- `pnpm check:docs && pnpm exec tsx scripts/check-stale-package-refs.ts && pnpm exec tsx scripts/check-mermaid.ts && pnpm check:table-schema` 全绿
- `grep -rn "packages/server" docs --include="*.md" | grep -v "archived" | wc -l` == 0 或仅 SYSTEM_TRUTH_SOURCES 1 行声明
- 各重写文件行数达标，mermaid 渲染验证通过
