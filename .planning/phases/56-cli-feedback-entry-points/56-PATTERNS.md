# Phase 56: CLI Feedback Entry Points - Pattern Mapping

**Generated:** 2026-05-02
**Phase directory:** .planning/phases/56-cli-feedback-entry-points

## Files to Create/Modify

| File | Role | Type | Closest Analog |
|------|------|------|----------------|
| `packages/contracts/src/domain/feedback.ts` | Feedback schema and problem types | NEW | `packages/contracts/src/domain/candidates.ts` |
| `packages/contracts/src/domain/parsing.ts` | Extend ParsedSkillMarkdown with feedbackPrompts | EXTEND | Self (existing parsing pattern) |
| `packages/cli/src/commands/feedback.ts` | Feedback command with interactive prompts | NEW | `packages/cli/src/commands/trap.ts` |
| `packages/cli/src/lib/prompts.ts` | Wrapper for @inquirer/prompts | NEW | `packages/cli/src/lib/input.ts` |
| `packages/server/src/routes/feedback.ts` | POST /v1/feedback endpoint | NEW | `packages/server/src/routes/knowledge.ts` |
| `packages/server/src/lib/store.ts` | Add FeedbackQueueItemRecord and feedbackQueue | EXTEND | Self (existing store pattern) |
| `packages/cli/src/index.ts` | Register feedback command | EXTEND | Self (existing registration pattern) |
| `packages/server/src/app.ts` | Register feedback routes | EXTEND | Self (existing route registration) |

---

## 1. `packages/contracts/src/domain/feedback.ts` (NEW)

### Role
Domain schema file defining feedback-related enums, request/response schemas, and type exports.

### Data Flow
```
CLI (builds FeedbackSubmission) → Server (validates, persists) → Store (feedbackQueue)
```

### Closest Analog: `packages/contracts/src/domain/candidates.ts`

**Key patterns from candidates.ts:**
- Enum schemas for status/type values (e.g., `CandidateStatusSchema`, `CandidateSourceSchema`)
- Request schemas for API payloads
- Response schemas for API responses
- Type exports using `z.infer<typeof schema>`

**Code excerpts from candidates.ts:**

```typescript
// Enum pattern (lines 15-23)
export const CandidateStatusSchema = z.enum([
  'received',
  'queued',
  'analyzing',
  'duplicate_detected',
  'ready_for_review',
  'resolved',
  'error',
]);

// Schema with imported base types (lines 41-47)
export const TrapCandidatePayloadSchema = z.object({
  scope: scopeSchema,
  labels: z.array(labelSchema).min(1),
  shortcut: z.string().min(1).max(280),
  detail: z.string().min(1).max(10000),
  requiredLevel: securityLevelSchema.optional(),
});

// Type export pattern (line 433)
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;
```

**Apply to feedback.ts:**
```typescript
import { z } from 'zod';
import { entityIdSchema, isoTimestampSchema, actorRefSchema } from './common.js';

// Problem type enum
export const feedbackProblemTypeSchema = z.enum([
  'incorrect',
  'outdated',
  'context-mismatch',
  'incomplete',
  'other',
]);

// Submission schema (request body)
export const feedbackSubmissionSchema = z.object({
  entryId: entityIdSchema,
  entryType: z.enum(['trap', 'skill']),
  problemType: feedbackProblemTypeSchema,
  description: z.string().min(10).max(2000),
  context: z.string().max(1000).optional(),
  querySeed: z.string().max(500).optional(),
  customAnswers: z.array(z.object({
    prompt: z.string(),
    answer: z.string(),
  })).optional(),
});

// Record schema (stored entity)
export const feedbackRecordSchema = feedbackSubmissionSchema.extend({
  id: entityIdSchema,
  submittedAt: isoTimestampSchema,
  submittedBy: actorRefSchema,
  status: z.enum(['new', 'triaged', 'resolved', 'dismissed']).default('new'),
  adminNotes: z.string().max(1000).optional(),
});

// Response schema
export const feedbackResponseSchema = z.object({
  feedback: feedbackRecordSchema,
});

// Type exports
export type FeedbackProblemType = z.infer<typeof feedbackProblemTypeSchema>;
export type FeedbackSubmission = z.infer<typeof feedbackSubmissionSchema>;
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
```

---

## 2. `packages/contracts/src/domain/parsing.ts` (EXTEND)

### Role
Extend ParsedSkillMarkdown interface to include optional feedbackPrompts field.

### Data Flow
```
SKILL.md (frontmatter) → parseSkillMarkdown() → ParsedSkillMarkdown (with feedbackPrompts)
```

