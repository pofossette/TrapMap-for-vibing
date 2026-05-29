# Prompt Providers Configuration Guide

The prompt system uses a **provider-based template architecture** that renders format-specific prompts (XML or JSON) for different AI model families. This guide covers provider selection, template customization, and environment variable configuration.

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  PromptSlots │ ──> │ Provider     │ ──> │ Template     │ ──> │ Renderer     │
│  (task data) │     │ Selection    │     │ Override     │     │ (XML / JSON) │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
                     ↑                     ↑
                     │ modelId or          │ AI_PROMPT_TEMPLATE_FILE
                     │ AI_PROMPT_PROVIDER  │ (JSON slot overrides)
```

The pipeline:
1. **PromptSlots** define task content (role, task, constraints, etc.)
2. **Provider selection** picks the optimal format based on model ID or env var
3. **Template override** merges slot-level customizations from a JSON file
4. **Renderer** produces the final prompt string (XML or JSON)

## Supported Providers

| Provider    | Format | Recommended For     | Performance Notes                              |
|-------------|--------|---------------------|------------------------------------------------|
| `anthropic` | XML    | Claude models       | XML-native processing, optimized for caching   |
| `openai`    | JSON   | GPT / o1 / o3       | JSON structured output, function calling        |
| `deepseek`  | XML    | DeepSeek models     | Needs explicit format instructions              |
| `kimi`      | JSON   | Kimi / Moonshot     | Avoids XML; prefers JSON or plain text          |
| `gemini`    | XML    | Gemini models       | XML with JSON fallback efficiency               |
| `default`   | XML    | Any other model     | Generic compatibility                           |

## Provider Selection

### Automatic Selection (by Model ID)

When a `modelId` is provided, `selectProvider()` matches it against known patterns:

```typescript
import { selectProvider } from './lib/ai/providers/index.js';

const provider = selectProvider('claude-opus-4-6');
// => { name: 'anthropic', format: 'xml', ... }

