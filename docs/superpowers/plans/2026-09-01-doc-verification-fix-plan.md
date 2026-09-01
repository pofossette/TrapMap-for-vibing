# 文档正确性修复计划 — 并行多重校验后 (2026-09-01)

> **来源**：subagent driven 并行+冗余校验 (A1/B/C/D/E/F/G/H 共 8 verifier，146 mermaid PASS 146 blocks，table-schema 55/55 PASS，doc-drift 41 PASS)
> **基线**：`main@31cd53a2` (69→55 压缩已落地，但 DATA_MODEL 等 7 处二级文档未同步)
> **目标**：在保持 80-90% 性能前提下，让所有二级文档与 `packages/db/src/schema` 真相、Go 服务代码、`docker-compose.yml`、`service-config.ts` 一致；所有门禁 remain green

## 校验方法 (已执行)

- **A1/F 双遍 DB**：`pgTable 55` vs `DATABASE_SCHEMA 55` 对齐，但 `DATA_MODEL 9处 knowledge_boundary_*` 残留、`feedback_custom_answers 4处`、`usage_events_daily_rollup 3处` 均显示 drift
- **B Go**：`go.mod 1.23 chi 5.2.1 pgx 5.7.4` vs `GO_TECH_STACK.md` 一致；`GO-ACCELERATOR.md` timely exit 已正确；但 `SERVICE-DISCOVERY/ARCHITECTURE/DEPLOYMENT/ENVIRONMENT` 对 `knowledge-read-go :4101` 描述缺失
- **C Truth**: `SYSTEM_TRUTH_SOURCES` 缺 Go 读服务行
- **D Mermaid**: syntax PASS 146 blocks，但拓扑内容未含 Go 读服务 (内容漂移，非 syntax)
- **E Structure**: `docs/README 69` 两处残留；`CI_CD 69` 守卫描述残留
- **G Contracts**: `check:go-contract 21` ok, `openapi 508 lines` ok
- **H Complexity/Fallow**: 9 budgets PASS, fallow 0 boundary (8 changed files)

## 问题分级

| ID | 文件 | 行 | 严重度 | 描述 |
|---|---|---|---|---|
| D-01 | DATA_MODEL.md | 15,291-338,768,788 | P0 | 6 boundary 子表仍作 active |
| D-02 | DATA_MODEL.md | 11,31,552,796 | P0 | feedback_custom_answers 仍独立表 |
| D-03 | DATA_MODEL.md | 11,33,795 | P0 | usage_events_daily_rollup 仍独立表 |
| D-04 | docs/README.md | 204,269 | P1 | 69→55 |
| D-05 | PERSISTENCE.md | 259 | P1 | 反馈分析 4→2 |
| D-06 | CI_CD.md | 约44 | P1 | 69→55 守卫描述 |
| D-07 | api-surface.md | 141 | P2 | feedback_custom 同上 |
| G-01 | SERVICE-DISCOVERY.md | 全文 | P1 | 缺 knowledge-read-go |
| G-02 | ARCHITECTURE/DEPLOYMENT/ENV | - | P1 | 缺 TRAPMAP_READ_IMPL |
| G-03 | SYSTEM_TRUTH_SOURCES.md | 六服务表 | P1 | 缺 Go 读服务权威行 |
| S-01 | ARCHITECTURE mermaid | - | P2 | 拓扑未展示 Go (内容) |

## 修复任务分解 (并行，写集隔离)

### Task 1 — DATA_MODEL 核心漂移 (owner: db-docs)
- **文件**：`docs/reference/DATA_MODEL.md` only
- **范围**：D-01/D-02/D-03 全量
- **约束**：单文件 ≤821 行，新增 historical banner 不超预算；保留 Round3/6 历史但加 2026-09-01 压缩更新注记
- **验收**：`grep -c knowledge_boundary_ DATA_MODEL` 应降至注释性引用仅历史段；`feedback_custom_answers` 保留仅作历史提及；`pnpm check:docs` PASS；`pnpm check:table-schema` PASS