### Closest Analog: Self (existing parsing.ts)

**Key patterns from parsing.ts:**

```typescript
// Interface definition (lines 12-19)
export interface ParsedSkillMarkdown {
  name: string | null;
  title: string | null;
  description: string | null;
  labels: string[];
  body: string;
  hasFrontmatter: boolean;
}

// parseSkillMarkdown function (lines 76-90)
export function parseSkillMarkdown(content: string): ParsedSkillMarkdown {
  const parsed = parseMarkdownFrontmatter(content);
  const data = parsed.data;
  const name = readString(data.name);
  const explicitTitle = readString(data.title);

  return {
    name,
    title: explicitTitle ?? name,
    description: readString(data.description),
    labels: readLabels(data.labels),
    body: parsed.body,
    hasFrontmatter: parsed.hasFrontmatter,
  };
}

// Helper pattern for reading arrays (lines 137-153)
function readLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}
```

**Apply to parsing.ts extension:**
```typescript
// Add to ParsedSkillMarkdown interface:
export interface ParsedSkillMarkdown {
  name: string | null;
  title: string | null;
  description: string | null;
  labels: string[];
  body: string;
  hasFrontmatter: boolean;
  feedbackPrompts?: Array<{ prompt: string; required: boolean }>;  // NEW
}

// Add helper function:
function readFeedbackPrompts(value: unknown): Array<{ prompt: string; required: boolean }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const prompts: Array<{ prompt: string; required: boolean }> = [];

  for (const item of value) {
    if (typeof item === 'object' && item !== null && 'prompt' in item) {
      const obj = item as Record<string, unknown>;
      prompts.push({
        prompt: String(obj.prompt),
        required: Boolean(obj.required ?? false),
      });
    }
  }

  return prompts.length > 0 ? prompts : undefined;
}

// Extend parseSkillMarkdown return:
export function parseSkillMarkdown(content: string): ParsedSkillMarkdown {
  const parsed = parseMarkdownFrontmatter(content);
  const data = parsed.data;
  const name = readString(data.name);
  const explicitTitle = readString(data.title);

  return {
    name,
    title: explicitTitle ?? name,
    description: readString(data.description),
    labels: readLabels(data.labels),
    body: parsed.body,
    hasFrontmatter: parsed.hasFrontmatter,
    feedbackPrompts: readFeedbackPrompts(data.feedbackPrompts),  // NEW
  };
}
```

---

## 3. `packages/cli/src/commands/feedback.ts` (NEW)

### Role
CLI command for submitting feedback on knowledge entries. Uses @inquirer/prompts for interactive mode.

### Data Flow
```
User runs 'trapmap feedback <entryId>' → Interactive prompts → Build FeedbackSubmission → POST /v1/feedback
```

### Closest Analog: `packages/cli/src/commands/trap.ts`

**Key patterns from trap.ts:**

```typescript
// Command registration (lines 56-60)
export function registerTrapCommands(program: Command, options: TrapCommandOptions): void {
  const trap = program
    .command('trap')
    .description('Manage trap entries (pitfall/warning knowledge)');

// Subcommand with options (lines 62-84)
  trap
    .command('submit')
    .description('Submit a new trap entry for review')
    .requiredOption('--scope <scope>', 'Trap scope: global or project')
    .requiredOption('--label <label>', 'Trap label', collectValues, [])
    .requiredOption('--shortcut <text>', 'One-line pitfall shortcut')
    .option('--detail <text>', 'Detailed pitfall and fix description')
    .option('--file <path>', 'Read detail text from a file')
    .option('--stdin', 'Read detail text from stdin')
    .option('--required-level <n>', 'Override required security level')
    .option('--json', 'Output JSON')
    .action(
      async (flags: { ... }) => {
        const state = await loadCliState();
        requireSessionToken(state);
        // ... business logic
        const response = await apiRequest<KnowledgeEntryResponse>(state, {
          method: 'POST',
          path: '/v1/knowledge',
          body: { ... },
        });
        const parsed = knowledgeEntryResponseSchema.parse(response.data);
        printResult(parsed, flags, ({ entry }) => [ ... ]);
      },
    );
```

