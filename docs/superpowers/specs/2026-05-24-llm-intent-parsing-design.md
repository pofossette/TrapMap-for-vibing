# LLM Intent Parsing Design

**Date**: 2026-05-24
**Status**: Draft
**Scope**: v2 retrieval pipeline intent parsing — replace regex-based `parseSeedIntent()` with LLM-powered extraction + deterministic fallback

## Motivation

The current `parseSeedIntent()` in `intent.ts` uses regex patterns to decompose a user's search seed into structured intent fields (situation, problem, goal, errorText). While deterministic and zero-cost, regex extraction has limitations:

- Misses paraphrased or non-standard phrasings
- Cannot generate optimized search queries (bridging "user language" vs "document terminology")
- Cannot classify intent into semantic categories

LLM extraction improves recall quality by understanding natural language semantics, while keeping the regex parser as a zero-cost fallback.

## Design

### Extended ParsedIntent Type

```typescript
// File: packages/server/src/lib/retrieval/types.ts

export type IntentCategory =
  | 'debugging'
  | 'configuration'
  | 'deployment'
  | 'performance'
  | 'integration'
  | 'security'
  | 'data'
  | 'testing'
  | 'general';

export interface ParsedIntent {
  // Existing fields (unchanged)
  seed: string;
  normalized: string;
  situation: string | null;
  problem: string | null;
  goal: string | null;
  errorText: string | null;
  tokens: NormalizedToken[];
  stackPathHints: StackPathHint[];

  // New fields
  category: IntentCategory | null;
  semanticQuery: string | null;

  // Metadata
  parseMethod: 'regex' | 'llm';
}
```

- `category`: intent classification for future strategy routing; does not affect scoring in this phase
- `semanticQuery`: LLM-optimized search query for the semantic recall channel
- `parseMethod`: observability marker for logging and evals; does not affect scoring

### Core Function

```typescript
// File: packages/server/src/lib/retrieval/capsules/intent.ts (new export)

export async function parseSeedIntentWithLLM(
  seed: string,
  chat: ChatProvider,
  options?: { cache?: IntentCacheStore }
): Promise<ParsedIntent>
```

Internal flow:

1. Compute `normalizedSeed = seed.toLowerCase().trim()`
2. Cache lookup: `options.cache?.get(normalizedSeed)` — return immediately if hit
3. Guard: if `!chat.isConfigured`, fall through to regex fallback
4. Build prompt: system prompt + seed as user message
5. `chat.invoke(systemPrompt, seed)` — retry with maxRetries=2 (3 total attempts), 100ms/400ms exponential backoff
6. Parse response: strip markdown fences, `JSON.parse()`, zod schema validation
7. Deterministic supplement: `normalizeToken()` for tokens, `extractStackPathHints()` for stackPathHints
8. Assemble full `ParsedIntent` with `parseMethod: 'llm'`
9. Cache store: `options.cache?.set(normalizedSeed, result)`
10. Any failure in steps 4-8: fall back to existing `parseSeedIntent(seed)`, then overlay new fields as `category: null`, `semanticQuery: null`, `parseMethod: 'regex'`. The overlay happens in `parseSeedIntentWithLLM()` — the original `parseSeedIntent()` is not modified.

### LLM Prompt

System prompt:

```
You are a query intent parser for an engineering knowledge base.
Analyze the user's search seed and extract structured intent.

Rules:
- Respond with ONLY valid JSON, no markdown fences, no explanation
- Extract: situation (context/when), problem (what's wrong),
  goal (what they want), errorText (error message if any)
- Extract: category — one of: debugging|configuration|deployment|
  performance|integration|security|data|testing|general
- Extract: semanticQuery — search-optimized reformulation using
  professional/technical terminology (max 200 chars)
- If a field cannot be determined, use null
```

User message: the raw seed string.

Expected JSON response schema:

```json
{
  "situation": "deploying to k8s",
  "problem": "fastify app crashes with connection refused",
  "goal": null,
  "errorText": "ECONNREFUSED",
  "category": "deployment",
  "semanticQuery": "fastify ECONNREFUSED kubernetes deployment networking"
}
```

### Response Parsing

Following the established codebase pattern (`contextual-enrichment.ts`, `llm-dedup.ts`):

1. Strip markdown fences: `.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')`
2. `JSON.parse()` in try/catch — returns null on failure
3. Zod schema validation:
   - `situation`: `z.string().nullable()`
   - `problem`: `z.string().nullable()`
   - `goal`: `z.string().nullable()`
   - `errorText`: `z.string().nullable()`
   - `category`: `z.enum([...IntentCategoryValues]).nullable()`
   - `semanticQuery`: `z.string().max(200).nullable()`
4. Return validated result or null

### IntentCache — Extensible Interface

```typescript
// File: packages/server/src/lib/retrieval/capsules/intent-cache.ts

export interface IntentCacheStore {
  get(key: string): ParsedIntent | null;
  set(key: string, intent: ParsedIntent): void;
  clear(): void;
}

export class InMemoryIntentCache implements IntentCacheStore {
  private store = new Map<string, { intent: ParsedIntent; createdAt: number }>();
  private maxSize: number;
  private ttlMs: number;

  constructor(options?: { maxSize?: number; ttlMs?: number }) {
    this.maxSize = options?.maxSize ?? 200;
    this.ttlMs = options?.ttlMs ?? 30 * 60_000; // 30 minutes
  }

  get(key: string): ParsedIntent | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.store.delete(key);
      return null;
    }
    return entry.intent;
  }

  set(key: string, intent: ParsedIntent): void {
    // Evict oldest entry if at capacity
    if (this.store.size >= this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }
    this.store.set(key, { intent, createdAt: Date.now() });
  }

  clear(): void {
    this.store.clear();
  }
}
```

