# @trapmap/backend-core

Backend core kernel for TrapMap. This package provides host-agnostic application logic, port interfaces, and the runtime capability model.

## Purpose

`backend-core` is the foundation that both light-host (`local-agent`, `team-monolith`) and heavy-host (`distributed`) assemblies share. It contains:

- **Runtime capability model** -- deployment profiles, runtime modes, service units, topology
- **Port interfaces** -- abstract contracts for repositories, queues, retrieval, auth, audit
- **Use-case patterns** -- command handling, review flows, retrieval orchestration, job scheduling
- **Bounded-context modules** -- identity-access, knowledge-read/write, candidate-ingestion, review, job-runtime
- **Invocation model** -- transport-agnostic sync/async contracts with error taxonomy
- **Testing utilities** -- stub implementations of all ports for unit testing

## What this package does NOT contain

- No Fastify or HTTP framework dependencies
- No process startup or server bootstrap
- No concrete infrastructure implementations (PostgreSQL, RabbitMQ, Neo4j)
- No config loading or environment variable parsing

## Structure

```
src/
  index.ts              Main barrel export
  runtime/
    capability-model.ts DeploymentProfile, RuntimeMode, ServiceUnit, capabilities, resolution
    route-surface.ts    Route families, unsupported routes, surface summary
    topology.ts         Service topology descriptors and snapshots
  ports/
    repo-ports.ts       Repository port interfaces (knowledge, candidate, auth, team, etc.)
    queue-ports.ts      Task queue and outbox port interfaces
    retrieval-ports.ts  Retrieval query and read-model ports
    actor-ports.ts      Session lookup, team lookup, permission check ports
    audit-ports.ts      Audit log and metrics ports
    internal-ports.ts   Internal service invocation ports (identity, knowledge, candidates, etc.)
  use-cases/
    command-handling.ts  Command pattern with result type
    review-flows.ts     Review decision and queue orchestration
    retrieval-orchestration.ts  Retrieval search orchestration
    job-scheduling.ts   Async job scheduling patterns
  invocation/
    invocation-model.ts  Sync/async invocation contracts and error taxonomy
    invocation-config.ts Internal service routing configuration
  testing/
    test-utils.ts       Stub implementations of all ports
```

## Usage

### Import everything from the main entry:

```typescript
import {
  resolveRuntimeDeployment,
  type ResolvedRuntimeDeployment,
  type KnowledgeRepositoryPort,
  createStubRepositoryPorts,
} from '@trapmap/backend-core';
```

### Import from subpaths:

```typescript
import { resolveRuntimeDeployment } from '@trapmap/backend-core/runtime';
import type { KnowledgeRepositoryPort } from '@trapmap/backend-core/ports';
import type { Command } from '@trapmap/backend-core/use-cases';
import { createKnowledgeWriteModule } from '@trapmap/backend-core';
import { InvocationError } from '@trapmap/backend-core/invocation';
import { createStubRepositoryPorts } from '@trapmap/backend-core/testing';
```

### Resolve deployment configuration:

```typescript
const deployment = resolveRuntimeDeployment({
  profile: 'team-monolith',
  preset: 'monolith',
});
// deployment.capabilities.supportsReviewGovernance === true
// deployment.capabilities.routeSurface === 'gateway-core'
```

### Wire a module with stubs for testing:

```typescript
import { createStubAuditLog, createStubKnowledgeRepository } from '@trapmap/backend-core/testing';
import { createKnowledgeWriteModule } from '@trapmap/backend-core';

const module = createKnowledgeWriteModule({
  knowledgeRepo: createStubKnowledgeRepository(),
  auditLog: createStubAuditLog(),
});

const { entryId } = await module.submit({
  content: 'test content',
  actorId: 'user-1',
});
```
