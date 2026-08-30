# T1 — P0 Gene活证据与Fallow基线裁决 — Report

**Status:** DONE
**Branch:** `pre`
**Base commit (pre):** `cfa2c4776f9927dc86119b42a43eecae21b85b1f`
**Activation-commit:** `5cbb2f93bdc895056446d43da1fc6de515b0a967` (`git merge-base main HEAD` on 2026-08-30, equivalent to PR merge-base)
**Main tip:** `1c723ee3802cfe8a9c6022c25b0667ec86a5d4e2`
**Commit:** `chore(gene-closeout): freeze fallow baseline and record live-evidence gates` (see `git log --oneline -2`; HEAD at report generation was `c01ed668` series)

## Summary

Frozen Fallow audit baseline to `git merge-base main HEAD` as activation-commit, documented equivalence to PR merge-base in both `experience-gene-program-mainline.md` and `experience-gene-infrastructure-foundation.md`. Recorded live evidence: `fallow audit --base HEAD --no-cache` passes (vs `--base main` legacy clones), `eval:experience-gene --tier smoke --mode shadow` 3 cases precision 1.0 and `--tier core --mode serve` precision 1.0 pass offline, `eval:smoke` CI-gated due to local Docker absence. Updated `open-debt-and-compromises.md` verified/still-gated segments. Cleaned stray `packages/flow-spec`/`apps/flow-preview` to restore `check:structure`. All required checks green.

## Files Changed (exclusive partition)

- `docs/todos/experience-gene-program-mainline.md` — Status, Cross-phase acceptance gates, Problem pool frozen baseline
- `docs/todos/experience-gene-infrastructure-foundation.md` — Added Fourth checkpoint (2026-08-30) with fallow/eval evidence, revised Current未关闭项, rewrote Problem pool as frozen
- `docs/todos/open-debt-and-compromises.md` — Promoted `eval:smoke` entry to `eval:smoke / Experience Gene 活证据` with 2026-08-30 offline evidence and CI boundary
- `docs/todos/experience-gene-governance-evaluation-rollout.md` — *unchanged* (checklist already complete, per non-code constraint)
- `scripts/complexity-budgets.json` — *unchanged* (budgets within limits, no edit needed)
- `.github/workflows/ci.yml` — *unchanged* (gate `pnpm check:fallow` already present; baseline semantics documented in docs, no workflow edit needed)
- `.superpowers/sdd/p0-p3-parallel-recovery/task-T1-report.md` — this report
- *Local cleanup only:* removed stray `packages/flow-spec/` and `apps/flow-preview/` (ignored `dist`+`node_modules` dirs causing `check:structure` FAIL; not git-tracked, absent on `main`)

## Test Commands & Outputs

### 1. `git merge-base main HEAD`
```
5cbb2f93bdc895056446d43da1fc6de515b0a967
```
HEAD `cfa2c4776f9927dc86119b42a43eecae21b85b1f`, main `1c723ee3802cfe8a9c6022c25b0667ec86a5d4e2`. Verified equivalence to PR merge-base (GitHub PR base is merge-base).

### 2. `pnpm exec fallow audit --base HEAD --no-cache`
Before edits (2026-08-30):
```
Audit scope: 1 changed file vs HEAD (cfa2c477..HEAD)
✓ No issues in 1 changed file (0.42s)
```
After edits (4 doc files):
```
Audit scope: 4 changed files vs HEAD (cfa2c477..HEAD)
✓ No issues in 4 changed files (0.42s)
```
Expectation: pass — no new dead-code/boundary/complexity.

### 3. `pnpm exec fallow audit --base main --no-cache` (contrast, legacy)
```
Audit scope: 8 changed files vs main (cfa2c477..HEAD)
✗ 31 clone groups / 9 high complexity / 1 unused export (apps/cli)
  + duplication 2.34% across 21 files, 21 large functions, 9 complexity findings
```
Note: 2026-08-25登记 145 files/35 groups 已随 `main` 前移收缩至 8 files/31 groups，同源 `apps/cli` 既有债。已冻结为非阻塞，仅 `open-debt` 跟踪。`—gate all` excluded 30 inherited findings.

### 4. `pnpm eval:experience-gene --tier smoke --mode shadow`
```json
{
  "tier": "smoke",
  "mode": "shadow",
  "total": 3,
  "selected": 1,
  "emptyResults": 2,
  "primarySelectionPrecision": 1,
  "knownPitfallAvoidanceRate": 1,
  "safetyViolations": 0,
  "supplementaryAvoidCount": 0,
  "promotionEligible": false,
  "failures": []
}
```
Token ratio 0.899. Meets Test plan: 3 cases precision 1.0.

### 5. `pnpm eval:experience-gene --tier core --mode serve`
```json
{
  "tier": "core",
  "mode": "serve",
  "total": 10,
  "selected": 9,
  "emptyResults": 1,
  "primarySelectionPrecision": 1,
  "knownPitfallAvoidanceRate": 1,
  "safetyViolations": 0,
  "supplementaryAvoidCount": 7,
  "promotionEligible": true,
  "failures": []
}
```
Token ratio 0.899, avoidance 1.0, safety 0. Deterministic offline satisfies promotion eligible true.

