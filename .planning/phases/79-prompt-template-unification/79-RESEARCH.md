# Phase 79 Research: Prompt Template Unification

**Gathered:** 2026-05-05
**Status:** Complete

## Executive Summary

Phase 79 aims to consolidate 3 inline LLM prompts into a centralized module. The existing plan (79-01-PLAN.md) provides a solid foundation but has gaps in testing, cross-package imports, and the actual value of LangChain templates.

---

## Technical Approach Options

### Option A: Pure String Templates (Recommended for Phase 79)

**What:** Skip LangChain `ChatPromptTemplate` and use simple string-based templates with format functions.

**Why:**
1. `ChatProvider.invoke()` requires string arguments, not LangChain message objects
2. The current plan imports `ChatPromptTemplate` but then extracts strings anyway (redundant)
3. LangChain templates add ~5KB bundle overhead for no benefit in this use case
4. Simpler to test and maintain

**Implementation:**
```typescript
// templates.ts
export const CLAIM_VERIFICATION_SYSTEM = `You are a claim verification assistant...`;

export function formatClaimVerificationPrompt(input: ClaimVerificationInput): FormattedPrompt {
  return [CLAIM_VERIFICATION_SYSTEM, formatUserMessage(input)];
}
```

### Option B: LangChain Templates (Current Plan)

**What:** Use `ChatPromptTemplate.fromMessages()` as shown in the existing plan.

**Pros:**
- Type-safe variable interpolation
- Future compatibility with LangChain chains

**Cons:**
- Extra import overhead
- Strings still need extraction for `ChatProvider.invoke()` compatibility
- No actual use of LangChain's template features (partial, compose)

### Option C: Zod-Schema Templates

**What:** Use Zod schemas to validate prompt inputs with `z.infer` types.

**Pros:**
- Runtime validation of prompt inputs
- Consistent with project's Zod-heavy architecture (contracts package)
- Self-documenting prompt schemas

**Cons:**
- More boilerplate
- Validation overhead at runtime

**Recommendation:** Option A for Phase 79. Consider Option C for future phases if prompt validation becomes valuable.

---

## Codebase Patterns

### Current Prompt Locations

| File | Line | Template ID | Usage |
|------|------|-------------|-------|
| `evals/summary/lib/judge.ts` | 110-122 | claim-verification | Summary evaluation |
| `packages/server/src/lib/boundary-extract.ts` | 31-61 | boundary-extraction | Knowledge submission |
| `packages/server/src/lib/retrieval/orchestrator.ts` | 931 | knowledge-refinement | Retrieval summary |

### ChatProvider Interface

```typescript
// packages/server/src/lib/ai/types.ts
interface ChatProvider {
  readonly provider: string;
  readonly isConfigured: boolean;
  invoke(systemPrompt: string, userMessage: string): Promise<string>;
}
```

**Key constraint:** All prompt templates must produce `[systemPrompt, userMessage]` tuples to maintain backward compatibility.

### Testing Patterns

From `boundary-extract.test.ts`:
```typescript
function mockChat(response: string | null, configured = true): ChatProvider {
  return {
    provider: 'mock',
    isConfigured: configured,
    invoke: vi.fn().mockImplementation(async () => response),
  };
}

// Test verifies prompt content via mock call arguments
expect(userMessage).toContain('React hooks pitfall');
```

**Gap:** No unit tests for prompt format functions in current plan.

---

## Dependencies

### Already Installed

```json
{
  "@langchain/core": "^1.1.39",
  "@langchain/openai": "^1.4.4"
}
```

### No New Dependencies Required

The existing dependencies are sufficient. No need to add prompt-specific packages.

---

## Cross-Package Considerations

### evals → server Import

The current plan uses:
```typescript
// evals/summary/lib/judge.ts
import { formatClaimVerificationPrompt } from '../../../packages/server/src/lib/ai/prompts/index.js';
```

**Issue:** This creates a relative import from `evals` into `packages/server/src`. This works but is non-ideal.

**Alternative Options:**

