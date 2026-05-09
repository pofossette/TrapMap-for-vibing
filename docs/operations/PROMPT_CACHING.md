# Prompt Caching Guide

The prompt caching system decomposes system prompts into **static** (cacheable) and **dynamic** (per-request) sections, enabling provider-level prompt caching to reduce cost and latency.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    CacheSection[]                             │
│                                                              │
│  ┌─────────────────────────────────┐  cacheScope: 'global'   │
│  │ role, core_principles,          │  (static — cacheable)   │
│  │ security, tool_usage_rules      │                         │
│  └─────────────────────────────────┘                         │
│  ┌─────────────────────────────────┐                         │
│  │ __CACHE_BOUNDARY__              │  (sentinel marker)      │
│  └─────────────────────────────────┘                         │
│  ┌─────────────────────────────────┐  cacheScope: null       │
│  │ code_context, current_env,      │  (dynamic — per-request)│
│  │ examples, metadata              │                         │
│  └─────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│                    PromptBlock[]                              │
│                                                              │
│  ┌─────────────────────────────────┐  cache_control:         │
│  │ (static sections concatenated)  │  { type: 'ephemeral',   │
│  │                                 │    scope: 'global' }    │
│  └─────────────────────────────────┘                         │
│  ┌─────────────────────────────────┐  (no cache_control)     │
│  │ dynamic section 1               │                         │
│  └─────────────────────────────────┘                         │
│  ┌─────────────────────────────────┐  (no cache_control)     │
│  │ dynamic section 2               │                         │
│  └─────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────┘
```

The pipeline:
1. `buildPromptWithCacheControl()` produces `CacheSection[]` with static/dynamic classification
2. A `__CACHE_BOUNDARY__` sentinel is inserted between the two groups
3. `buildSystemPromptBlocks()` converts sections into API-compatible `PromptBlock[]` with `cache_control` headers

## Core Types

### `CacheSection`

```typescript
interface CacheSection {
  readonly name: string;       // Section identifier (e.g. "role", "core_principles")
  readonly content: string;    // Rendered content
  readonly cacheScope: 'global' | 'org' | null;
  // 'global' = system-wide caching, 'org' = org-level, null = do not cache
}
```

### `CacheControlHeader` and `PromptBlock`

```typescript
interface CacheControlHeader {
  type: 'ephemeral';
  scope: 'global' | 'organization';
}

interface PromptBlock {
  content: string;
  cache_control?: CacheControlHeader;  // Present only for static sections
}
```

## Provider Cache Strategies

Each provider defines which sections are static (cacheable) and which are dynamic (per-request):

| Provider    | Static Sections                                          | Dynamic Sections                             |
|-------------|----------------------------------------------------------|----------------------------------------------|
| `anthropic` | `role`, `core_principles`, `security`, `tool_usage_rules` | `code_context`, `current_environment`, `examples` |
| `openai`    | `role`, `task`, `constraints`                            | `code_context`, `current_environment`        |
| `deepseek`  | `role`, `core_principles`, `constraints`                 | `code_context`, `current_environment`, `examples` |
| `kimi`      | `role`, `task`, `constraints`                            | `code_context`, `current_environment`        |
| `gemini`    | `role`, `core_principles`, `constraints`                 | `code_context`, `current_environment`, `examples` |
| `default`   | `role`, `core_principles`, `constraints`                 | `code_context`, `current_environment`, `examples` |

## API Reference

### `buildPromptWithCacheControl(taskType, slots, modelId?): CacheSection[]`

Build a prompt decomposed into cache-classified sections. A `__CACHE_BOUNDARY__` marker section is automatically inserted between the last static section and the first dynamic section.

```typescript
import { buildPromptWithCacheControl } from './lib/ai/prompts.js';

const sections = buildPromptWithCacheControl(
  'boundary-extraction',
  mySlots,
  'claude-opus-4-6',
);

// sections[0..n]  — static sections with cacheScope: 'global'
// sections[n+1]   — __boundary__ marker with cacheScope: null
// sections[n+2..] — dynamic sections with cacheScope: null
```

### `splitPromptByBoundary(sections): BoundarySplit`

Split a `CacheSection[]` array into static prefix and dynamic suffix based on the `__CACHE_BOUNDARY__` sentinel. Used internally by `buildSystemPromptBlocks()` and available for custom cache strategies.

```typescript
import { splitPromptByBoundary } from './lib/ai/cache/index.js';

const { staticPrefix, dynamicSuffix } = splitPromptByBoundary(sections);
// staticPrefix: sections before the boundary marker (all cacheScope: 'global')
// dynamicSuffix: sections after the boundary marker (cacheScope: null)
```

If no boundary marker is found, `staticPrefix` is empty and `dynamicSuffix` contains all sections.

### `buildSystemPromptBlocks(sections): PromptBlock[]`

Convert `CacheSection[]` into API-compatible blocks with `cache_control` headers. Static sections are concatenated into a single block with an `ephemeral` / `global` cache control header. Each dynamic section becomes its own block without caching.

```typescript
import { buildSystemPromptBlocks } from './lib/ai/cache/index.js';