### Task 2 — README + CI_CD 表计数 (owner: doc-count)
- **文件**：`docs/README.md`, `docs/operations/CI_CD.md`
- **范围**：D-04, D-06
- **约束**：精确替换 `69 张表`→`55 张表` 及 `69 张 pgTable`→`55 张 pgTable`
- **验收**：`grep -rn "69 张表" docs --include="*.md" | grep -v archived` ==0

### Task 3 — PERSISTENCE + api-surface (owner: persistence-docs)
- **文件**：`docs/architecture/components/PERSISTENCE.md`, `docs/reference/api-surface.md`
- **范围**：D-05, D-07
- **约束**：PERSISTENCE 域表 `4`→`2`，补 GIN 注释；api-surface 补 jsonb 说明
- **验收**：`grep -n "反馈分析" PERSISTENCE.md` 显示 `2`；`api-surface 141` 含 `custom_answers jsonb`

### Task 4 — SERVICE-DISCOVERY Go 补充 (owner: discovery-docs)
- **文件**：`docs/architecture/SERVICE-DISCOVERY.md` only
- **范围**：G-01
- **约束**：在 `## 当前仓库事实` 表后增 `knowledge-read-go` 行；`## Consul 的职责` 后增 `### knowledge-read-go 分布式只读服务` 小节（≈15行），说明 `:4101` + `TRAPMAP_READ_IMPL` 四态
- **验收**：`grep -c knowledge-read-go SERVICE-DISCOVERY.md` ≥2；mermaid 仍 PASS

### Task 5 — ARCHITECTURE + SYSTEM_TRUTH_SOURCES (owner: arch-truth)
- **文件**：`docs/architecture/ARCHITECTURE.md`, `docs/reference/SYSTEM_TRUTH_SOURCES.md`
- **范围**：G-02 部分 + G-03
- **约束**：ARCHITECTURE 在 `六服务 ownership 冻结` 段补 Go 读服务形态 1 段（≈8行）；SYSTEM_TRUTH_SOURCES 在六服务表后增 1 行权威 `knowledge-read-go` (指向 `services/knowledge-read-go` + `packages/contracts/src/domain/knowledge-read-go.ts`)
- **验收**：两文件 `grep knowledge-read-go` 均命中；`pnpm check:docs` PASS

### Task 6 — DEPLOYMENT + ENVIRONMENT (owner: deploy-env)
- **文件**：`docs/architecture/DEPLOYMENT.md`, `docs/operations/ENVIRONMENT.md`
- **范围**：G-02 剩余
- **约束**：DEPLOYMENT 在 `distributed` 段补 `knowledge-read-go :4101 profile:["distributed"]` 6行；ENVIRONMENT 在 `TRAPMAP_DEPLOYMENT_PROFILE` 表后补 `TRAPMAP_READ_IMPL` 行
- **验收**：两文件各新增且 `pnpm check:docs` mustContain 满足

## 全局约束
- 单文件 ≤300 (通用) / ≤800 (PERSISTENCE/DATA_MODEL 例外) 预算内；`pnpm check:complexity` 9/9 PASS 必须保持
- 每 Task 独立分支写集，避免同文件并发冲突；Task1 单独文件可先行
- `fallback` 手动验证：`pnpm check:docs` + `pnpm check:structure` + `pnpm check:table-schema` + `pnpm typecheck` + `pnpm check:complexity` + `pnpm exec tsx scripts/check-mermaid.ts`
- 二次校验：修复后并行 + 多次负荷 — 同类内容 2-3 verifier 重复校验；`pnpm check:docs` 跑 3 次、mermaid 2 次、table-schema 2 次
- 去重：归档 `docs/archived/**` 中历史 69 描述不视为漂移

## 执行顺序
1. Task1 单独 (P0 最急)
2. Task2-6 并行 (P1)
3. 聚合验证 (并行多遍)
4. 门禁收敛 + 提交

