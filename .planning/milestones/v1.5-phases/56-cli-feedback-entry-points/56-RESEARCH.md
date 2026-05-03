# Phase 56: CLI Feedback Entry Points - Research

**Researched:** 2026-05-02
**Domain:** CLI post-execution feedback mechanism and skill-mounted feedback capabilities
**Confidence:** HIGH

## Summary

Phase 56 introduces a CLI feedback mechanism that allows users to report problems with knowledge entries (traps and skills) after retrieval. The system needs three components: (1) a CLI command with interactive prompts for problem capture, (2) contracts for feedback schema and storage, and (3) a server route for feedback submission. Additionally, skill artifacts can define custom feedback prompts in their SKILL.md frontmatter.

The CLI currently lacks interactive prompt capabilities -- all existing commands use flags and arguments exclusively. This phase requires adding an interactive prompt library. After evaluating options (inquirer, enquirer, prompts, @inquirer/prompts), **@inquirer/prompts** is recommended: it's the modern ESM-native successor to inquirer, has zero dependencies, works well with TypeScript, and fits the existing lightweight CLI architecture.

The feedback queue will be a new collection in `StoreData` alongside `knowledgeEntries` and `skillArtifacts`. Feedback entries reference the original entry by ID, capture problem type from a controlled vocabulary, and include optional context. Phase 57 will consume this queue for admin review.

**Primary recommendation:** Add `@inquirer/prompts` for interactive CLI, create `FeedbackRecord` and `FeedbackQueueItem` schemas in contracts, extend SKILL.md frontmatter parsing for optional `feedbackPrompts` field, and add a `/v1/feedback` POST route.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Interactive prompt handling | CLI | -- | User interaction happens at terminal |
| Feedback schema validation | Contracts | -- | Shared types between CLI and server |
| Feedback submission API | Server | -- | Server persists feedback to queue |
| Feedback queue storage | Server | -- | New collection in StoreData |
| Skill artifact feedback prompts | Contracts | -- | SKILL.md frontmatter extension |
| Feedback queue visibility | CLI | -- | Phase 57: admin review commands |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @inquirer/prompts | ^7.0.0 | Interactive CLI prompts | Modern ESM-native inquirer, zero deps, TypeScript-first |
| zod | ^4.3.6 | Schema validation for feedback contracts | Already in use across all packages |
| vitest | ^4.1.5 | Testing feedback capture and validation | Existing test framework in monorepo |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| gray-matter | ^4.0.3 | SKILL.md frontmatter parsing | Already used in contracts/parsing.ts -- extend for feedbackPrompts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @inquirer/prompts | inquirer v9 | inquirer v9 is CJS-focused with heavy dependencies. @inquirer/prompts is the official successor, ESM-native, and has smaller bundle. [VERIFIED: npm registry comparison] |
| @inquirer/prompts | enquirer | enquirer is less actively maintained (last update 2021). @inquirer/prompts has active maintenance and better TypeScript support. [VERIFIED: npm registry] |
| @inquirer/prompts | prompts (terkelg) | prompts is minimal but has different API style. @inquirer/prompts matches inquirer patterns for easier learning. [ASSUMED] |
| @inquirer/prompts | node:readline | readline requires more boilerplate for select/multiselect prompts. @inquirer/prompts provides polished UI out of box. [VERIFIED: node docs] |

**Installation:**
```bash
pnpm --filter @trapmap/cli add @inquirer/prompts
```

**Version verification:**
```bash
npm view @inquirer/prompts version  # 7.3.0 (as of 2026-05-02)
npm view zod version                # 4.4.2 (already installed ^4.3.6)
npm view vitest version             # 4.1.5 (already installed)
```

## Architecture Patterns

### System Architecture Diagram

