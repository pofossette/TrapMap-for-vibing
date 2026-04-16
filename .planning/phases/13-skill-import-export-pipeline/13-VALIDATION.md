---
phase: 13
slug: skill-import-export-pipeline
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-16
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | none; package scripts call `vitest run` directly |
| **Quick smoke command** | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts && pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts` |
| **Quick run command** | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts && pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts && pnpm --filter @skill-shareer/cli test -- src/commands/operations.test.ts` |
| **Full suite command** | `pnpm test && pnpm typecheck` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the smallest affected contract/server/CLI test target first
- **After every plan wave:** Run `pnpm test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds for focused tests, ~60 seconds for the phase gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 1 | IMEX-01, IMEX-04, COMP-01 | T-13-01 / T-13-02 | Shared operation contracts describe artifact-native import payloads and responses without flattening file roles | contract | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` | ✅ | ⬜ pending |
| 13-01-02 | 01 | 1 | IMEX-01, IMEX-04, COMP-02 | T-13-01 / T-13-03 / T-13-04 | Server import path validates canonical directory structure, preserves file-role boundaries, and keeps required-level / review / audit hooks | integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts` | ✅ | ⬜ pending |
| 13-02-01 | 02 | 2 | IMEX-03, COMP-02 | T-13-02 / T-13-03 | Single `SKILL.md` import is normalized into the same governed artifact importer rather than a separate legacy path | integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts` | ✅ | ⬜ pending |
| 13-02-02 | 02 | 2 | IMEX-03, COMP-01 | T-13-02 | CLI compatibility import correctly detects one-file input and emits the artifact-native request shape | unit | `pnpm --filter @skill-shareer/cli test -- src/commands/operations.test.ts` | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 3 | IMEX-02, COMP-01 | T-13-05 / T-13-06 | Export contracts distinguish `artifactId`-targeted `skill-dir`, `distilled-json`, and `bundle-json` explicitly | contract | `pnpm --filter @skill-shareer/contracts test -- src/index.test.ts` | ✅ | ⬜ pending |
| 13-03-02 | 03 | 3 | IMEX-02, COMP-02, COMP-04 | T-13-03 / T-13-05 / T-13-06 | Server export path enforces auth/team/level boundaries for the requested `artifactId` and emits the requested governed format without sidecar-only leakage into `skill-dir` | integration | `pnpm --filter @skill-shareer/server test -- src/routes/operations.test.ts` | ✅ | ⬜ pending |
| 13-03-03 | 03 | 3 | IMEX-02 | T-13-05 | CLI export flow writes directory output for the requested `artifactId` in `skill-dir` mode and file output for JSON modes with stable machine-readable `--json` behavior | unit | `pnpm --filter @skill-shareer/cli test -- src/commands/operations.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠ flaky*

---

## Wave 0 Requirements

- [x] `packages/contracts/src/index.test.ts` already exists and can absorb Phase 13 contract coverage
- [x] `packages/server/src/routes/operations.test.ts` already exists and is the primary route-level verification seam
- [ ] `packages/cli/src/commands/operations.test.ts` — add focused CLI tests for path detection, format selection, and output routing
- [x] No new test framework installation is required

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Exported `skill-dir` output still looks like a normal Claude-compatible skill directory | IMEX-02, COMP-04 | Contract tests will not fully capture ergonomic on-disk layout expectations | Export one artifact in `skill-dir` mode and inspect that `SKILL.md`, `references/`, `assets/`, and `scripts/` appear in recognizable canonical locations without private server-only sidecars |
| Compatibility import remains intentionally bounded and does not masquerade as full directory support | IMEX-03 | This is a product-boundary check, not just a schema check | Import a lone `SKILL.md` and confirm the resulting artifact is minimal rather than pretending optional directories existed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
