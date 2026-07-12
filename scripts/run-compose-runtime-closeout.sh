#!/usr/bin/env bash
set -euo pipefail

readonly closeout_services=(
  postgres
  gateway
  identity-access
  knowledge-read
  knowledge-write
  candidate-worker
  governance-worker
  outbox-worker
)
readonly recovery_timeout_ms=60000
readonly health_timeout_seconds=180

allocate_port() {
  node -e "const net = require('node:net'); const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const address = server.address(); console.log(address.port); server.close(); });"
}

compose_project="trapmap-closeout-$$-${RANDOM}"
export TRAPMAP_CLOSEOUT_GATEWAY_PORT="$(allocate_port)"
export TRAPMAP_SYSTEM_ADMIN_KEY="$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")"
export TRAPMAP_CLOSEOUT_BASE_URL="http://127.0.0.1:${TRAPMAP_CLOSEOUT_GATEWAY_PORT}"

compose=(
  docker compose
  --project-name "$compose_project"
  -f docker-compose.yml
  -f docker-compose.closeout.yml
  --profile distributed
)

print_failure_logs() {
  "${compose[@]}" logs --no-color gateway knowledge-write governance-worker outbox-worker || true
}

cleanup() {
  local exit_status=$?
  if [[ $exit_status -ne 0 ]]; then
    print_failure_logs
  fi
  "${compose[@]}" down --volumes --remove-orphans || true
  exit "$exit_status"
}
trap cleanup EXIT

wait_for_gateway() {
  local deadline=$((SECONDS + health_timeout_seconds))
  until curl --fail --silent --show-error "${TRAPMAP_CLOSEOUT_BASE_URL}/health" >/dev/null; do
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for gateway health at ${TRAPMAP_CLOSEOUT_BASE_URL}/health" >&2
      return 1
    fi
    sleep 1
  done
}

login() {
  local headers session_token
  headers="$(mktemp)"
  curl --fail --silent --show-error --dump-header "$headers" \
    --header 'content-type: application/json' \
    --data "{\"systemAdminKey\":\"${TRAPMAP_SYSTEM_ADMIN_KEY}\"}" \
    "${TRAPMAP_CLOSEOUT_BASE_URL}/v1/auth/login" >/dev/null
  session_token="$(awk 'BEGIN { IGNORECASE = 1 } /^x-session-token:/ { gsub(/\r/, "", $2); print $2 }' "$headers")"
  rm -f "$headers"
  printf '%s\n' "$session_token"
}

wait_for_system_admin_login() {
  local deadline=$((SECONDS + health_timeout_seconds))
  until session_token="$(login 2>/dev/null)" && [[ -n $session_token ]]; do
    if (( SECONDS >= deadline )); then
      echo 'Timed out waiting for identity-access system-admin login' >&2
      return 1
    fi
    sleep 1
  done
  printf '%s\n' "$session_token"
}

async_status() {
  local session_token=$1
  curl --fail --silent --show-error \
    --header "authorization: Bearer ${session_token}" \
    "${TRAPMAP_CLOSEOUT_BASE_URL}/v1/operations/status/async" >/dev/null
}

recovered_governance_command() {
  local session_token=$1 entry_id=$2
  curl --fail --silent --show-error \
    --header 'content-type: application/json' \
    --header "authorization: Bearer ${session_token}" \
    --data "{\"entryId\":\"${entry_id}\",\"actorId\":\"system-admin\",\"decision\":\"approve\"}" \
    "${TRAPMAP_CLOSEOUT_BASE_URL}/v1/knowledge/review" >/dev/null
}

create_reviewable_entry() {
  local session_token=$1 response
  response="$(curl --fail --silent --show-error \
    --header 'content-type: application/json' \
    --header "authorization: Bearer ${session_token}" \
    --data "{\"content\":\"compose closeout recovery probe\",\"actorId\":\"system-admin\"}" \
    "${TRAPMAP_CLOSEOUT_BASE_URL}/v1/knowledge")"
  node -e "const value = JSON.parse(process.argv[1]); if (!value.entryId) process.exit(1); process.stdout.write(value.entryId)" "$response"
}

"${compose[@]}" up --build --detach "${closeout_services[@]}"
wait_for_gateway
session_token="$(wait_for_system_admin_login)"
pnpm test:runtime-closeout

entry_id="$(create_reviewable_entry "$session_token")"

gateway_continuous=true
job_runtime_continuous=true
restart_started_ms="$(date +%s%3N)"
"${compose[@]}" restart knowledge-write &
restart_pid=$!

while kill -0 "$restart_pid" 2>/dev/null; do
  curl --fail --silent --show-error "${TRAPMAP_CLOSEOUT_BASE_URL}/health" >/dev/null || gateway_continuous=false
  async_status "$session_token" || job_runtime_continuous=false
  sleep 1
done
wait "$restart_pid"

while ! recovered_governance_command "$session_token" "$entry_id"; do
  recovery_elapsed_ms=$(( $(date +%s%3N) - restart_started_ms ))
  if (( recovery_elapsed_ms >= recovery_timeout_ms )); then
    echo "Gateway governance delegation did not recover within ${recovery_timeout_ms}ms" >&2
    exit 1
  fi
  sleep 1
done

recovery_elapsed_ms=$(( $(date +%s%3N) - restart_started_ms ))
if [[ $gateway_continuous != true ]]; then
  echo 'Gateway health was unavailable during knowledge-write restart' >&2
  exit 1
fi
if [[ $job_runtime_continuous != true ]]; then
  echo 'Job-runtime status surface was unavailable during knowledge-write restart' >&2
  exit 1
fi

printf 'knowledge-write restart recovery: %sms (gateway=true job-runtime=true)\n' "$recovery_elapsed_ms"
