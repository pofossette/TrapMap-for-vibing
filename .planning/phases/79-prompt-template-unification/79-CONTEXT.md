# Phase 79: Prompt Template Unification - Context

**Gathered:** 2026-05-04
**Status:** Ready for planning
**Mode:** Auto-generated (discuss skipped via workflow.skip_discuss)

<domain>
## Phase Boundary

Consolidate prompt templates across the codebase into a unified, maintainable system. Currently prompts are scattered inline in multiple files, making them hard to version, cache, and maintain.

### Current State

Three inline prompt templates identified:

1. **Claim Verification** (`evals/summary/lib/judge.ts:110`)
   - System prompt: "You are a claim verification assistant..."
   - Used for summary evaluation groundedness checks

2. **Boundary Extraction** (`packages/server/src/lib/boundary-extract.ts:31`)
   - System prompt: "You are a boundary extraction assistant..."
   - Used for extracting applicability constraints from knowledge

3. **Knowledge Refinement** (`packages/server/src/lib/retrieval/orchestrator.ts:931`)
   - System prompt: "You are a knowledge refinement assistant..."
   - Used for condensing retrieval results into summaries

### Goal

Create a centralized prompt template system that:
- Extracts all inline prompts to a single location
- Provides versioned, cacheable templates
- Maintains backward compatibility with existing code
- Enables future prompt optimization and A/B testing

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Key Considerations
- LangChain JS already provides prompt template utilities via `@langchain/core/prompts`
- Prompts should remain type-safe and testable
- Consider future needs: caching, versioning, A/B testing support

</decisions>

<code_context>
## Existing Code Insights

### AI Provider Interface
- `ChatProvider.invoke(systemPrompt: string, userMessage: string)` - current interface
- Located in `packages/server/src/lib/ai/types.ts`

### Prompt Locations
- `evals/summary/lib/judge.ts` - claim verification prompt
- `packages/server/src/lib/boundary-extract.ts` - boundary extraction prompt
- `packages/server/src/lib/retrieval/orchestrator.ts` - refinement prompt

### LangChain Integration
- Project uses `@langchain/openai` for AI providers
- Could leverage `@langchain/core/prompts` for template management

</code_context>

<specifics>
## Specific Ideas

No specific requirements — discuss phase skipped. Refer to ROADMAP phase description and success criteria.

</specifics>

<deferred>
## Deferred Ideas

None — discuss phase skipped.
