# Go Accelerator Function-Set Retirement Archive

> Archive of function-set compute center (`services/go-accelerator`) logic that has been migrated to module-level service `services/knowledge-read-go`.
> This file ensures code history exits cleanly — original large-file logic is snapshot here before git removal (Phase 5 closeout).

## Sunset Date

- Deprecated: 2026-09-01 (DEPRECATED.md)
- Removed from code: scheduled 2026-10-15 after knowledge-read-go p95 <20ms verified

## Archived Logic Snapshot

### ranking.go (393 lines) — split into 3 domain files

- **Before**: `services/go-accelerator/internal/service/ranking/ranking.go` single file 393 lines (anti-pattern)
  - `MergeCandidates` (MergeSemanticWeight 0.6 / Keyword 0.4)
  - `RerankCandidates` (DualChannelRerankBoost 0.15, TokenCoverage 0.1, StaleDecay 0.1)
  - `MergeCandidatesWithGraph`, `computeBoundaryScoreDelta`, `normalizeBoundaryLabel`
  - `Entry`, `TokenMatch`, `Boundary` structs

- **After**: `services/knowledge-read-go/internal/ranking/domain/`
  - `merge.go` ≤150 lines — `Merge`
  - `rerank.go` ≤150 lines — `Rerank`
  - `boundary.go` ≤120 lines — `BoundaryDelta` + `normalize`

Migration verification: `go test ./internal/ranking -v` golden vs `packages/backend-core/src/knowledge-read/domain/ranking.ts`, `pnpm check:go-contract`.

### retrieval.go

- `RetrievalScore` handler → migrated to `knowledge-read-go/internal/recall` (pgx read + ranking)
- Original handler kept thin deprecated proxy until removal

### Remaining pure compute (retained)

- `hash/canonical`, `vector/cosine/batch-cosine/fallback`, `tokenize`, `dedup/fingerprint`, `gene/select` — retained in go-accelerator as shared compute plane, not retired.

## History Index

- `go-accelerator@v0.1` commit `622a0732` — last version with full function-set
- `knowledge-read-go@v0.1` commit (this PR) — modular service v0.1
- `DEPRECATED.md` — deprecation notice

## Exit Checklist

- [ ] knowledge-read-go `shadow 5%` consistency >99.5% (metrics)
- [ ] knowledge-read-go `go 100%` p95 <20ms (mixed-50-1)
- [ ] fallback_total <0.1%
- [ ] `git rm services/go-accelerator/internal/service/ranking/ranking.go` + handler proxy removed
- [ ] This file remains as historical evidence, `go-accelerator` not resurrected

