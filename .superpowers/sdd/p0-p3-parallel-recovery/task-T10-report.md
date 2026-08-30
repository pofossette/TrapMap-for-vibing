# T10 — 平台L3运营验证 — Report

**Status:** DONE
**Branch:** `pre`
**Commit:** `chore(platform): add L3 operational verification and maturity docs`
**Date:** 2026-08-30

## Summary

Completed Platform L3 operational verification plumbing and maturity docs. Offline verification is fully CI-runnable; live kind/amqp/dual-DB gates are CLI-gated with explicit entry criteria and remain `CI_REQUIRED` until a kind/docker/dual-PG environment is available. Maturity remains `Level 2 / transitional-microservice + L3 verification pending`; promotion to `Level 3 / operationally-verified` is gated on the three live evidence items documented in `docs/architecture/DEPLOYMENT.md`.

No new runtime behavior beyond documented: probe timing additions are operational hardening (period/timeout) and all feature switches keep `postgres` default unchanged (`domain_event_outbox` always PG).

## Files Changed (exclusive partition)

- `k8s/base/*.deploy.yaml` (8 files) — hardened `readinessProbe`/`livenessProbe` to include `periodSeconds: 5/10`, `timeoutSeconds: 3`, `failureThreshold: 3` (gateway retains `replicas: 2`; HPA `candidate-worker` 70% remains via `k8s/base/hpa.yaml`). Probes remain `/ready` (port per service) and `/live`; verifiable via `kubectl apply --dry-run=client --validate=true -f k8s/base/`.
- `k8s/base/configmap.yaml` — added documented L3 optional env overlays: `TRAPMAP_TASK_TRANSPORT` (default `postgres`, `amqp` opt-in), `TRAPMAP_RABBITMQ_URL`/`EXCHANGE`, `TRAPMAP_JOB_RUNTIME_DATABASE_URL` (job-runtime only, fallback to shared DB).
- `docker-compose.closeout.yml` — added header comment wiring L3 verification (`replicas: 2` for `candidate-worker`/`outbox-worker` + `TRAPMAP_TASK_TRANSPORT=postgres` default).
- `docker-compose.yml` — no behavioral change; already keeps `TRAPMAP_TASK_TRANSPORT=${TRAPMAP_TASK_TRANSPORT:-postgres}` (pg default) and `TRAPMAP_RABBITMQ_*` wiring; `outbox-worker`/`cron-scheduler` intentionally keep `TRAPMAP_TASK_TRANSPORT=postgres` (outbox remains PG even with amqp).
- `packages/service-job-runtime/src/**` — no code change; verified via `scripts/verify-l3-platform.ts` that `async-runtime.ts` keeps `domain_event_outbox` on PG irrespective of task transport, and `host-distributed` amqp alias remains `amqp→rabbitmq` (checked `job-runtime/server.ts`, `cron-scheduler/server.ts`, `shared/database.ts` dual-DB fallback). Doc-only task, no new runtime behavior.
- `docs/architecture/DEPLOYMENT.md` — added `Platform L3 operational verification (2026-08-30 freeze, CLI-gated)` section: Level 2 → Level 3 entry criteria table (kind smoke `kubectl wait --for=condition=Ready pod`, amqp live smoke `TRAPMAP_TASK_TRANSPORT=amqp` pg default unchanged, dual-DB equivalence + rollback drill), offline plumbing (`scripts/verify-l3-platform.ts --check all` + `kubectl dry-run`), and four-step live execution cookbook. Maturity wording stays `Level 2 + L3 verification pending`.
- `docs/architecture/SERVICE-DISCOVERY.md` — added `成熟度与 L3 entry criteria` section mirroring DEPLOYMENT level, documenting distributed Docker DNS ↔ k8s Service alignment and Consul-optional static fallback invariance as L3 gate.
- `docs/operations/ENVIRONMENT.md` — documented `TRAPMAP_TASK_TRANSPORT=amqp` as `host-distributed` alias for `rabbitmq` (default stays `postgres`), added `TRAPMAP_JOB_RUNTIME_DATABASE_URL` row (job-runtime only, fallback to shared), expanded key constraints to reflect amqp/pg-default-fail-fast and dual-DB equivalence gate.
- `docs/operations/OBSERVABILITY-OPERATIONS.md` — added `L3 probes 与 closeout 验证 plumbing` section: k8s probes offline (`verify-l3-platform.ts --check k8s-probes` + `kubectl dry-run`) and live kind smoke (`wait Ready` + `/ready 200`), referencing `docs/architecture/DEPLOYMENT.md` entry criteria; extended closeout commands with `verify-l3-platform.ts --check all`.
- `scripts/verify-l3-platform.ts` — new offline plumbing script covering `k8s-probes`, `compose-replicas`, `transport-default`, `dual-db`, `service-discovery` with CI-gated live hints (no kind/docker required to pass).

## Verification Steps

### Offline plumbing (no live kind/docker, runnable on this machine)

