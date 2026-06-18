# Runtime Recomposition Migration Guide

## Status

- Status: `active`
- Created: 2026-06-18
- Purpose: Guide for migrating from old architecture to new runtime recomposition

## Overview

The runtime recomposition transitions TrapMap from a monolithic "CLI + Server" architecture to a modular "Shared Client Core + Backend Core Kernel + Hosts" assembly architecture.

### Old Architecture

```
packages/
├── cli/           (HTTP transport + CLI logic)
├── server/        (Fastify + business logic + persistence)
├── contracts/     (shared types)
└── skills/        (skill artifacts)
```

### New Architecture

```
packages/
├── client-core/         (shared HTTP gateway access layer)
├── backend-core/        (host-agnostic backend kernel)
├── host-local/          (light host for local-agent/team-monolith)
├── host-distributed/    (heavy host for distributed profile)
├── cli/                 (CLI logic only, uses client-core)
├── server/              (deprecated, being replaced)
├── contracts/           (shared types)
└── skills/              (skill artifacts)
```

## Migration Path

### Phase 1: Client Core Migration (DONE)

**What changed:**
- Created `@trapmap/client-core` package
- Extracted HTTP transport from CLI to client-core
- CLI now uses client-core through adapter

**How to migrate:**
- No action needed for CLI users
- CLI commands work exactly as before
- Future web panel can now use client-core

**Verification:**
```bash
# Verify client-core works
cd packages/client-core
pnpm test

# Verify CLI still works
cd packages/cli
pnpm test
```

### Phase 2: Backend Core Migration (DONE)

**What changed:**
- Created `@trapmap/backend-core` package
- Extracted runtime capability model, ports, use-cases, modules
- Defined service ownership and invocation contracts

**How to migrate:**
- Server can now import from backend-core
- Use backend-core ports instead of direct infrastructure access
- Use backend-core modules for business logic

**Verification:**
```bash
# Verify backend-core works
cd packages/backend-core
pnpm test

# Verify server can use backend-core
cd packages/server
# Add @trapmap/backend-core to dependencies
# Import and use backend-core ports
```

### Phase 3: Light Host Migration (DONE)

**What changed:**
- Created `@trapmap/host-local` package
- Provides unified host for local-agent and team-monolith profiles
- Replaces packages/server for local development

**How to migrate:**

#### For local-agent profile:

```bash
# Old way (using packages/server)
cd packages/server
pnpm dev

# New way (using packages/host-local)
cd packages/host-local
TRAPMAP_DEPLOYMENT_PROFILE=local-agent pnpm dev
```

#### For team-monolith profile:

```bash
# Old way (using packages/server)
cd packages/server
pnpm dev

# New way (using packages/host-local)
cd packages/host-local
TRAPMAP_DEPLOYMENT_PROFILE=team-monolith pnpm dev
```

**Verification:**
```bash
# Verify host-local works
cd packages/host-local
pnpm dev

# Test health check
curl http://localhost:3000/health
```

### Phase 4: Heavy Host Migration (DONE)

**What changed:**
- Created `@trapmap/host-distributed` package
- Provides 7 independent microservices
- Enables horizontal scaling and service isolation

**How to migrate:**

#### Start all services:

```bash
cd packages/host-distributed
pnpm dev
```

#### Start individual services:

```bash
cd packages/host-distributed

# Start gateway only
node dist/index.js --service gateway

# Start identity-access only
node dist/index.js --service identity-access

# Start knowledge-read only
node dist/index.js --service knowledge-read

# Start knowledge-write only
node dist/index.js --service knowledge-write

# Start candidate-ingestion only
node dist/index.js --service candidate-ingestion

# Start governance-review only
node dist/index.js --service governance-review

# Start job-runtime only
node dist/index.js --service job-runtime
```

**Verification:**
```bash
# Verify all services start
cd packages/host-distributed
pnpm dev

# Test gateway health
curl http://localhost:3000/health

# Test internal service health
curl http://localhost:3001/health  # identity-access
curl http://localhost:3002/health  # knowledge-read
curl http://localhost:3003/health  # knowledge-write
curl http://localhost:3004/health  # candidate-ingestion
curl http://localhost:3005/health  # governance-review
curl http://localhost:3006/health  # job-runtime
```

