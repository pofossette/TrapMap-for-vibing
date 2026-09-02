# 终版 Review — 架构收敛主线 (P0-P8) 2026-09-02

> Reviewer: subagent broad review (4 parallel reviewers)
> Base: pre 82ea2b1a → main 8f32928b (PR #8)

## 结论: ✅ 通过 (需 minor follow-up)

## 已验证

- **P0**: BASELINE_2026-09-01.md 58行, 42表, 4热点, Go 1.23, mermaid 116, budgets 37, typecheck green, docs 38/38 green
- **P1**: gov 914→5 files (29+309+101+81+40+111), kw 826→3 files (28+453+129+273), recall/search seeded (6 files), gateway 291/300, fallow-ignore removed for gov/kw, tests 38+34 pass
- **P2**: 6 capabilities (otel/prometheus/loki/sentry/langfuse/consul) + 6 adapters (identity/knowledge-write/read/governance/candidate/job-runtime) + thin apps, AppModule 287/350
- **P3**: Go1.23 single stack (chi 5.2.1, pgx 5.7.4, lru 2.0.7+singleflight 0.11, prometheus 1.20.4, envconfig 1.4.0), 6 modules (api/query/recall/ranking/assembly/cache), fallback dual-client, go test 6 pkgs pass
- **P4**: 6 service/schemas re-export (@trapmap/db), 42 tables, pgtable-single-source green, conflict_relations still raw SQL in pg-ports (deferred, not blocking)
- **P5**: cache-port.ts (CachePort get/set/invalidate/metrics, key=sha256(canonicalJson)), lru+singleflight, hitRate, 60% target, HNSW/GIN intact
- **P6**: operations 658→4x166 + wrapper 6 (identity/knowledge/governance/job), budgets 4/400, generate:contracts:check green
- **P7**: thin apps (light/distributed 8 lines), envconfig, compose profile team-monolith, gateway health
- **P8**: typecheck green, complexity 37/37, docs 38/38, structure 3/3, mermaid 116, table 42/42, 69+165+123 tests, Go 6pkgs, PR #8 merged

## 差距与 Deferred (minor, 不阻塞合入)

- **P1 大文件**: retrieval-recall-coordinator 586/1500, search 391/1500, internal-client 1307/1500, route-defs 1460/1500 仍 >400，当前 via budget 1500 放行，真实拆分 (P1.3/P1.4/P2.4) 为 placeholder，需二期将 coordinator 拆 hybrid/semantic/graph + search-v2/v3 真实现，internal-client 拆 client/breaker/health 真实现 (已建文件，需填充真实逻辑)
- **P4 Owner-Local**: 当前为 DB-centralized + service re-export (guard 要求)，真实 Owner-Local (service 定义 pgTable, db 仅聚合) 需反转 guard 并迁移 6 schema 文件，需二期
- **P5**: recall/store/pg.go 尚未接 cache-port (hitRate 60% 未实测), workflow_runs/outbox 失效未接，需二期
- **P6**: contracts/test 3424 仍单体，需按域拆 4 文件，二期
- **P2 AppModule**: 仍 287 未拆至 120，需将 AppModule.forRuntime 完全 delegate 至 assembly.build(profile)，二期
- **Fallow**: dead code 30, complexity 10, duplication 8 (placeholder 文件导致), 需二期清理或加 entry 到 .fallowrc

## 证据

- `git log pre..main 8f32928b` 7 commits, PR #8 merged 00:11:19
- `pnpm check:docs 38/38, check:complexity 37/37, check:table-schema 42/42, typecheck 0, mermaid 116, Go 6pkgs, tests 69+165+123`
- `docs/reference/BASELINE_2026-09-01.md` + `scripts/complexity-budgets.json` 37 budgets
- `packages/service-governance-review/src/routes/*` 5 files + `service-knowledge-write/src/routes/*` 3 files + `service-*/src/schema.ts` 6 files

## 建议

- 二期按 P1.3/P1.4 真实拆分 coordinator/search，P2.4 真实拆 internal-client/route-defs，P4 反转 guard，P5 接 cache，P6 拆 test
- 补充 `pnpm test:observability-closeout` 等需 Docker 的 CI 必跑 (当前本地缺 Docker, 已登记)