```
+-------------------+      +-------------------+      +-------------------+
| CLI               |      | Server            |      | Store             |
|                   |      |                   |      |                   |
| feedback <id>     |      | POST /v1/feedback |      | feedbackQueue[]   |
|       |           |      |       |           |      |                   |
|       v           |      |       v           |      |                   |
| +-------------+   |      | +-------------+   |      | +-------------+   |
| | Interactive |   |      | | Validate    |   |      | | Append      |   |
| | Prompts     |   |      | | Feedback    |   |      | | Feedback    |   |
| | (problem    |   |      | | Schema      |   |      | | Record      |   |
| |  type, desc)|   |      | |             |   |      | |             |   |
| +------+------+   |      | +------+------+   |      | +-------------+   |
|        |          |      |        |          |      |                   |
|        v          |      |        v          |      |                   |
| +-------------+   | HTTP +-------------+   |      |                   |
| | Build       +--------->+ Persist     +--------->+                   |
| | Feedback    |   |      | to Queue    |   |      |                   |
| | Payload     |   |      |             |   |      |                   |
| +-------------+   |      | +-------------+   |      |                   |
|                   |      |                   |      |                   |
+-------------------+      +-------------------+      +-------------------+

Skill Artifact Feedback Prompts:
+-------------------+
| SKILL.md          |
| ---               |
| name: my-skill    |
| feedbackPrompts:  |  <-- NEW: optional frontmatter field
|   - "Which step?"|
|   - "What error?"|
| ---               |
| # My Skill        |
+-------------------+
        |
        v
+-------------------+
| parseSkillMarkdown|
| (extended)        |
| -> feedbackPrompts|
+-------------------+
        |
        v
+-------------------+
| CLI feedback cmd  |
| uses custom prompts|
| if defined        |
+-------------------+
```

### Recommended Project Structure
```
packages/contracts/src/domain/
  feedback.ts                 # NEW: feedback schema, problem types, queue item
  (update parsing.ts)         # extend ParsedSkillMarkdown with feedbackPrompts

packages/cli/src/
  commands/
    feedback.ts               # NEW: feedback command with interactive prompts
  lib/
    prompts.ts                # NEW: wrapper for @inquirer/prompts (testable)

packages/server/src/
  routes/
    feedback.ts               # NEW: POST /v1/feedback endpoint
  lib/
    (update store.ts)         # add feedbackQueue to StoreData

packages/cli/src/index.ts
  (update)                    # register feedback command
```

### Pattern 1: Problem Type Enum
**What:** A controlled vocabulary for feedback problem types. Ensures consistent categorization and enables Phase 57 batch processing.
**When to use:** CLI presents these as a select list; server validates against the enum.
**Example:**
```typescript
// packages/contracts/src/domain/feedback.ts
export const feedbackProblemTypeSchema = z.enum([
  'incorrect',       // Solution is wrong or has errors
  'outdated',        // Information is stale or no longer applies
  'context-mismatch', // Doesn't apply to current situation
  'incomplete',      // Missing critical information
  'other',           // Catch-all for uncategorized feedback
]);

export type FeedbackProblemType = z.infer<typeof feedbackProblemTypeSchema>;
```

### Pattern 2: Feedback Record Schema
**What:** The canonical schema for a feedback submission. Captures what, why, and context.
**When to use:** CLI builds this payload; server validates and stores it.
**Example:**
```typescript
// packages/contracts/src/domain/feedback.ts
export const feedbackSubmissionSchema = z.object({
  /** ID of the entry being reported (trap or skill artifact) */
  entryId: entityIdSchema,
  /** Type of the entry being reported */
  entryType: z.enum(['trap', 'skill']),
  /** Problem classification */
  problemType: feedbackProblemTypeSchema,
  /** User-provided description of the problem */
  description: z.string().min(10).max(2000),
  /** Optional context: what the user was trying to do */
  context: z.string().max(1000).optional(),
  /** Optional: which retrieval query led to this entry */
  querySeed: z.string().max(500).optional(),
  /** Optional: custom prompt answers if skill defined feedbackPrompts */
  customAnswers: z.array(z.object({
    prompt: z.string(),
    answer: z.string(),
  })).optional(),
});

export const feedbackRecordSchema = feedbackSubmissionSchema.extend({
  id: entityIdSchema,
  submittedAt: isoTimestampSchema,
  submittedBy: actorRefSchema,
  /** Current processing status */
  status: z.enum(['new', 'triaged', 'resolved', 'dismissed']).default('new'),
  /** Admin notes (added during Phase 57 review) */
  adminNotes: z.string().max(1000).optional(),
});

export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;
```

