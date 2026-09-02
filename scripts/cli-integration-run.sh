#!/usr/bin/env bash
set -euo pipefail
# One-click CLI integration runner for three artifacts
# Usage: bash scripts/cli-integration-run.sh [--artifact A-light|B-heavy|C-go|all] [--runs 3] [--gateway http://127.0.0.1:4000]
ARTIFACT="all"
RUNS=3
GATEWAY="http://127.0.0.1:4000"
ROOT="benchmarks/results/cli-integration"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --artifact) ARTIFACT="$2"; shift 2;;
    --runs) RUNS="$2"; shift 2;;
    --gateway) GATEWAY="$2"; shift 2;;
    --root) ROOT="$2"; shift 2;;
    --help) echo "Usage: $0 [--artifact all|A-light|B-heavy|C-go] [--runs N] [--gateway URL]"; exit 0;;
    *) echo "unknown arg $1"; exit 1;;
  esac
done

ARTIFACTS=()
if [[ "$ARTIFACT" == "all" ]]; then
  ARTIFACTS=("A-light" "B-heavy" "C-go")
else
  ARTIFACTS=("$ARTIFACT")
fi

for art in "${ARTIFACTS[@]}"; do
  for i in $(seq 1 $RUNS); do
    run=$(printf "run-%02d" $i)
    echo "=== $art $run ==="
    pnpm exec tsx scripts/cli-integration-run.ts --artifact "$art" --run "$run" --gateway "$GATEWAY" --root "$ROOT"
  done
done

echo "=== generating report ==="
pnpm exec tsx scripts/cli-integration-report.ts --root "$ROOT" --out docs/archived/evidence/cli-integration-2026-09-02/SUMMARY.md
echo "done"