1. **Keep as-is:** Accept the relative import (simplest, works for monorepo)
2. **Move prompts to contracts:** Prompts could live in `packages/contracts` (but this mixes types with templates)
3. **Create shared evals dependency:** Extract prompts to a shared location

**Recommendation:** Keep as-is for Phase 79. Consider a dedicated `packages/prompts` package if prompts grow significantly.

---

## Gaps in Existing Plan

### 1. No Tests for Prompt Module

The plan creates `prompts/templates.ts` but has no corresponding `prompts/templates.test.ts`.

**Required tests:**
- Each format function produces correct `[system, user]` tuple
- Metadata returns correct values
- Input validation (optional, depends on chosen approach)

### 2. LangChain Templates Not Utilized

The plan imports `ChatPromptTemplate` but immediately extracts strings:
```typescript
const CLAIM_VERIFICATION_TEMPLATE = ChatPromptTemplate.fromMessages([...]);

export function formatClaimVerificationPrompt(...) {
  // Then ignores the template and builds strings manually
  const systemPrompt = `You are a claim verification assistant...`;
}
```

This is redundant. Either use the template or remove it.

### 3. Caching Not Addressed

The CONTEXT.md mentions "cacheable templates" but the plan has no caching mechanism.

**Future consideration:** Prompt content hashing for cache keys:
```typescript
function getPromptCacheKey(id: PromptTemplateId, input: unknown): string {
  return `${id}:${PROMPT_METADATA[id].version}:${hashInput(input)}`;
}
```

This can be deferred to a future phase.

### 4. Versioning Metadata Unused

The plan adds `version` and `lastModified` to metadata but no code uses it.

**Future consideration:** Log prompt version with LLM calls for debugging.

---

## Additional Prompts (Future Phases)

The `docs/architecture/components/ARTIFACTS.md` documents two additional prompts for skill processing:

1. **Skill Profile Derivation** (lines 236-243)
   - "You are a skilled technical writer..."
   - Used for artifact summarization

2. **Capsule Extraction** (lines 282-290)
   - "You are a technical documentation expert..."
   - Used for knowledge capsule generation

These are documented but may not be implemented yet. Consider consolidating in a future phase.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing LLM behavior | Low | Medium | Prompts are extracted verbatim, no content changes |
| Cross-package import issues | Low | Low | Works in monorepo, acceptable technical debt |
| Unused LangChain templates | Medium | Low | Recommend removing from plan |
| Missing test coverage | High | Medium | Add prompt module tests |

---

## Implementation Notes

### Recommended Plan Adjustments

1. **Remove ChatPromptTemplate:** Use pure string templates
2. **Add tests:** Create `prompts/templates.test.ts`
3. **Add buildRefinementPrompt to module:** The helper function at orchestrator.ts:886 could be consolidated with the refinement template

### File Structure (Revised)

```
packages/server/src/lib/ai/prompts/
├── index.ts          # Public exports
├── types.ts          # PromptTemplateId, PromptMetadata, FormattedPrompt
├── templates.ts      # Template constants and format functions
└── templates.test.ts # Unit tests for format functions
```

### Verification Commands

```bash
# TypeScript compilation
pnpm --filter @trapmap/server typecheck

# Server tests
pnpm --filter @trapmap/server test

# Evals tests (for judge migration)
pnpm --filter @trapmap/evals test

# Verify no inline prompts remain
grep -rn "You are a.*assistant" packages/server/src evals/summary/lib --include="*.ts"
```

---

## Success Criteria (from ROADMAP)

- [ ] All prompts extracted to centralized location
- [ ] Type-safe format functions for each template
- [ ] Versioning metadata for each template
- [ ] Backward compatibility with ChatProvider.invoke()
- [ ] All existing tests pass after migration
- [ ] New tests for prompt module

---

## Conclusion

The existing plan is 80% complete. Key adjustments needed:

1. Simplify by removing LangChain templates (use pure strings)
2. Add unit tests for the prompt module
3. Accept cross-package import pattern for now

Phase 79 is ready for execution with these minor plan updates.