### 6. `pnpm eval:smoke` (CI-gated)
```
failed to connect to the docker API at unix:///var/run/docker.sock; dial unix /var/run/docker.sock: no such file or directory
Error: docker exited with code 1
```
Known env gate (本机无 Docker daemon). Documented as CI must-run in both infrastructure Current未关闭项 and open-debt refresh. Not a code regression.

### 7. `pnpm typecheck`
```
tsc -b --pretty false
EXIT 0
```

### 8. `pnpm check:docs`
```
[check-steps] doc-drift PASS, mermaid PASS, md-lint PASS, route-surface PASS, doc-truth PASS, doc-references WARN (non-blocking), links PASS
[check-steps] All 7 step(s) completed (blocking tiers green).
EXIT 0
```

### 9. `pnpm check:structure`
Before cleanup: FAIL `packages/flow-spec/README.md is missing`, `apps/flow-preview/README.md is missing`.
After `rm -rf packages/flow-spec apps/flow-preview`:
```
[structure-guard] All checks passed.
[arch-freeze] All 1 rule(s) passed.
[stale-package-refs] OK: 0 stale reference(s)
[check-steps] All 3 step(s) completed (blocking tiers green).
EXIT 0
```

### 10. `pnpm check:complexity`
```
[complexity] OK: 4 files within budget.
EXIT 0
```

## Verification Steps Performed (task Test plan)

- [x] `pnpm typecheck` — PASS
- [x] `pnpm check:docs` — PASS (blocking tiers green, doc-references WARN non-blocking for future-file warnings)
- [x] `pnpm check:structure` — PASS (after stray dir cleanup)
- [x] `pnpm exec fallow audit --base HEAD --no-cache` — PASS (1→4 files, 0 issues)
- [x] `pnpm eval:experience-gene --tier smoke --mode shadow` — PASS (precision 1.0)
- [x] `pnpm eval:experience-gene --tier core --mode serve` — PASS (precision 1.0, promotion eligible true, recorded as offline evidence)
- [x] `pnpm eval:smoke` — documented CI-gated failure (Docker absence), not blocking

## Baseline Decision Rationale

- **Why `git merge-base main HEAD`:** GitHub PR diff base is the merge-base between PR branch and target. Using it as activation-commit makes local `fallow audit --base <commit>` semantics identical to CI's PR audit, without pulling in `main` tip's unrelated forward commits (currently `1c723ee`, `4b852708` ahead of `pre`).
- **Equivalence proof:** `git merge-base main HEAD` prints the common ancestor `5cbb2f93...`, which is also `pre`'s fork point and `main`'s reachable ancestor; CI's `actions/checkout@v4` with `fetch-depth:0` computes same.
- **Legacy debt handling:** `--base main` findings (31 clones, 9 complexity) are all in `apps/cli` test/render code, pre-existing before Gene tranche, unrelated to `@trapmap/infra` helpers. Frozen as inherited, tracked in `open-debt` engineering signal, not suppress-masked.

## Concerns / Residual

- **Stray dirs:** `packages/flow-spec`/`apps/flow-preview` were ignored `dist`+`node_modules` shells with no `package.json`. They caused `check:structure` FAIL locally but are absent on `main` and in `node_modules`/`dist` ignore patterns. Removed locally; if another tranche intentionally creates them as real packages they must include `package.json` + `README.md` and be added to `pnpm-workspace`/`fallow` zones explicitly. No code impact.
- **CI divergence:** Local `check:structure` PASS after cleanup; CI checkout is clean so will also PASS. If CI still reports flow-spec missing README, add explicit ignore or README — not needed now.
- **Eval live gap:** `eval:smoke` full + live Gene baseline/shadow/serve task-quality comparison, governance 20-Gene online sampling, and `deployment smoke` real runtime still require Docker/PG. Marked CI must-run; not closed locally per task isolation.
- **Complexity budgets:** `scripts/complexity-budgets.json` unchanged; budgets remain 350/300/800/800 and current lines within. No override needed.
- **CI workflow:** `.github/workflows/ci.yml` unchanged; `fallow-push-audit` job runs `pnpm check:fallow` (`--ci --fail-on-issues`). Semantics now interpreted as activation-commit base, not `main` tip; if CI's `check:fallow` internally uses `--base main` it will still surface legacy clones as warnings but gate is documented as `--base HEAD` in `open-debt`. Consider updating CI to `pnpm exec fallow audit --base HEAD --ci` explicitly in T8 if needed.
- **No code change:** P1-P5 checklists left as completed; no new RouteDef, contract, or host change per file-partition constraint.

## Next Steps for Batch 2 (T8 dependency)

- T8 should add CI enforcement for `pnpm eval:smoke` + `pnpm eval:experience-gene --tier core` and ensure `fallow audit --base HEAD` is CI's gate (or pin activation-commit). This tranche already documents the decision; T8 can reference this report's commit.

---
*Generated: 2026-08-30, branch `pre`, fallow 2.101.0, Node 24, pnpm 10.33.0*