## Development Scripts

### Root Package Scripts

```bash
# Run local-agent profile
pnpm dev:host-local:local-agent

# Run team-monolith profile
pnpm dev:host-local:team-monolith

# Run distributed profile (all services)
pnpm dev:host-distributed
```

### Package-Specific Scripts

```bash
# Client-core
cd packages/client-core
pnpm test
pnpm typecheck

# Backend-core
cd packages/backend-core
pnpm test
pnpm typecheck

# Host-local
cd packages/host-local
pnpm dev
pnpm build

# Host-distributed
cd packages/host-distributed
pnpm dev
pnpm build
```

## Environment Variables

### Client-core

None required. Configuration is injected via SessionProvider interface.

### Backend-core

None required. Configuration is injected via ports and module dependencies.

### Host-local

```bash
# Deployment profile (required)
TRAPMAP_DEPLOYMENT_PROFILE=local-agent|team-monolith

# Server configuration
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# Database
DATABASE_URL=postgresql://...

# Runtime mode
RUNTIME_MODE=monolith
TRAPMAP_SERVICE_UNIT=all-in-one
```

### Host-distributed

```bash
# Service name (required for individual service start)
--service gateway|identity-access|knowledge-read|knowledge-write|candidate-ingestion|governance-review|job-runtime

# Service-specific ports
TRAPMAP_GATEWAY_PORT=3000
TRAPMAP_IDENTITY_ACCESS_PORT=3001
TRAPMAP_KNOWLEDGE_READ_PORT=3002
TRAPMAP_KNOWLEDGE_WRITE_PORT=3003
TRAPMAP_CANDIDATE_INGESTION_PORT=3004
TRAPMAP_GOVERNANCE_REVIEW_PORT=3005
TRAPMAP_JOB_RUNTIME_PORT=3006

# Database (shared or per-service)
DATABASE_URL=postgresql://...
# OR per-service
TRAPMAP_IDENTITY_ACCESS_DATABASE_URL=postgresql://...
TRAPMAP_KNOWLEDGE_READ_DATABASE_URL=postgresql://...
# etc.

# Internal service URLs
TRAPMAP_IDENTITY_ACCESS_URL=http://localhost:3001
TRAPMAP_KNOWLEDGE_READ_URL=http://localhost:3002
# etc.
```

## Troubleshooting

### Issue: "Cannot find module '@trapmap/client-core'"

**Solution:** Ensure client-core is built and linked.

```bash
cd packages/client-core
pnpm build
cd ../..
pnpm install
```

### Issue: "Cannot find module '@trapmap/backend-core'"

**Solution:** Ensure backend-core is built and linked.

```bash
cd packages/backend-core
pnpm build
cd ../..
pnpm install
```

### Issue: "Database connection refused"

**Solution:** Ensure PostgreSQL is running and DATABASE_URL is correct.

```bash
# Check database connection
psql $DATABASE_URL

# Verify environment variable
echo $DATABASE_URL
```

### Issue: "Port already in use"

**Solution:** Kill existing process or change port.

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port
PORT=3001 pnpm dev
```

### Issue: "Service won't start"

**Solution:** Check logs for specific error.

```bash
# Run with verbose logging
LOG_LEVEL=debug pnpm dev

# Check service health
curl http://localhost:3000/health
curl http://localhost:3000/ready
```

## Rollback Plan

If issues arise, you can rollback to the old architecture:

### Rollback Steps

1. Stop all new hosts
2. Start old packages/server
3. Revert CLI changes (if any)
4. Report issues

### Rollback Commands

```bash
# Stop new hosts
pkill -f host-local
pkill -f host-distributed

# Start old server
cd packages/server
pnpm dev
```

## Support

For issues or questions:
- Check this migration guide
- Review package READMEs
- Check architecture documentation in docs/architecture/
- Review validation matrix in docs/operations/VALIDATION_MATRIX.md
