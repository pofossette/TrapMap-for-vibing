# Compose Runtime Closeout Design

## Goal

Provide an isolated, repeatable real-Compose acceptance path for Tranche 7 without occupying the developer's default gateway port or persisting credentials, containers, volumes, or test artifacts.

## Architecture

- Add a dedicated Compose override that selects only PostgreSQL, `gateway`, and the six distributed internal services. It parameterizes the gateway host mapping through `TRAPMAP_CLOSEOUT_GATEWAY_PORT` and leaves all internal service ports private to the Compose network.
- Add one closeout orchestration script. It allocates a loopback port, generates a per-run `TRAPMAP_SYSTEM_ADMIN_KEY`, assigns an isolated Compose project name, starts the selected services, and polls `gateway /health` before exporting `TRAPMAP_CLOSEOUT_BASE_URL` and the generated key to the existing `test:runtime-closeout` command.
- The script then restarts exactly the `knowledge-write` container. During restart it probes the gateway and the job-runtime queue status; after restart it retries a gateway-governance-knowledge-write command and records the elapsed recovery time. Success requires a continuously successful job-runtime status surface and gateway delegation recovery within 60 seconds.

## Failure Handling

On startup, closeout, or restart failure, print logs for the gateway, knowledge-write, governance-review, and job-runtime services. A shell `trap` always runs `docker compose down --volumes --remove-orphans`; generated values remain process-local and are never written to files.

## Evidence and Documentation

Correct the existing Tranche 6 closeout note: migration guard, pool configuration, targeted tests, and documentation are already verified, so its items 2, 5, 6, and 7 are complete. Runtime closeout is solely a Tranche 7 dependency. Keep all four Tranche 7 tasks unchecked until the script completes the real Compose acceptance. Once the full specified command set passes, record measured recovery evidence, tick those tasks, and document the command, isolation threshold, and continuing `Level 2 / transitional-microservice` maturity classification.

## Validation

Test the orchestration script and Compose asset shape statically, then run the requested distributed acceptance, distributed closeout, Compose runtime closeout, observability closeout, deployment smoke, typecheck, eval smoke, documentation drift, structure checks, and Fallow audit.