**Apply to feedback.ts:**
```typescript
import { select, input, confirm } from '@inquirer/prompts';
import type { Command } from 'commander';

import { feedbackResponseSchema, type FeedbackProblemType } from '@trapmap/contracts';
import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

interface FeedbackCommandOptions {
  allowSubmit: boolean;
}

export function registerFeedbackCommands(program: Command, options: FeedbackCommandOptions): void {
  if (!options.allowSubmit) return;

  program
    .command('feedback <entryId>')
    .description('Report a problem with a knowledge entry')
    .option('--type <type>', 'Problem type (skip interactive prompt)')
    .option('--description <text>', 'Problem description (skip interactive prompt)')
    .option('--context <text>', 'Optional context (skip interactive prompt)')
    .option('--entry-type <type>', 'Entry type: trap or skill')
    .option('--json', 'Output JSON')
    .action(async (entryId: string, flags: { ... }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      // Non-interactive mode if all required flags provided
      if (flags.type && flags.description) {
        // ... submit directly
        return;
      }

      // Interactive mode
      const problemType = await select({
        message: 'What type of problem are you reporting?',
        choices: [
          { value: 'incorrect', name: 'Incorrect' },
          { value: 'outdated', name: 'Outdated' },
          { value: 'context-mismatch', name: 'Context mismatch' },
          { value: 'incomplete', name: 'Incomplete' },
          { value: 'other', name: 'Other' },
        ],
      });

      const description = await input({
        message: 'Describe the problem:',
        validate: (value) => value.length >= 10 || 'Please provide at least 10 characters',
      });

      // ... continue with context, submit to API
    });
}
```

---

## 4. `packages/cli/src/lib/prompts.ts` (NEW)

### Role
Wrapper module for @inquirer/prompts to enable testability and consistent prompt styling.

### Data Flow
```
CLI commands → prompts wrapper → @inquirer/prompts → terminal
```

### Closest Analog: `packages/cli/src/lib/input.ts`

**Key patterns from input.ts:**

```typescript
// Utility function with multiple input sources (lines 22-57)
export async function resolveTextInput(
  options: {
    file?: string;
    stdin?: boolean;
    text?: string;
  },
  fieldName: string,
): Promise<string> {
  const directText = options.text?.trim();

  if (directText) {
    return directText;
  }

  if (options.file) {
    const fileText = (await readFile(options.file, 'utf8')).trim();
    if (!fileText) {
      throw new Error(`${fieldName} file is empty.`);
    }
    return fileText;
  }

  if (options.stdin || hasStdinContent()) {
    const stdinText = await readFromStdin();
    if (!stdinText) {
      throw new Error(`No ${fieldName} content received on stdin.`);
    }
    return stdinText;
  }

  throw new Error(`Provide --${fieldName} <text>, --file <path>, or pipe content on stdin.`);
}
```

**Apply to prompts.ts:**
```typescript
import { select, input, confirm } from '@inquirer/prompts';

export interface PromptChoice<T> {
  value: T;
  name: string;
  description?: string;
}

export async function promptSelect<T>(
  message: string,
  choices: PromptChoice<T>[],
): Promise<T> {
  return select({
    message,
    choices: choices.map((c) => ({
      value: c.value,
      name: c.name,
      description: c.description,
    })),
  });
}

export async function promptInput(
  message: string,
  options?: { validate?: (value: string) => boolean | string; default?: string },
): Promise<string> {
  return input({
    message,
    validate: options?.validate,
    default: options?.default,
  });
}

export async function promptConfirm(message: string, defaultValue = false): Promise<boolean> {
  return confirm({
    message,
    default: defaultValue,
  });
}

// For testing: allow injection of mock prompts
export interface Prompts {
  select: typeof promptSelect;
  input: typeof promptInput;
  confirm: typeof promptConfirm;
}
```

---

## 5. `packages/server/src/routes/feedback.ts` (NEW)

### Role
Server route handling POST /v1/feedback requests, validating and persisting feedback to the queue.

### Data Flow
```
CLI → POST /v1/feedback → Validate FeedbackSubmission → Store.transact → feedbackQueue
```

### Closest Analog: `packages/server/src/routes/knowledge.ts`

**Key patterns from knowledge.ts:**

```typescript
// Route handler pattern (lines 40-98)
app.post('/v1/knowledge', async (request) => {
  const auth = await resolveAuthContext(app.skillShareer, request);
  requirePermission(auth, 'knowledge:submit');

  const payload = knowledgeSubmissionSchema.parse(request.body);
  const ownerUserId = requireRealUser(auth.user?.id);

  // ... validation logic

  const createdAt = nowIso();

  const entry = await app.skillShareer.store.transact((data) => {
    const record = createKnowledgeEntryRecord({
      store: app.skillShareer.store,
      data,
      ownerUserId,
      teamId: payload.scope === 'project' ? auth.activeTeamId : null,
      payload,
      requiredLevel: payload.requiredLevel ?? auth.securityLevel,
      createdAt,
      preReview,
    });

    data.knowledgeEntries.push(record);

    return toKnowledgeEntry(data, record);
  });

  // Log user operation (fire-and-forget)
  void logUserOperation(app.skillShareer.config.userOpsLog, { ... });

  return knowledgeEntryResponseSchema.parse({ entry });
});
```

