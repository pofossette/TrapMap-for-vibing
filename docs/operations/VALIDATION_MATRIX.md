# Runtime Recomposition Validation Matrix

## Status

- Status: `active`
- Created: 2026-06-18
- Purpose: Comprehensive validation checklist for the runtime recomposition

> This matrix is a migration-era checklist. Package creation and root script rewiring are already complete; unchecked items below mostly represent manual parity, runtime smoke, and operational hardening work that still remains.

## Package-Level Validation

### @trapmap/client-core

- [x] TypeScript compiles without errors
- [x] All tests pass (21/21)
- [x] Package.json properly configured
- [x] README is complete
- [x] No CLI dependencies
- [x] Browser-compatible (standard fetch only)
- [x] SessionProvider contract is clear

### @trapmap/backend-core

- [x] TypeScript compiles without errors
- [x] All tests pass (33/33)
- [x] Package.json properly configured
- [x] README is complete
- [x] No Fastify dependencies
- [x] No process startup code
- [x] All ports are abstract interfaces
- [x] All modules are independent
- [x] Runtime capability model is complete
- [x] Invocation model is defined

### @trapmap/host-local

- [x] TypeScript compiles without errors
- [x] Package.json properly configured
- [x] README is complete
- [x] Uses backend-core ports
- [x] No business logic in host
- [x] Profile-based assembly works
- [x] Gateway-only model maintained
- [x] Health checks implemented

### @trapmap/host-distributed

- [x] TypeScript compiles without errors
- [x] Package.json properly configured
- [x] README is complete
- [x] All 7 services implemented
- [x] Gateway is only external service
- [x] Internal services have internal endpoints
- [x] Inter-service HTTP communication works
- [x] Database connections are per-service
- [x] Configuration is per-service
- [x] Authentication middleware in place
- [x] Fetch timeouts implemented
- [x] ID generation uses crypto.randomUUID()
- [x] SQL injection prevention in place

## Runtime Form Validation

### local-agent Profile

- [ ] Can start via host-local
- [ ] Health checks respond
- [ ] Minimal route surface works
- [ ] Retrieval search functions
- [ ] CLI can connect to local-agent

### team-monolith Profile

- [ ] Can start via host-local
- [ ] Health checks respond
- [ ] Full gateway surface works
- [ ] Auth/login functions
- [ ] Knowledge CRUD functions
- [ ] Candidate submission works
- [ ] Governance review works
- [ ] CLI can connect to team-monolith

### distributed Profile

- [ ] All 7 services can start independently
- [ ] Gateway is accessible externally
- [ ] Internal services are not externally accessible
- [ ] Gateway forwards to internal services
- [ ] Auth works through gateway
- [ ] Knowledge operations work through gateway
- [ ] Candidate operations work through gateway
- [ ] Governance operations work through gateway
- [ ] Job runtime operations work through gateway

## Critical Regression Tests

### Authentication & Session

- [ ] Login works
- [ ] Session token is generated
- [ ] Session token can be used for authenticated requests
- [ ] Logout works
- [ ] Session expiration is handled

### Knowledge Operations

- [ ] Knowledge entry can be created
- [ ] Knowledge entry can be read
- [ ] Knowledge entry can be updated
- [ ] Knowledge entry can be superseded
- [ ] Knowledge entry can be resubmitted
- [ ] Lifecycle transitions work correctly

### Candidate Operations

- [ ] Candidate can be submitted
- [ ] Candidate can be listed
- [ ] Candidate can be reviewed
- [ ] Candidate can be resolved
- [ ] Duplicate detection works

### Governance Operations

- [ ] Review queue is accessible
- [ ] Review decision can be submitted
- [ ] Conflict resolution works
- [ ] Remediation queue works

### Retrieval Operations

- [ ] Search works
- [ ] Search results are relevant
- [ ] Query tracing works
- [ ] Read-model projections work

## Database Ownership Validation

### Table Ownership

- [ ] Identity-access owns auth/session tables (writes only)
- [ ] Knowledge-write owns knowledge/trap/skill tables (writes only)
- [ ] Candidate-ingestion owns candidate tables (writes only)
- [ ] Governance-review owns governance tables (writes only)
- [ ] Job-runtime owns task/queue tables (writes only)
- [ ] Knowledge-read owns projection tables (reads only)
- [ ] No table has more than one owning service

### Transaction Boundaries

- [ ] Single-service transactions are atomic
- [ ] Cross-service flows use outbox pattern
- [ ] No cross-service database transactions
- [ ] Authoritative writes and outbox appends are in same transaction

## Cache & Performance Validation

### Cache Layering

- [ ] Process-local compute cache works
- [ ] Retrieval filter cache works
- [ ] Query result cache works
- [ ] Revision object cache works
- [ ] Invalidation events propagate correctly

### Bulk Ingestion

- [ ] Batch commits work
- [ ] Idempotency works
- [ ] Resume from offset works
- [ ] Backpressure control works

## Exit Conditions

### Migration Completion

- [x] CLI no longer depends on old http.ts implementation
- [x] CLI uses @trapmap/client-core through adapter
- [x] New hosts can replace packages/server
- [x] Core runtime semantics have one authoritative implementation
- [x] Internal config surface is documented
- [x] Database ownership is documented
- [x] Transaction boundaries are documented
- [x] Cache strategies are documented
- [x] Root `dev:local-agent` / `dev:team-monolith` / `dev:distributed:*` scripts now prefer the new hosts

### Validation Completion

- [x] All package-level validations pass
- [ ] All runtime form validations pass (pending manual testing)
- [ ] All critical regression tests pass (pending manual testing)
- [ ] All database ownership validations pass (pending manual testing)
- [ ] All cache validations pass (pending manual testing)

### Documentation Completion

- [x] Package READMEs are complete
- [x] Architecture docs are updated
- [x] Deployment guides are created
- [x] Environment variable reference is complete
- [x] Migration guide is created

## Notes

- Phase 1 validation focuses on package correctness and compilation
- Phase 2 validation (manual testing) should be done after deployment
- Phase 3 validation (performance testing) should be done under load
- `packages/server` still being present is not by itself a failure; the relevant question is whether the new hosts have become the preferred runtime entrypoints and whether parity/hardening work is complete.