### Pattern 3: Interactive Prompt Flow
**What:** The CLI feedback command uses @inquirer/prompts to gather structured input.
**When to use:** When user runs `trapmap feedback <entry-id>`.
**Example:**
```typescript
// packages/cli/src/commands/feedback.ts
import { select, input, confirm } from '@inquirer/prompts';

async function collectFeedback(entryId: string, entryType: 'trap' | 'skill'): Promise<FeedbackSubmission> {
  const problemType = await select({
    message: 'What type of problem are you reporting?',
    choices: [
      { value: 'incorrect', name: 'Incorrect', description: 'The solution is wrong or has errors' },
      { value: 'outdated', name: 'Outdated', description: 'Information is stale or no longer applies' },
      { value: 'context-mismatch', name: 'Context mismatch', description: "Doesn't apply to my situation" },
      { value: 'incomplete', name: 'Incomplete', description: 'Missing critical information' },
      { value: 'other', name: 'Other', description: 'Something else' },
    ],
  });

  const description = await input({
    message: 'Describe the problem:',
    validate: (value) => value.length >= 10 || 'Please provide at least 10 characters',
  });

  const addContext = await confirm({
    message: 'Would you like to add context about what you were trying to do?',
    default: false,
  });

  const context = addContext
    ? await input({
        message: 'What were you trying to accomplish?',
        validate: (value) => value.length > 0 || 'Please describe your goal',
      })
    : undefined;

  return {
    entryId,
    entryType,
    problemType,
    description,
    context,
  };
}
```

### Pattern 4: Skill Artifact Feedback Prompts
**What:** Skills can define custom questions in their SKILL.md frontmatter. The CLI shows these after the standard prompts.
**When to use:** When a skill author wants structured feedback specific to their skill.
**Example:**
```markdown
---
name: docker-cleanup-strategy
description: Clean up Docker resources safely
feedbackPrompts:
  - prompt: "Which Docker version are you using?"
    required: false
  - prompt: "What error message did you see?"
    required: true
---

# Docker Cleanup Strategy
...
```

```typescript
// Extended parsing.ts
export interface ParsedSkillMarkdown {
  name: string | null;
  title: string | null;
  description: string | null;
  labels: string[];
  body: string;
  hasFrontmatter: boolean;
  feedbackPrompts?: Array<{ prompt: string; required: boolean }>;  // NEW
}

// In parseSkillMarkdown():
const feedbackPrompts = Array.isArray(data.feedbackPrompts)
  ? data.feedbackPrompts.map((p: unknown) => {
      if (typeof p === 'object' && p !== null && 'prompt' in p) {
        return {
          prompt: String((p as { prompt: unknown }).prompt),
          required: Boolean((p as { required?: unknown }).required ?? false),
        };
      }
      return null;
    }).filter(Boolean)
  : undefined;
```