**Apply to feedback.ts:**
```typescript
import { feedbackSubmissionSchema, feedbackRecordSchema, feedbackResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { resolveAuthContext } from '../lib/session.js';
import { nowIso } from '../lib/store.js';
import { logUserOperation } from '../lib/user-ops-log.js';

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/feedback', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    if (!auth.user?.id) {
      throw new AppError(401, 'unauthorized', 'Not authenticated');
    }

    const payload = feedbackSubmissionSchema.parse(request.body);

    const feedbackRecord = await app.skillShareer.store.transact((data) => {
      const id = app.skillShareer.store.nextId(data, 'feedback');
      const now = nowIso();

      const record = {
        id,
        ...payload,
        submittedAt: now,
        submittedBy: {
          id: auth.user!.id,
          handle: auth.handle,
          securityLevel: auth.securityLevel,
        },
        status: 'new' as const,
        adminNotes: null,
      };

      data.feedbackQueue.push(record);
      return record;
    });

    void logUserOperation(app.skillShareer.config.userOpsLog, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'feedback',
      targetId: feedbackRecord.id,
      teamId: auth.activeTeamId,
      metadata: { entryId: payload.entryId, problemType: payload.problemType },
    });

    return reply.status(201).send(feedbackResponseSchema.parse({ feedback: feedbackRecord }));
  });
};
```

---

## 6. `packages/server/src/lib/store.ts` (EXTEND)

### Role
Add FeedbackQueueItemRecord interface and feedbackQueue to StoreData.

### Data Flow
```
Server routes → StoreData.feedbackQueue → JSON file persistence
```

### Closest Analog: Self (existing store.ts)

**Key patterns from store.ts:**

```typescript
// Record interface pattern (lines 20-26)
export interface UserRecord {
  id: string;
  handle: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// StoreData interface (lines 594-615)
export interface StoreData {
  counters: Record<string, number>;
  users: UserRecord[];
  teams: TeamRecord[];
  memberships: MembershipRecord[];
  accessKeys: AccessKeyRecord[];
  sessions: SessionRecord[];
  knowledgeEntries: KnowledgeRecord[];
  auditEvents: AuditEventRecord[];
  skillArtifacts: SkillArtifactRecord[];
  artifactFilePayloads: ArtifactFilePayloadRecord[];
  candidateSubmissions: CandidateSubmissionRecord[];
  duplicateCases: DuplicateCaseRecord[];
  entityLineage: EntityLineageRecord[];
  graphIndexDocuments: GraphIndexDocumentRecord[];
}

// EMPTY_STORE pattern (lines 617-632)
const EMPTY_STORE: StoreData = {
  counters: {},
  users: [],
  teams: [],
  memberships: [],
  accessKeys: [],
  sessions: [],
  knowledgeEntries: [],
  auditEvents: [],
  skillArtifacts: [],
  artifactFilePayloads: [],
  candidateSubmissions: [],
  duplicateCases: [],
  entityLineage: [],
  graphIndexDocuments: [],
};
```

**Apply to store.ts extension:**
```typescript
// Add record interface:
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

// Extend StoreData interface:
export interface StoreData {
  // ... existing fields ...
  /** Feedback queue for admin review (FEEDBACK-01) */
  feedbackQueue: FeedbackQueueItemRecord[];
}

// Extend EMPTY_STORE:
const EMPTY_STORE: StoreData = {
  // ... existing fields ...
  feedbackQueue: [],
};
```

---

## 7. `packages/cli/src/index.ts` (EXTEND)

### Role
Register feedback command with the CLI program.

### Data Flow
```
index.ts → registerFeedbackCommands(program, options) → feedback command available
```

### Closest Analog: Self (existing index.ts)

**Key patterns from index.ts:**

```typescript
// Import pattern (lines 1-12)
import { Command } from 'commander';
import { registerAuditCommands } from './commands/audit.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerKnowledgeCommands } from './commands/knowledge.js';
// ... other imports

// Visibility options (lines 25-47)
const visibility = {
  allowTeamCreate: securityLevel >= 1 && hasPermission(effectivePermissions, 'team:create'),
  // ... other visibility flags
};

// Registration pattern (lines 111-148)
registerAuthCommands(program);
registerTeamCommands(program, {
  allowCreate: visibility.allowTeamCreate,
});
registerMemberCommands(program, {
  allowAccessKeyCreate: visibility.allowAccessKeyCreate,
  allowMemberCreate: visibility.allowMemberCreate,
  allowMemberUpdate: visibility.allowMemberUpdate,
});
// ... other registrations
```

