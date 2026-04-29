# Phase 32 Review: Skill Trap CLI Implementation

## Summary

This review covers the trap CLI implementation and related governance infrastructure for the TrapMap project. The implementation provides a CLI interface for managing "trap" entries (pitfall/warning knowledge) with proper governance controls.

---

## Files Reviewed

### CLI Layer

#### `packages/cli/src/commands/trap.ts`
**Purpose:** CLI command definitions for trap management

**Structure:**
- `registerTrapCommands(program, options)` - Main registration function
- Two command groups based on permissions:
  - `allowSubmit`: `submit`, `resubmit`
  - `allowInspect`: `list`, `show`

**Strengths:**
- Clean separation of concerns with permission-based command visibility
- Consistent use of shared utilities (`loadCliState`, `requireSessionToken`, `apiRequest`, `printResult`)
- Proper input handling with multiple sources (`--detail`, `--file`, `--stdin`)
- Zod validation for API responses using `@trapmap/contracts` schemas
- Good formatting functions (`formatEntry`, `formatHistory`) for human-readable output

**Observations:**
- Uses `knowledgeEntryResponseSchema` and `knowledgeHistoryResponseSchema` - trap commands reuse knowledge contracts (appropriate given trap is a knowledge type)
- API endpoints called: `POST /v1/knowledge`, `GET /v1/knowledge/mine`, `GET /v1/knowledge/:entryId`, `POST /v1/knowledge/:entryId/resubmit`

#### `packages/cli/src/index.ts`
**Purpose:** CLI entry point and command registration

**Key Points:**
- Registers `registerTrapCommands` alongside `registerKnowledgeCommands` (line 113-116)
- Permission gates use `visibility.allowKnowledgeInspect` and `visibility.allowKnowledgeSubmit` for trap commands
- `api:list` command correctly lists `trap submit`, `trap resubmit`, `trap list`, `trap show` based on permissions

---

### Server Routes

#### `packages/server/src/routes/traps.ts`
**Purpose:** HTTP routes for trap operations

**Endpoints:**
1. `POST /v1/traps` - Submit new trap
2. `GET /v1/traps` - List own traps
3. `GET /v1/traps/:trapId` - Get trap details
4. `POST /v1/traps/:trapId/resubmit` - Resubmit rejected trap

**Security Controls:**
- `requirePermission(auth, 'knowledge:submit')` for submissions
- `requireRealUser()` ensures system admin cannot submit (requires real member)
- Project scope validation: requires active team
- `requiredLevel` validation: cannot exceed submitter's security level
- Owner-only access for listing; owner-or-higher-level for viewing details

**Logging:**
- Uses `logUserOperation` with actions `trap-submit` and `trap-resubmit`
- Properly logs actor, target, team, and metadata

**Observations:**
- Route paths use `/v1/traps` but CLI calls `/v1/knowledge` endpoints - **potential inconsistency** (see Issues)
- GET `/v1/traps/:trapId` has access control but doesn't use governance module consistently

#### `packages/server/src/app.ts`
**Purpose:** Fastify server configuration

**Key Points:**
- Registers `trapRoutes` (line 91)
- Documents trap routes in `documentedRoutes` array (lines 29-32)
- Error handling includes ZodError mapping

---

### Governance Module

#### `packages/server/src/lib/governance/types.ts`
**Purpose:** Shared governance type definitions

**Types:**
- `GovernanceContext` - Caller's access rights (teamId, securityLevel, isSystemAdmin)
- `GovernedEntity` - Common properties for governed resources
- `GovernanceFilters` - Scope and label filters

**Design:**
- Clean abstraction for unified eligibility checking
- Works for both KnowledgeEntry and SkillArtifact domains

#### `packages/server/src/lib/governance/eligibility.ts`
**Purpose:** Core eligibility checking logic

**Functions:**
- `isGovernanceEligible(entity, context)` - Core eligibility check
- `matchesGovernanceFilters(entity, filters)` - Scope/label matching
- `isGovernedEntityAccessible(entity, context, filters)` - Combined check
- `filterGovernedEntities(entities, context, filters)` - Array filtering

**Rules Enforced:**
1. `lifecycleState === 'approved'` required
2. System admin bypass OR:
   - Caller securityLevel >= entity.requiredLevel
   - Team access (global or matching teamId)

#### `packages/server/src/lib/governance/permissions.ts`
**Purpose:** Permission helpers bridging auth context to governance

