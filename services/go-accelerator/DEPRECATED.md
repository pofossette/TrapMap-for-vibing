# go-accelerator — Deprecated Function-Set Center

> **Deprecated as of 2026-09-01** — function-set center is being retired in favor of module-level service `services/knowledge-read-go`.
> This file tracks sunset timeline. See `docs/archived/GO_ACCELERATOR_FUNCTION_RETIREMENT.md`.

## Sunset

- `POST /v1/retrieval/*` (score, ranking-batch, keyword-score) → move to `knowledge-read-go` internal/ranking
- `POST /v1/dedup/batch-similarity` → move to `knowledge-read-go` internal/recall (or dedicated go-dedup)
- Retained: `hash/canonical`, `vector/*`, `tokenize`, `dedup/fingerprint`, `gene/*` (pure compute, still useful)

## Behavior during migration

- All deprecated endpoints still serve but emit `X-Deprecated: use knowledge-read-go` and log `WARN deprecated`
- Infra fallback (`packages/infra/src/go-accelerator/fallback.ts`) will prefer `knowledge-read-go` when `TRAPMAP_READ_IMPL != off`, otherwise fallback to JS
- Scheduled removal: 2026-10-15 (Phase 5 closeout). Before removal, verify `knowledge-read-go` p95 <20ms and `fallow 0`.

## Code history exit

- Function-set ranking logic (`internal/service/ranking/ranking.go 393 lines`) is archived to `docs/archived/GO_ACCELERATOR_FUNCTION_RETIREMENT.md` and will be git-removed after Phase 5.
- No new features should be added to this service; use `knowledge-read-go`.