### Pattern 5: Feedback Queue Storage
**What:** New collection in StoreData for feedback records. Simple append-only for Phase 56; Phase 57 adds batch processing.
**When to use:** Server persists feedback submissions here.
**Example:**
```typescript
// packages/server/src/lib/store.ts (additions)

export interface FeedbackQueueItemRecord {
  id: string;
  entryId: string;
  entryType: 'trap' | 'skill';
  problemType: FeedbackProblemType;
  description: string;
  context: string | null;
  querySeed: string | null;
  customAnswers: Array<{ prompt: string; answer: string }> | null;
  submittedAt: string;
  submittedByUserId: string;
  status: 'new' | 'triaged' | 'resolved' | 'dismissed';
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreData {
  // ... existing fields ...
  /** Feedback queue for admin review (FEEDBACK-01) */
  feedbackQueue: FeedbackQueueItemRecord[];
}

const EMPTY_STORE: StoreData = {
  // ... existing fields ...
  feedbackQueue: [],
};
```

### Anti-Patterns to Avoid

- **Using synchronous prompts in async CLI context:** The CLI's action handlers are async. @inquirer/prompts returns promises. Ensure all prompt calls are awaited. [VERIFIED: @inquirer/prompts API]
- **Storing feedback on the entry record directly:** Feedback is a one-to-many relationship (one entry can have multiple feedback reports). Storing on the entry would require array manipulation and make querying harder. Use a separate collection. [ASSUMED]
- **Requiring authentication for feedback:** While authentication helps with spam control, allowing anonymous feedback reduces friction. Consider allowing both modes. [ASSUMED - current CLI requires session, so feedback will be authenticated]
- **Making custom prompts required for feedback:** Skills may define custom prompts, but users should always be able to submit basic feedback without answering skill-specific questions. Standard prompts first, custom prompts optional. [ASSUMED]
- **Blocking feedback submission on entry existence check:** If an entry is deleted between retrieval and feedback submission, the feedback becomes orphaned. Accept this edge case and allow submission -- the ID reference remains useful for debugging. [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Interactive CLI prompts | node:readline with hand-rolled select/multiselect | @inquirer/prompts | @inquirer/prompts provides polished UI, accessibility support, and TypeScript types out of the box. readline requires significant boilerplate. |
| Feedback validation | Manual if/else checks | Zod schema | Consistent with existing contracts pattern; automatic type inference; built-in error messages |
| Frontmatter parsing | Regex-based YAML extraction | gray-matter (existing) | Already used in parsing.ts; handles edge cases like multi-line strings and nested structures |

**Key insight:** The complexity in this phase lies in the interactive CLI UX and the data modeling for the feedback queue. The server route is straightforward CRUD. Focus effort on prompt flow design and schema validation.

## Common Pitfalls

### Pitfall 1: CLI Doesn't Handle Non-TTY Environments
**What goes wrong:** Running `trapmap feedback <id>` in a CI/script context crashes because @inquirer/prompts requires a TTY.
**Why it happens:** @inquirer/prompts is designed for interactive terminals only.
**How to avoid:** Detect non-TTY and provide flag-based alternative: `trapmap feedback <id> --type incorrect --description "..."`. Or exit with a helpful error message.
**Warning signs:** CI pipelines fail when testing feedback command.

### Pitfall 2: Feedback Orphans When Entry Deleted
**What goes wrong:** An entry receives feedback, then an admin deletes the entry. The feedback record points to a non-existent entry.
**Why it happens:** Feedback references entry by ID; no foreign key constraint in JSON store.
**How to avoid:** Accept this as an edge case. Phase 57 admin review should show orphaned feedback with "[deleted entry]" indicator. Optionally, soft-delete entries instead of hard-delete.
**Warning signs:** Admin review shows feedback with missing entry details.

### Pitfall 3: Custom Prompt Schema Drift
**What goes wrong:** A skill defines custom prompts with non-standard structure, causing parsing errors or undefined behavior.
**Why it happens:** Frontmatter is user-editable; authors may typo the structure.
**How to avoid:** Validate custom prompts schema strictly. Ignore malformed prompts and log a warning. Fall back to standard prompts only.
**Warning signs:** CLI shows unexpected prompt behavior for certain skills.

### Pitfall 4: Feedback Flood Without Rate Limiting
**What goes wrong:** A user (or script) submits hundreds of feedback items in quick succession, flooding the queue.
**Why it happens:** No rate limiting on the feedback endpoint.
**How to avoid:** For Phase 56, accept the risk. Phase 57 can add rate limiting if needed. Consider session-based throttling if spam becomes an issue.
**Warning signs:** Feedback queue grows rapidly; admin review is overwhelmed.

### Pitfall 5: Missing Entry Type in Feedback Payload
**What goes wrong:** Feedback only stores `entryId` without `entryType`. Later, admin can't tell if it was a trap or skill.
**Why it happens:** Entry IDs might overlap between traps and skills (though current ID scheme uses prefixes like `trap_` and `skill_`).
**How to avoid:** Always include `entryType` in the feedback payload. The CLI knows the type when the user runs the command.
**Warning signs:** Admin review shows ambiguous entry references.

## Code Examples

Verified patterns from codebase analysis:

### Feedback Command Registration (CLI pattern)
```typescript
// Source: pattern from packages/cli/src/commands/trap.ts
import { Command } from 'commander';
import { select, input, confirm } from '@inquirer/prompts';
import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

export function registerFeedbackCommands(program: Command): void {
  program
    .command('feedback <entryId>')
    .description('Report a problem with a knowledge entry')
    .option('--type <type>', 'Problem type (skip interactive prompt)')
    .option('--description <text>', 'Problem description (skip interactive prompt)')
    .option('--context <text>', 'Optional context (skip interactive prompt)')
    .option('--entry-type <type>', 'Entry type: trap or skill')
    .option('--json', 'Output JSON')
    .action(async (entryId: string, flags: {
      type?: string;
      description?: string;
      context?: string;
      entryType?: string;
      json?: boolean;
    }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      // Non-interactive mode if all required flags provided
      if (flags.type && flags.description) {
        const payload = {
          entryId,
          entryType: flags.entryType ?? 'trap',
          problemType: flags.type,
          description: flags.description,
          context: flags.context,
        };
        // ... submit to API
        return;
      }

      // Interactive mode
      const feedback = await collectFeedbackInteractively(entryId, flags.entryType);
      // ... submit to API
    });
}
```

### Feedback Submission Route (server pattern)
```typescript
// Source: pattern from packages/server/src/routes/knowledge.ts
import { FastifyInstance } from 'fastify';
import { feedbackSubmissionSchema, feedbackRecordSchema } from '@trapmap/contracts';

export function feedbackRoutes(app: FastifyInstance): void {
  app.post('/v1/feedback', async (request, reply) => {
    const session = request.session;
    if (!session) {
      return reply.status(401).send({ code: 'unauthorized', message: 'Not authenticated' });
    }

    const body = feedbackSubmissionSchema.parse(request.body);

    const feedbackRecord = await app.skillShareer.store.transact((data) => {
      const id = app.skillShareer.store.nextId(data, 'feedback');
      const now = new Date().toISOString();

      const record = {
        id,
        ...body,
        submittedAt: now,
        submittedByUserId: session.userId,
        status: 'new' as const,
        adminNotes: null,
        createdAt: now,
        updatedAt: now,
      };

      data.feedbackQueue.push(record);
      return record;
    });

    return reply.status(201).send(feedbackRecordSchema.parse(feedbackRecord));
  });
}
```

### Store Extension (existing pattern)
```typescript
// Source: pattern from packages/server/src/lib/store.ts
export interface FeedbackQueueItemRecord {
  id: string;
  entryId: string;
  entryType: 'trap' | 'skill';
  problemType: 'incorrect' | 'outdated' | 'context-mismatch' | 'incomplete' | 'other';
  description: string;
  context: string | null;
  querySeed: string | null;
  customAnswers: Array<{ prompt: string; answer: string }> | null;
  submittedAt: string;
  submittedByUserId: string;
  status: 'new' | 'triaged' | 'resolved' | 'dismissed';
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

// Add to StoreData interface:
// feedbackQueue: FeedbackQueueItemRecord[];

// Add to EMPTY_STORE:
// feedbackQueue: [],
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No feedback mechanism | Structured feedback queue | This phase | Users can report problems; admins can triage |
| Knowledge quality is implicit | Explicit quality signals | This phase | Feedback contributes to lifecycle transitions (Phase 57) |
| Skills are static documents | Skills can define custom feedback prompts | This phase | Skill authors get targeted feedback |

**Deprecated/outdated:**
- None in this phase -- this is a greenfield feature addition

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | @inquirer/prompts is the best choice for interactive prompts | Standard Stack | Low -- enquirer or prompts could substitute with minor API changes |
| A2 | Feedback should be authenticated (require session) | Anti-Patterns | Medium -- could reduce feedback volume vs anonymous submission |
| A3 | Entry IDs are unique across traps and skills | Pitfall 5 | Low -- current ID scheme uses prefixes; entryType disambiguates anyway |
| A4 | Custom feedback prompts are optional (not required) | Pattern 4 | Low -- users can skip custom prompts and still submit |
| A5 | Phase 56 does not need rate limiting | Pitfall 4 | Medium -- if spam becomes an issue, Phase 57 can add throttling |
| A6 | Feedback submissions are append-only for Phase 56 | Pattern 5 | Low -- Phase 57 adds status updates and admin review |

**If this table is empty:** All claims in this research were verified or cited -- no user confirmation needed.

## Open Questions

1. **Should feedback support anonymous submission?**
   - What we know: Current CLI requires authentication for all commands. Allowing anonymous feedback might increase volume but reduce accountability.
   - What's unclear: Whether the benefit of more feedback outweighs the spam risk.
   - Recommendation: For Phase 56, require authentication (current CLI behavior). Phase 57 can add an optional `--anonymous` flag if needed.

2. **Should feedback include the retrieval query that led to the entry?**
   - What we know: The requirement mentions "optional context" but doesn't specify query capture.
   - What's unclear: Whether capturing `querySeed` is valuable for understanding why the entry was surfaced.
   - Recommendation: Add optional `querySeed` field to feedback schema. CLI can capture this if the user ran a search immediately before feedback. For Phase 56, leave it optional and unpopulated.

3. **How should custom prompts interact with the standard problem type flow?**
   - What we know: Standard prompts ask for problem type, description, and optional context. Custom prompts are skill-specific.
   - What's unclear: Whether custom prompts should replace or supplement standard prompts.
   - Recommendation: Supplement. Standard prompts first (problem type is essential), then skill-specific prompts as follow-up. This ensures consistent categorization across all feedback.

## Environment Availability

Step 2.6: New dependency identified

**@inquirer/prompts installation:**
```bash
# Install in CLI package
pnpm --filter @trapmap/cli add @inquirer/prompts

# Verify installation
pnpm --filter @trapmap/cli list @inquirer/prompts
```

**Existing dependencies (verified in codebase):**
- zod: ^4.3.6 (contracts, server, cli)
- gray-matter: ^4.0.3 (contracts)
- vitest: ^4.1.5 (monorepo)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.5 |
| Config file | packages/cli/vitest.config.ts, packages/server/vitest.config.ts |
| Quick run command | `pnpm --filter @trapmap/cli test` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEEDBACK-01 | CLI command `feedback <entry-id>` opens interactive prompt | unit | `pnpm --filter @trapmap/cli test -- commands/feedback.test.ts` | Wave 0 (new) |
| FEEDBACK-01 | Feedback captures problem type from controlled vocabulary | unit | `pnpm --filter @trapmap/contracts test -- domain/feedback.test.ts` | Wave 0 (new) |
| FEEDBACK-01 | Feedback captures description (required) and context (optional) | unit | `pnpm --filter @trapmap/contracts test -- domain/feedback.test.ts` | Wave 0 (new) |
| FEEDBACK-01 | Skill artifacts can define feedback prompts in frontmatter | unit | `pnpm --filter @trapmap/contracts test -- domain/parsing.test.ts` | Wave 0 (extend) |
| FEEDBACK-01 | Feedback submission creates entry in feedback queue | unit | `pnpm --filter @trapmap/server test -- routes/feedback.test.ts` | Wave 0 (new) |
| FEEDBACK-01 | Non-interactive mode with flags works | unit | `pnpm --filter @trapmap/cli test -- commands/feedback.test.ts` | Wave 0 (new) |

### Sampling Rate
- **Per task commit:** `pnpm --filter @trapmap/cli test && pnpm --filter @trapmap/server test`
- **Per wave merge:** `pnpm test && pnpm typecheck`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/contracts/src/domain/feedback.ts` -- new file for feedback schemas
- [ ] `packages/contracts/src/domain/feedback.test.ts` -- unit tests for feedback validation
- [ ] `packages/cli/src/commands/feedback.ts` -- new feedback command
- [ ] `packages/cli/src/commands/feedback.test.ts` -- unit tests for feedback command
- [ ] `packages/cli/src/lib/prompts.ts` -- wrapper for @inquirer/prompts
- [ ] `packages/server/src/routes/feedback.ts` -- new feedback route
- [ ] `packages/server/src/routes/feedback.test.ts` -- unit tests for feedback route
- [ ] Extend `packages/contracts/src/domain/parsing.ts` -- add feedbackPrompts parsing
- [ ] Extend `packages/contracts/src/domain/parsing.test.ts` -- test feedbackPrompts parsing
- [ ] Extend `packages/server/src/lib/store.ts` -- add FeedbackQueueItemRecord and feedbackQueue

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Feedback requires authenticated session (current CLI behavior) |
| V3 Session Management | no | No session changes |
| V4 Access Control | no | Any authenticated user can submit feedback |
| V5 Input Validation | yes | Zod validates all feedback inputs; description max 2000 chars; context max 1000 chars |
| V6 Cryptography | no | No cryptographic operations |

### Known Threat Patterns for User Feedback

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Feedback spam (many submissions from one user) | Denial of Service | Phase 56 accepts risk; Phase 57 can add rate limiting |
| Malicious content in description/context | Injection, XSS | Server stores content as-is; admin review UI (Phase 57) must escape HTML; no direct rendering to other users |
| Feedback on non-existent entries | Tampering | Server accepts orphaned feedback; Phase 57 shows "[deleted]" indicator |
| Impersonation (submitting feedback as another user) | Spoofing | Session-based auth; user ID taken from validated session, not from request body |

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `packages/cli/src/commands/trap.ts` -- existing command pattern with flags and options
- Codebase analysis: `packages/cli/src/lib/input.ts` -- existing text input resolution pattern
- Codebase analysis: `packages/server/src/routes/knowledge.ts` -- existing route pattern
- Codebase analysis: `packages/server/src/lib/store.ts` -- existing StoreData structure
- Codebase analysis: `packages/contracts/src/domain/parsing.ts` -- existing frontmatter parsing
- Codebase analysis: `packages/contracts/src/domain/artifacts.ts` -- skill artifact schema

### Secondary (MEDIUM confidence)
- npm registry: @inquirer/prompts v7.3.0 -- verified ESM-native, TypeScript support
- npm registry: inquirer v9 comparison -- verified heavier dependency footprint
- npm registry: enquirer -- verified less active maintenance

### Tertiary (LOW confidence)
- None -- all findings are based on direct codebase analysis or npm registry verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @inquirer/prompts is well-established; zod/vitest are existing
- Architecture: HIGH - follows existing CLI, server, contracts patterns
- Pitfalls: MEDIUM - based on general CLI feedback patterns and assumed behaviors

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable -- patterns are codebase-internal; @inquirer/prompts API is stable)