const blocks = buildSystemPromptBlocks(sections);
// blocks[0] = { content: "static content...", cache_control: { type: 'ephemeral', scope: 'global' } }
// blocks[1] = { content: "dynamic content 1..." }
// blocks[2] = { content: "dynamic content 2..." }
```

### `buildCacheControlForSection(section): CacheControlHeader | null`

Build a `CacheControlHeader` for a single section. Returns `null` when `cacheScope` is `null` (dynamic sections).

```typescript
import { buildCacheControlForSection } from './lib/ai/cache/index.js';

const header = buildCacheControlForSection(sections[0]);
// { type: 'ephemeral', scope: 'global' }

const header = buildCacheControlForSection(dynamicSection);
// null
```

## Section-Level LRU Cache

An in-memory LRU cache stores rendered section content to avoid recomputation.

### Cache Configuration

| Parameter | Default   | Description                     |
|-----------|-----------|---------------------------------|
| `max`     | `1000`    | Maximum number of cache entries |
| `ttlMs`   | `3600000` | TTL in milliseconds (1 hour)   |

### Cache API

```typescript
import {
  getCachedSection,    // Get or compute a cached section
  invalidateSection,   // Remove a specific section from cache
  clearAllSections,    // Clear the entire cache
  getSectionCacheSize, // Get current entry count
  resetSectionCache,   // Reset cache with new options (for testing)
  computeHash,         // SHA-256 hash of content
} from './lib/ai/cache/index.js';

// Retrieve from cache, or compute and cache
const content = getCachedSection('role', () => renderRoleSection());

// Invalidate when template changes
invalidateSection('role');

// Check cache utilization
const size = getSectionCacheSize();
```

When a cached entry expires (TTL), the cache records a miss with reason `ttl_expired`. When content is newly computed, a miss with reason `content_changed` is recorded.

## Cache Metrics

Metrics track cache effectiveness for monitoring and tuning.

### Metrics Interface

```typescript
interface CacheMetrics {
  hitRate: number;        // Cache hits / total requests (0 to 1)
  totalRequests: number;  // Total cache lookups
  cacheHits: number;      // Number of cache hits
  cacheMisses: number;    // Number of cache misses
  breakReasons: {
    contentChanged: number; // Misses due to new content
    modelChanged: number;   // Misses due to model switch
    ttlExpired: number;     // Misses due to TTL expiration
  };
}
```

### Metrics API

```typescript
import {
  getCacheMetrics,    // Get current metrics snapshot
  resetCacheMetrics,  // Reset all metrics (for testing)
  trackCacheHit,      // Manually record a hit (normally handled by getCachedSection)
  trackCacheMiss,     // Manually record a miss with reason
} from './lib/ai/cache/index.js';

const metrics = getCacheMetrics();
console.log(`Cache hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
console.log(`TTL expired misses: ${metrics.breakReasons.ttlExpired}`);
```

## End-to-End Example

```typescript
import {
  buildPromptWithCacheControl,
  buildSystemPromptBlocks,
  getCacheMetrics,
} from './lib/ai/index.js';

// 1. Build cache-aware prompt
const sections = buildPromptWithCacheControl(
  'boundary-extraction',
  {
    role: 'a boundary extraction assistant',
    task: 'Extract boundary constraints from the input.',
    constraints: ['Return valid JSON.'],
  },
  'claude-opus-4-6',
);

// 2. Convert to API blocks with cache control headers
const blocks = buildSystemPromptBlocks(sections);

// 3. Send to API (example with Anthropic Messages API)
const response = await anthropic.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 4096,
  system: blocks.map((b) => ({
    type: 'text' as const,
    text: b.content,
    ...(b.cache_control ? { cache_control: b.cache_control } : {}),
  })),
  messages: [{ role: 'user', content: userInput }],
});

// 4. Monitor cache performance
const metrics = getCacheMetrics();
console.log(`Hit rate: ${(metrics.hitRate * 100).toFixed(1)}%`);
```

## Boundary Marker

The `__CACHE_BOUNDARY__` sentinel is a plain string constant inserted as its own `CacheSection` between static and dynamic content:

```typescript
import { CACHE_BOUNDARY_MARKER } from './lib/ai/cache/index.js';
// CACHE_BOUNDARY_MARKER === '__CACHE_BOUNDARY__'
```

The marker is used by `splitPromptByBoundary()` to find the split point. It is **not** included in either the static prefix or the dynamic suffix — it is consumed during splitting.

## Best Practices

1. **Cache the static prefix**: Static sections rarely change between requests. Group them into a single cached block via `buildSystemPromptBlocks()`.

2. **Keep dynamic sections lean**: Dynamic sections (examples, context, metadata) are re-sent on every request. Minimize their size to reduce cost.

3. **Monitor hit rate**: Use `getCacheMetrics()` to verify caching is effective. A hit rate below 50% may indicate that too much content is classified as static and is changing frequently.

4. **Invalidate on template updates**: When modifying template files or override files, call `clearAllSections()` to prevent stale cached content.
