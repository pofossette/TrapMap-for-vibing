#!/usr/bin/env bash
set -euo pipefail
# Phase 0.5: isolation reset between artifact runs
# Usage: bash scripts/cli-integration-reset.sh [--keep-images]
KEEP_IMAGES="${1:-}"
echo "[reset] down compose (distributed + team-monolith) ..."
docker compose --profile distributed --profile team-monolith --profile mq down -v --remove-orphans 2>&1 || true
# also try plain down without profiles for legacy containers
docker compose down -v --remove-orphans 2>&1 || true
echo "[reset] prune volumes (keep images) ..."
docker volume prune -f 2>&1 | head -n 20 || true
if [[ "$KEEP_IMAGES" != "--keep-images" ]]; then
  echo "[reset] prune dangling images (keep built trap-map images) ..."
  docker image prune -f 2>&1 | head -n 20 || true
fi
echo "[reset] clean .data / logs (preserve .gitkeep) ..."
mkdir -p .data logs
find .data -mindepth 1 -not -name '.gitkeep' -exec rm -rf {} + 2>&1 || true
mkdir -p logs
find logs -mindepth 1 -exec rm -rf {} + 2>&1 || true
echo "[reset] docker system df ..."
docker system df 2>&1 | head -n 30 || true
echo "[reset] done"