const provider = selectProvider('gpt-4o');
// => { name: 'openai', format: 'json', ... }
```

**Pattern matching rules:**

| Model ID contains | Selected provider |
|-------------------|-------------------|
| `claude`          | `anthropic`       |
| `gpt`, `o1`, `o3`, `chatgpt` | `openai`  |
| `deepseek`        | `deepseek`        |
| `kimi`, `moonshot` | `kimi`           |
| `gemini`          | `gemini`          |
| (no match)        | `default`         |

### Explicit Provider (via Environment Variable)

Set `AI_PROMPT_PROVIDER` to force a specific provider regardless of model ID:

```bash
AI_PROMPT_PROVIDER=anthropic
```

Valid values: `anthropic`, `openai`, `deepseek`, `kimi`, `gemini`, `default`.

### Resolution Priority

`resolveProvider()` uses this fallback chain:

1. Explicit `provider` argument (highest priority)
2. `AI_PROMPT_PROVIDER` environment variable
3. `'default'` (lowest priority)

## Prompt Slots

All providers share the same `PromptSlots` interface. Slots are the content "variables" that get filled into provider templates.

```typescript
interface PromptSlots {
  role?: string;              // Assistant role description
  task?: string;              // Task instruction
  corePrinciples?: string[];  // Core operating principles
  outputInstructions?: string[]; // Output format specifications
  constraints?: string[];     // Behavioral constraints
  examples?: string[];        // Usage examples
  metadata?: {
    taskType: AiPromptTaskType;
    title: string;
    outputFormatHint?: string;
  };
}
```

### Task Types

The system supports five task types:

| Task Type                  | Description                                        |
|----------------------------|----------------------------------------------------|
| `boundary-extraction`      | Extract structured boundary constraints from text  |
| `knowledge-refinement`     | Summarize search results into concise knowledge    |
| `claim-verification`       | Verify claims against provided context             |
| `graph-extraction`         | Extract graph entities (nodes + edges) from text   |
| `graph-extraction-planner` | Segment input text for parallel entity extraction  |

### Dynamic Injections by Task Type

Prompt construction injects runtime context based on task type:

| Task Type                | Base Injections                               | MCP Status |
|--------------------------|-----------------------------------------------|------------|
| `boundary-extraction`    | WORKING_DIR, DATE, GIT_STATUS, SESSION_ID     | No         |
| `knowledge-refinement`   | WORKING_DIR, DATE, GIT_STATUS, SESSION_ID     | **Yes**    |
| `claim-verification`     | WORKING_DIR, DATE, GIT_STATUS, SESSION_ID     | No         |
| `graph-extraction`       | WORKING_DIR, DATE, GIT_STATUS, SESSION_ID     | No         |
| `graph-extraction-planner`| WORKING_DIR, DATE, GIT_STATUS, SESSION_ID     | No         |

Only `knowledge-refinement` tasks receive MCP server status (`${MCP_SERVERS}`).
The MCP status is returned as a JSON array and is pending integration with the MCP server manager.

## Template Format

### XML Templates (anthropic, deepseek, gemini, default)

XML templates use a mustache-like syntax with three directives:

```
{{var}}                   — Scalar substitution (XML-escaped)
{{#if var}}...{{/if}}     — Conditional block (removed when slot is falsy)
{{#list var}}...{{/list}} — Array iteration ({{item}} replaced per element)
```

Example template (`anthropic.xml`):

```xml
<system_instructions>
  <role>{{role}}</role>

  {{#if corePrinciples}}
  <core_principles>
    {{#list corePrinciples}}
    <item>{{item}}</item>
    {{/list}}
  </core_principles>
  {{/if}}

  <task>{{task}}</task>

  {{#if constraints}}
  <constraints>
    {{#list constraints}}
    <item>{{item}}</item>
    {{/list}}
  </constraints>
  {{/if}}
</system_instructions>
```

HTML comments (`<!-- ... -->`) are stripped before rendering. Empty lines from removed blocks are collapsed.

### JSON Templates (openai, kimi)

JSON templates use the same placeholder syntax, with additional metadata conventions:

- `_template`, `_doc`, `_format` — Documentation keys, stripped from output
- `_if_slotName` — When the preceding key's slot is falsy, removes the sibling data key

Example template (`openai.json`):

```json
{
  "_template": "openai",
  "_format": "json",
  "role": "{{role}}",
  "task": "{{task}}",
  "_if_corePrinciples": true,
  "core_principles": [
    "{{#list corePrinciples}}",
    "{{item}}",
    "{{/list}}"
  ],
  "_if_constraints": true,
  "constraints": [
    "{{#list constraints}}",
    "{{item}}",
    "{{/list}}"
  ]
}
```

After rendering, metadata keys and empty arrays are removed from the output.

## Customizing Templates

### Slot Overrides via JSON File

Use `AI_PROMPT_TEMPLATE_FILE` to override specific slot values per task type without modifying template files.

The override file format:

```json
{
  "boundary-extraction": {
    "role": "a custom boundary extraction assistant",
    "constraints": ["All fields are optional.", "Return valid JSON only."]
  },
  "knowledge-refinement": {
    "corePrinciples": ["Prioritize actionable facts."]
  }
}
```

Override fields: `role`, `task`, `corePrinciples`, `outputInstructions`, `constraints`, `examples`. All are optional — only specified fields override the defaults.

**Resolution order** for slot values:

1. Slots passed programmatically to `buildPrompt()`
2. Template override file (`AI_PROMPT_TEMPLATE_FILE`)
3. Task-specific built-in defaults

### Custom Template Files

To use a completely custom template, place a template file (XML or JSON) in `packages/server/src/lib/ai/providers/templates/` and register it in `defaults.ts`.

## API Reference

### `buildPrompt(taskType, slots, modelId?): string`

Build a complete system prompt string. This is the primary API for most use cases.

```typescript
import { buildPrompt } from './lib/ai/prompts.js';

// With automatic provider selection from model ID
const prompt = buildPrompt('boundary-extraction', mySlots, 'claude-opus-4-6');

// With provider from environment variable
const prompt = buildPrompt('knowledge-refinement', mySlots);
```

### `buildPromptWithCacheControl(taskType, slots, modelId?): CacheSection[]`

Build a prompt decomposed into `CacheSection[]` for fine-grained cache control. See [PROMPT_CACHING.md](./PROMPT_CACHING.md) for details.

### Backward-Compatible Builders

These functions use built-in slot definitions and the default provider:

```typescript
import {
  buildBoundaryExtractionSystemPrompt,
  buildKnowledgeRefinementSystemPrompt,
  buildClaimVerificationSystemPrompt,
} from './lib/ai/prompts.js';

const boundaryPrompt = buildBoundaryExtractionSystemPrompt();
const refinementPrompt = buildKnowledgeRefinementSystemPrompt({ maxSentences: 5 });
const verificationPrompt = buildClaimVerificationSystemPrompt({ strict: false });
```

### Provider Utilities

```typescript
import {
  selectProvider,      // Select by model ID
  resolveProvider,     // Select by name / env var
  loadProviderTemplate,// Load raw template string
  getProviderConfig,   // Get full ProviderConfig object
  listProviders,       // List all provider names
  isAiPromptProvider,  // Type guard
} from './lib/ai/providers/index.js';
```

## Environment Variables

| Variable                   | Description                                    | Default                          |
|----------------------------|------------------------------------------------|----------------------------------|
| `AI_PROMPT_PROVIDER`       | Force a specific provider name                 | `'default'` (auto-detect from model) |
| `AI_PROMPT_TEMPLATE_FILE`  | Path to JSON slot override file                | `docs/reference/system-prompt-slots.default.json` |

**Important:** Empty string env vars are treated as unset:
- `AI_PROMPT_TEMPLATE_FILE=""` → falls back to default file
- `AI_PROMPT_PROVIDER=""` → falls back to `'default'`

### AI Provider API Key Precedence

For the AI provider config (used by `loadAiProviderConfig()`), provider-specific keys take precedence over generic `AI_API_KEY`:

1. `OPENAI_API_KEY` / `GEMINI_API_KEY` — provider-specific (highest priority)
2. `AI_API_KEY` — generic fallback
3. Provider defaults — built-in defaults (lowest priority)

Example: If both `OPENAI_API_KEY=sk-old` and `AI_API_KEY=sk-new` are set, `sk-old` is used because provider-specific keys are preferred.
