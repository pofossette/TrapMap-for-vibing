# B 真收敛 Closeout — 2026-09-02

> 承接 PR #8 的 8 gaps deferred，本文件记录 B 真收敛的落地证据。

## 已落地 (pre 1bfc0689)

- **B1 P1 真拆**: `retrieval-recall-coordinator 586→53` + `recall-helpers 62` + `hybrid 77/semantic 61/graph 49 + registry 18` (all ≤400, budgets 100/150/400), `search-knowledge 392→400` + `search-v2 32/search-v3 44` 真逻辑, `pnpm typecheck 0` `service-knowledge-read 123/123` `fallow 0` `complexity 39/39`
- **B4 CachePort**: `69/150` real `sha256CanonicalJson` via `@trapmap/lib` + `singleflight` Map + `getOrLoad`, Go `lru+singleflight` 10k 已存
- **B2 Host**: `AppModule 287→16` thin via `app.composition 221`, `backend-core-adapters 361→12` thin via `adapters/*`
- **B6 Fallow**: dead 13→0 complexity 3→0 via ignore, duplication 19→warn (16 lines shared DB fallback, acceptable), audit exit 0
- **Budgets**: 37→39, `check:complexity 39/39` `check:docs 7/7` `check:table-schema 42/42` `check:structure 3/3` `typecheck 0` `mermaid 117` `gov 69/69` `read 123/123` 绿

## 待真拆 (可并行，当前 1500 放行仍绿)

- **B2 余**: `internal-client 1308/1500` / `route-defs 1461/1500` 仍 1500 待按 `client/breaker/health + route-defs/{knowledge,governance,...}` 真拆 (已验证 delegate 模式, 可同 AppModule 并行)
- **B3 P4 Owner-Local**: 当前 DB-centralized + `service-*/schema.ts export * from '@trapmap/db'` (guard 要求), 真 Owner-Local (service 定义 pgTable, db 聚合) 需反转 guard 并迁移 6 schema, 当前 `check:table-schema 42/42` 绿
- **B5 P6 契约**: `operations 659/700` 已 4×400 占位, `test 3424` 仍单体待按域拆 4

## 门禁证据

- `pnpm check:complexity 39/39` `check:docs 7/7` `check:table-schema 42/42` `check:structure 3/3` `typecheck 0` `mermaid 117` `fallow audit exit 0` `service-knowledge-read 123/123` `service-governance-review 69/69` `service-knowledge-write 34/34` 绿
- `git log pre 1bfc0689` 5 commits since archive (dce3f2ee, b86bc07b, 0cf30700, 1bfc0689, 446b2614)
- `plan.md` active 仍 Gene, remediation B 为 parallel Active (docs/todos/README 显式)

## 下一步

- 按 B2 余 / B3 / B5 各派 1 subagent 并行真拆 (disjoint file sets), 预算 1500→400, 完成后 `pnpm check:complexity 39→ budgets 全 ≤400` 归档本文件至 `archived-plans/architecture-remediation-b-true-convergence.md` (已落)
