# @trapmap/lib

Shared pure-function utility layer. It consolidates duplicated helper implementations that previously lived in several packages (`nowIso`, `timestamp`, `formatDate`, `timeout`, `truncate`, `uniq`, `uniqBy`, `chunk`, `sha256`). The migration inventory is tracked in [`docs/archived/reports/TECH_DEBT_UTILS_TYPES_2026-08-08.md`](../../docs/archived/reports/TECH_DEBT_UTILS_TYPES_2026-08-08.md).

## Installation

```bash
pnpm add @trapmap/lib
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@trapmap/contracts` | Shared domain types (`Sha256Hex`) |

## Modules

All functions are re-exported from the package entry point (`src/index.ts`).

| Module | Exports | Description |
|--------|---------|-------------|
| `time` | `nowIso`, `timestamp`, `formatDate` | ISO timestamp generation/normalization and daily log file naming |
| `async` | `timeout` | Promise race-with-timeout guard (timer cleared on settle) |
| `string` | `truncate` | Max-length truncation with ellipsis counted toward the limit |
| `array` | `uniq`, `uniqBy`, `chunk` | Identity/key-based deduplication and fixed-size chunking |
| `hash` | `sha256` | Lowercase hex SHA-256 digest typed as `Sha256Hex` |

## Usage

```typescript
import { nowIso, timeout, truncate, uniqBy, sha256 } from '@trapmap/lib';

const createdAt = nowIso();
const result = await timeout(fetch(url), 5_000);
const label = truncate(description, 120);
const tags = uniqBy(rawTags, (t) => t.name.toLowerCase());
const digest = sha256(content);
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm test` | Run the package unit tests (Vitest `lib` project) |
| `pnpm typecheck` | Type-check without emitting |

## Constraints

- **Leaf package**: `@trapmap/lib` must not depend on any service/host/framework code; `@trapmap/contracts` must not depend back on it.
- **Single source of truth**: packages must import shared utilities from `@trapmap/lib` instead of re-implementing them locally (see `AGENTS.md`).
- Deliberately NOT unified here (semantics documented in source comments): the `AbortController`-based timeout in `host-distributed` gateway, the poll-interval wait in `service-candidate-ingestion`, and `truncateForPrompt` in `service-knowledge-write`.
- Generic third-party dependencies (e.g. lodash, if ever needed) must be declared here and re-exported, never scattered across packages.