- Interface `IntentCacheStore` enables future swap to Redis or other backends
- `InMemoryIntentCache` is the default implementation
- Only LLM results are cached (regex results are zero-cost)
- TTL: 30 minutes; max size: 200 entries
- Key: `seed.toLowerCase().trim()`

### Integration Points

#### A. v2 Orchestrator (`orchestrator.ts:355`)

```typescript
// Module-level cache instance
const intentCache = new InMemoryIntentCache();

// In searchKnowledgeV2():
const intent = await timedStep('intent', () =>
  parseSeedIntentWithLLM(parsed.seed, chat, { cache: intentCache }), steps);
```

`chat` is available from the orchestrator context (same provider used for contextual-enrichment).

#### B. Skill Lookup (`skill-lookup.ts:109`)

```typescript
// Before:
const intent = parseSeedIntent(parsed.text);

// After:
const intent = await parseSeedIntentWithLLM(parsed.text, chat, { cache: intentCache });
```

Requires injecting `chat: ChatProvider` and `cache?: IntentCacheStore` into the skill-lookup function signature. Check callers for availability.

#### C. Plan Compiler (`plan-compiler.ts:65`)

```typescript
// Before:
const intent = parseSeedIntent(query.seed);

// After:
const intent = await parseSeedIntentWithLLM(query.seed, chat, { cache: intentCache });
```

Same injection pattern as skill-lookup.

### Downstream Impact

**No changes to existing scoring functions.** The 7 scoring functions in `capsule-recall.ts` and `rerank.ts` read `situation/problem/goal/errorText/tokens/stackPathHints` — all present in both regex and LLM results with identical types.

**Semantic channel enhancement** (`channels/semantic.ts`):

```typescript
// Before:
const queryText = input.intent.seed || input.intent.normalized;

// After:
const queryText = input.intent.semanticQuery || input.intent.seed || input.intent.normalized;
```

**category**: passthrough only in this phase. Written to routing trace for observability and future strategy routing.

**Response assembly**: add `parseMethod` and `category` to routing trace output.

### Testing Strategy

| Area | Test | What it verifies |
|---|---|---|
| Unit | `intent.test.ts` — LLM happy path | mock ChatProvider returns valid JSON, fields are parsed correctly |
| Unit | `intent.test.ts` — JSON parse failure | strip fences + parse failure triggers retry, then regex fallback |
| Unit | `intent.test.ts` — zod validation failure | invalid category/missing required fields triggers retry |
| Unit | `intent.test.ts` — chat not configured | `isConfigured === false` goes directly to regex fallback |
| Unit | `intent-cache.test.ts` | cache hit, TTL expiry, max size eviction, clear |
| Integration | `orchestrator.test.ts` | update mock to include `category`/`semanticQuery`, verify passthrough |
| Eval | `evals/retrieval/` | compare retrieval quality with vs without `semanticQuery` |

### Files to Create/Modify

| File | Action |
|---|---|
| `packages/server/src/lib/retrieval/types.ts` | Add `IntentCategory` type, extend `ParsedIntent` |
| `packages/server/src/lib/retrieval/capsules/intent.ts` | Add `parseSeedIntentWithLLM()`, keep existing `parseSeedIntent()` unchanged |
| `packages/server/src/lib/retrieval/capsules/intent-cache.ts` | New file: `IntentCacheStore` interface + `InMemoryIntentCache` |
| `packages/server/src/lib/retrieval/orchestration/orchestrator.ts` | Update v2 intent step to use LLM parser |
| `packages/server/src/lib/retrieval/capsules/skill-lookup.ts` | Inject `chat`/`cache`, update intent call |
| `packages/server/src/lib/retrieval/graph-plan/plan-compiler.ts` | Inject `chat`/`cache`, update intent call |
| `packages/server/src/lib/retrieval/capsules/channels/semantic.ts` | Prefer `semanticQuery` over `seed` |
| `packages/server/src/lib/retrieval/capsules/intent.test.ts` | New/updated tests for LLM parsing |
| `packages/server/src/lib/retrieval/capsules/intent-cache.test.ts` | New tests for cache |

## Implementation Notes (2026-05-24)

Implementation completed per design spec with the following alignments:

- `parseSeedIntentWithLLM()` reuses `services.ai.chat` directly from existing `SkillShareerServices` in all three integration points (orchestrator, skill-lookup, plan-compiler) — no additional parameter injection needed
- Response parsing reuses `stripCodeFences()` from `packages/server/src/lib/ai/parse.ts` — same pattern as `llm-dedup.ts` and `boundary-extract.ts`
- `INTENT_CATEGORY_VALUES` constant array is used for both Zod schema and TypeScript union type to avoid duplication
- Retry backoff follows the established pattern from `llm-dedup.ts`: `100 * 2^(attempt * 2)` giving 100ms / 400ms for attempt 1/2
- Each integration point (orchestrator, skill-lookup, plan-compiler) uses its own module-level `InMemoryIntentCache` instance for process-local cache isolation
- `parseMethod` / `intentCategory` written to RAG log metadata only, not to HTTP response body — keeps external API contracts unchanged
- `semanticQuery` is used by `capsule-semantic` channel in both memory and PG paths with consistent fallback to `seed`
- No scoring or routing changes were introduced; `category` is passthrough for observability only