**Apply to index.ts extension:**
```typescript
// Add import:
import { registerFeedbackCommands } from './commands/feedback.js';

// Add visibility flag (if needed):
const visibility = {
  // ... existing flags ...
  allowFeedbackSubmit: hasPermission(effectivePermissions, 'knowledge:search'), // Or appropriate permission
};

// Add registration:
registerFeedbackCommands(program, {
  allowSubmit: visibility.allowFeedbackSubmit,
});
```

---

## 8. `packages/server/src/app.ts` (EXTEND)

### Role
Register feedback routes with the Fastify app.

### Data Flow
```
app.ts → app.register(feedbackRoutes) → POST /v1/feedback available
```

### Closest Analog: Self (existing app.ts)

**Key patterns from app.ts:**

```typescript
// Import pattern (lines 23-32)
import { accessKeyRoutes } from './routes/access-keys.js';
import { authRoutes } from './routes/auth.js';
import { candidateRoutes } from './routes/candidates.js';
import { knowledgeRoutes } from './routes/knowledge.js';
// ... other imports

// Documented routes array (lines 34-69)
const documentedRoutes = [
  'POST /v1/auth/login',
  'GET /v1/auth/session',
  // ... other routes
] as const;

// Registration pattern (lines 124-133)
app.register(authRoutes);
app.register(teamRoutes);
app.register(memberRoutes);
app.register(accessKeyRoutes);
app.register(reviewRoutes);
app.register(trapRoutes);
app.register(knowledgeRoutes);
app.register(candidateRoutes);
app.register(retrievalRoutes);
app.register(operationsRoutes);
```

**Apply to app.ts extension:**
```typescript
// Add import:
import { feedbackRoutes } from './routes/feedback.js';

// Add to documentedRoutes:
const documentedRoutes = [
  // ... existing routes ...
  'POST /v1/feedback',
] as const;

// Add registration:
app.register(feedbackRoutes);
```

---

## Test File Patterns

### `packages/contracts/src/domain/feedback.test.ts` (NEW)

**Analog:** `packages/contracts/src/domain/parsing.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { feedbackSubmissionSchema, feedbackProblemTypeSchema } from './feedback.js';

describe('feedback schema', () => {
  describe('feedbackProblemTypeSchema', () => {
    it('accepts valid problem types', () => {
      expect(feedbackProblemTypeSchema.parse('incorrect')).toBe('incorrect');
      expect(feedbackProblemTypeSchema.parse('outdated')).toBe('outdated');
    });

    it('rejects invalid problem types', () => {
      expect(() => feedbackProblemTypeSchema.parse('invalid')).toThrow();
    });
  });

  describe('feedbackSubmissionSchema', () => {
    it('validates required fields', () => {
      const result = feedbackSubmissionSchema.parse({
        entryId: 'trap_1',
        entryType: 'trap',
        problemType: 'incorrect',
        description: 'This is a test description with enough characters.',
      });
      expect(result.entryId).toBe('trap_1');
    });

    it('requires minimum description length', () => {
      expect(() =>
        feedbackSubmissionSchema.parse({
          entryId: 'trap_1',
          entryType: 'trap',
          problemType: 'incorrect',
          description: 'too short',
        }),
      ).toThrow();
    });
  });
});
```

### `packages/cli/src/commands/feedback.test.ts` (NEW)

**Analog:** Pattern from `packages/server/src/routes/knowledge.test.ts`

### `packages/server/src/routes/feedback.test.ts` (NEW)

**Analog:** `packages/server/src/routes/knowledge.test.ts`

---

## Summary Table

| File | Type | Primary Analog | Key Patterns Applied |
|------|------|----------------|---------------------|
| `feedback.ts` (contracts) | NEW | `candidates.ts` | Enum schemas, request/response schemas, type exports |
| `parsing.ts` (contracts) | EXTEND | Self | Interface extension, helper functions for data extraction |
| `feedback.ts` (cli) | NEW | `trap.ts` | Command registration, option handling, action handler |
| `prompts.ts` (cli) | NEW | `input.ts` | Utility function pattern, error handling |
| `feedback.ts` (server) | NEW | `knowledge.ts` | Route handler, auth context, store transact, logging |
| `store.ts` (server) | EXTEND | Self | Record interface, StoreData extension, EMPTY_STORE |
| `index.ts` (cli) | EXTEND | Self | Import, visibility flag, registration |
| `app.ts` (server) | EXTEND | Self | Import, documentedRoutes, app.register |