**Functions:**
- `extractGovernanceContext(auth)` - Converts ResolvedAuthContext to GovernanceContext
- `hasPermission(auth, permission)` - Permission check
- `requirePermission(auth, permission)` - Throws if missing
- `requireTeamAccess(auth, teamId)` - Team scope check
- `requireHigherLevel(auth, targetLevel)` - Strictly higher level check

#### `packages/server/src/lib/governance/index.ts`
**Purpose:** Module exports

Clean re-exports of types and functions from submodules.

---

### Retrieval Module

#### `packages/server/src/lib/retrieval/filters.ts`
**Purpose:** Knowledge entry eligibility filtering for retrieval

**Design:**
- Adapts `KnowledgeRecord` to `GovernedEntity` interface via `toGovernedEntity()`
- Delegates to shared governance module
- Called by orchestrator BEFORE recall candidate generation

#### `packages/server/src/lib/retrieval/capsule-recall.ts`
**Purpose:** Capsule ranking for skill retrieval

**Key Functions:**
- `isArtifactGovernanceEligible(artifact, filters)` - Delegates to governance module
- `buildProfileShortlist(artifacts, filters)` - Filter + extract profiles
- `extractGovernedCapsules(artifacts, filters)` - Filter + extract capsules
- `rankCapsules(artifacts, intent, filters, maxResults)` - Score and rank

**Scoring:**
- Problem match (35%), situation match (25%), goal match (20%), keyword match (20%)
- Stack/path boost up to 1.5x
- Returns `CapsuleCandidate[]` with score breakdowns

---

### Supporting Files

#### `packages/server/src/lib/user-ops-log.ts`
**Purpose:** User operation logging with rotation

**Features:**
- Daily log files in JSON Lines format
- Configurable via environment variables
- File rotation support
- Fire-and-forget design (errors don't propagate)

**Actions Logged:**
- `trap-submit`, `trap-resubmit` (added for trap operations)
- `search`, `submit`, `edit`, `review`, `review-list`, `import`, `export`

---

## Issues Found

### Critical Issues

None identified. The codebase is well-structured and follows consistent patterns.

### Moderate Issues

1. **Route Path Inconsistency**
   - `trap.ts` CLI commands call `/v1/knowledge/*` endpoints
   - `traps.ts` routes define `/v1/traps/*` endpoints
   - **Impact:** CLI may not work correctly if traps routes are expected to handle these calls
   - **Resolution:** Verify which routes the CLI should call; likely the knowledge routes are correct and trap routes are an alternative or separate feature

### Minor Issues

1. **Incomplete Governance Usage in Trap Routes**
   - `GET /v1/traps/:trapId` implements custom access control instead of using `isGovernanceEligible`
   - This works but creates potential for divergence from unified governance rules

2. **Hardcoded Scope in Resubmit**
   - `traps.ts` line 149 hardcodes `scope: 'project'` in the pre-review call
   - Should preserve or derive the original scope

3. **Type Duplication**
   - `ArtifactGovernanceFilters` in `capsule-recall.ts` duplicates `GovernanceContext` fields
   - Could use `GovernanceContext` directly for consistency

---

## Positive Observations

1. **Clean Architecture**
   - Governance module provides unified eligibility logic
   - Clear separation between CLI, routes, and domain logic

2. **Permission-Based Visibility**
   - CLI commands appear/disappear based on user permissions
   - Consistent with existing knowledge commands

3. **Contract Reuse**
   - Trap commands reuse knowledge contracts appropriately
   - Zod validation ensures type safety

4. **Comprehensive Logging**
   - User operations logged with useful metadata
   - Rotation prevents log file overflow

5. **Good Test Surface**
   - Pure functions in governance and retrieval modules are easily testable
   - Clear input/output contracts

---

## Recommendations

1. **Resolve Route Path Confusion**
   - Document whether trap CLI uses `/v1/traps` or `/v1/knowledge` routes
   - Ensure `app.ts` documented routes match actual CLI usage

2. **Unify Access Control**
   - Use `isGovernanceEligible` in `GET /v1/traps/:trapId` for consistency

3. **Fix Scope in Resubmit**
   - Derive scope from existing entry rather than hardcoding

4. **Consider Type Unification**
   - Replace `ArtifactGovernanceFilters` with `GovernanceContext` where possible

---

## Conclusion

The trap CLI implementation is well-designed with proper governance controls, permission checks, and logging. The shared governance module provides excellent abstraction for eligibility checking across domains. The main concern is the potential route path inconsistency between CLI and route definitions, which should be verified to ensure correct operation.
