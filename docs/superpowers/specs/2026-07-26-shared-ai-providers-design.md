# Shared AI Providers Design

## Purpose

Retire the Wave-8 host-local AI-provider dependency on `@trapmap/server` by
moving the complete AI provider implementation and environment configuration
into a dedicated shared workspace package. Server-owned prompt construction,
prompt caching, parsing, and dynamic prompt injection remain in the server
compatibility package.

## Package Boundary

Create `packages/ai-providers` with package name `@trapmap/ai-providers`.
It owns:

- `AiProviderType` and `AiProviderConfig`, including environment loading and
  provider default resolution.
- `EmbeddingsProvider`, `ChatProvider`, `AiProviders`, and the structural
  `AiPromptBlock` contract used by optional block-based chat invocation.
- Fallback, OpenAI-compatible, and Google GenAI embedding implementations.
- OpenAI-compatible and fallback chat implementations plus
  `createAiProviders()`.

The package may depend on `@langchain/core` and `@langchain/openai`. It must
not depend on `@trapmap/server`, any host package, a service package, prompt
templates, or server prompt/cache modules.

## Server Ownership

`packages/server/src/lib/ai` retains server-specific prompt behavior:

- Prompt templates and provider-template selection.
- Prompt section cache and its `PromptBlock` implementation.
- Prompt parsing, dynamic injection, and all prompt builder helpers.

The server can consume provider contracts from `@trapmap/ai-providers`. Its
`PromptBlock` remains structurally assignable to `AiPromptBlock`; no prompt
implementation moves to the shared provider package.

## Consumer Migration

Replace provider/config imports in host-local, server composition, label
runner, graph extraction evals, and type-only consumers with
`@trapmap/ai-providers`. The server AI barrel ceases to be a provider entry
point and exposes only server-owned prompt/cache/parse facilities.

This removes provider/config imports from
`packages/host-local/src/nest/runtime/shared-infra.ts`. The graph-query
dependency keeps its separate `@trapmap/server` import until its own Wave-8
owner migration; this change must not be represented as removing the complete
file-level server dependency.

## Behavior And Errors

Provider selection, environment variable precedence, fallback behavior,
Google GenAI response validation, OpenAI-compatible lazy initialization,
provider timeout, and separate embedding-provider behavior remain unchanged.
The migration must not introduce a new provider fallback or swallow provider
errors. Missing provider configuration continues to select deterministic
embeddings and the explicit failing fallback chat provider.

## Validation

Before production edits, extend the compatibility-retirement guard so the
host-local shared infrastructure may no longer import `@trapmap/server`; the
guard must fail against the current source. Migrate the provider implementation
and consumers until it passes.

Verify the shared package provider/config tests, server and host-local focused
tests, retirement guard, root typecheck, documentation/structure checks, and
the Docker-coordinated runtime/deployment acceptance relevant to the changed
composition. Run the retrieval smoke evaluation because retrieval consumes
the shared provider seam.

## Scope Limits

This design does not move server prompt helpers, graph-query implementation,
legacy store state, or any server package deletion work. It does not mark
Wave-8, Wave-9, or Wave-10 complete; it removes one explicit Wave-8 import
boundary only.