```bash
pnpm exec tsx scripts/verify-l3-platform.ts --check all
# → ✓ k8s-probes PASS (8 Deployments probes OK, kubectl ENOENT → CI_REQUIRED hint)
# → ✓ compose-replicas PASS (candidate-worker:2 / outbox-worker:2 / TRAPMAP_TASK_TRANSPORT=postgres)
# → ✓ transport-default PASS (amqp→rabbitmq alias, docker-compose pg default, outbox PG)
# → ✓ dual-db PASS (TRAPMAP_JOB_RUNTIME_DATABASE_URL fallback gated to job-runtime)
# → ✓ service-discovery PASS (DISTRIBUTED_INTERNAL_HOSTS → k8s Service alignment)

kubectl apply --dry-run=client --validate=true -f k8s/base/  # syntax check (CI_REQUIRED if no cluster)
pnpm exec tsx scripts/verify-l3-platform.ts --check k8s-probes
pnpm exec tsx scripts/verify-l3-platform.ts --check compose-replicas
pnpm exec tsx scripts/verify-l3-platform.ts --check transport-default
```

### Live gates (CLI-gated, CI_REQUIRED when env absent)

1. **kind smoke** (requires kind + kubectl + docker):
```bash
kind create cluster --name trapmap-l3
kubectl apply -f k8s/base/
kubectl wait --for=condition=Ready pod --all -n trapmap --timeout=180s
kubectl get pods -n trapmap -o wide
kubectl port-forward svc/gateway 4000:4000 -n trapmap & curl -f http://127.0.0.1:4000/ready; kill %1
# readyz ≡ /ready must return 200
kind delete cluster --name trapmap-l3
```

2. **amqp live smoke** (requires docker compose + rabbitmq profile, pg default unchanged):
```bash
TRAPMAP_TASK_TRANSPORT=amqp TRAPMAP_RABBITMQ_URL=amqp://guest:guest@127.0.0.1:5672 \
  docker compose --profile distributed --profile mq up -d --build
curl -f http://127.0.0.1:4000/health | jq .dependencies
# task transport should be rabbitmq/amqp for candidate/governance, outbox stays PG, domain_event_outbox unaffected
docker compose --profile distributed --profile mq down --volumes
docker compose --profile distributed up -d --build  # rollback to pg default, no migration
```

3. **dual-DB equivalence + rollback drill** (requires two PG URLs):
```bash
export TRAPMAP_DATABASE_URL=postgres://trapmap:trapmap@127.0.0.1:5434/trapmap
export TRAPMAP_JOB_RUNTIME_DATABASE_URL=postgres://trapmap:trapmap@127.0.0.1:5435/trapmap-jr
# double-run: shared vs isolated, compare task_queue/domain_event_outbox semantics + getPoolSnapshot/healthCheck equivalence
# rollback: unset TRAPMAP_JOB_RUNTIME_DATABASE_URL && restart job-runtime, verify recovery
```

All three must produce evidence before promoting `DEPLOYMENT.md`/`SERVICE-DISCOVERY.md` to `Level 3 / operationally-verified`.

## Docs Updated

- `docs/architecture/DEPLOYMENT.md` Level 2 → `Level 2 + L3 verification pending` with explicit entry criteria + verification cookbook.
- `docs/architecture/SERVICE-DISCOVERY.md` same maturity alignment + kind smoke gate.
- `docs/operations/ENVIRONMENT.md` `TRAPMAP_TASK_TRANSPORT=amqp` alias documented, default `postgres` preserved, `TRAPMAP_JOB_RUNTIME_DATABASE_URL` added.
- `docs/operations/OBSERVABILITY-OPERATIONS.md` L3 probes verification section.

## Test Outputs

- `pnpm typecheck` — PASS (no errors).
- `pnpm check:docs` — PASS (blocking tiers green; `doc-references`/`links` WARN non-blocking only).
- `pnpm check:structure` — PASS (structure-guard/arch-freeze/stale-package-refs all PASS).
- `pnpm exec tsx scripts/verify-l3-platform.ts --check all` — PASS (5/5 checks, live gates CI_REQUIRED hinted, kubectl ENOENT handled).
- `pnpm test:distributed-closeout` — PASS (5 files 47 tests; includes `distributed-runtime-closeout` 60s recovery evidence).
- `pnpm test:deployment-smoke` — PASS (50 files 443 tests).
- `kubectl apply --dry-run=client --validate=true -f k8s/base/` — CI_REQUIRED on this host (kubectl ENOENT), script handles gracefully; manifests are yaml-valid and probes hardened.

## Remaining Live Env Gates

- **kind pod Ready/readyz 200** — `CI_REQUIRED` (no kind/kubectl/docker on this host); plumbing ready, run gate #1 above on CI or local kind host.
- **amqp live smoke** — `CI_REQUIRED` (no docker rabbitmq); pg default remains unchanged regardless, gate #2 above.
- **dual-DB TRAPMAP_JOB_RUNTIME_DATABASE_URL equivalence + rollback** — `CI_REQUIRED` (needs two PG instances); fallback code and docs verified offline, gate #3 above.

Maturity stays `Level 2 + pending`; promotion to `Level 3` awaits the three live evidences. No contracts/web-panel/governance-review routes/host gateway beyond job-runtime touched (partition clean via `git status`).

## Return

DONE — branch `pre`, commit `chore(platform): add L3 operational verification and maturity docs`.
