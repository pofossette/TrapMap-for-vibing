# Phase 32: 拆分 skill 与 trap 为独立 CLI 命令和服务端边界，抽离共享治理逻辑 - Research

**Gathered:** 2026-04-24
**Status:** Research complete

---

## Summary

Phase 32 aims to establish clean architectural boundaries between "skill" (技能工件) and "trap" (陷阱/知识条目) concepts by:
1. Splitting CLI commands into distinct `skill` and `trap` command groups
2. Creating separate server-side API boundaries for each domain
3. Extracting shared governance logic into a reusable module

---

## Current Architecture Analysis

### CLI Command Structure (`packages/cli/src/`)

| File | Purpose | Current State |
|------|---------|---------------|
| `index.ts` | Main entry, registers all commands | Single unified command surface |
| `commands/skill.ts` | Skill artifact commands | `skill search-by-content`, `skill edit`, `skill history`, `skill review:*` |
| `commands/knowledge.ts` | Knowledge entry commands | `submit`, `resubmit`, `review-status` |
| `commands/retrieval.ts` | Retrieval commands | `search` (with `--v2` flag for capsule mode) |
| `commands/operations.ts` | Import/export/edit/deactivate | Mixed artifact and knowledge operations |
| `commands/review.ts` | Review workflow | `review:queue`, `review:approve`, `review:reject` |

**Key Observation:** The "trap" concept is currently implicit within `knowledge` commands. There's no explicit `trap` command group.

### Server Route Structure (`packages/server/src/routes/`)

| Route Pattern | Handler | Domain |
|---------------|---------|--------|
| `/v1/knowledge` | `knowledgeRoutes` | Legacy knowledge entries |
| `/v1/knowledge/:entryId/resubmit` | `knowledgeRoutes` | Legacy knowledge entries |
| `/v1/retrieval/search` | `retrievalRoutes` | v1 entry-based retrieval |
| `/v2/retrieval/search` | `retrievalRoutes` | v2 capsule-native retrieval |
| `/v1/retrieval/skills/search-by-content` | `retrievalRoutes` | Skill artifact lookup |
| `/v1/operations/artifacts/:artifactId/edit` | `operationsRoutes` | Skill artifact edit |
| `/v1/operations/artifacts/review-queue` | `operationsRoutes` | Skill artifact review |
| `/v1/operations/knowledge/:entryId/deactivate` | `operationsRoutes` | Knowledge deactivation |

**Key Observation:** Routes are mixed between `knowledge`, `retrieval`, and `operations` namespaces. No clean "trap" vs "skill" separation.

### Contracts Structure (`packages/contracts/src/domain/`)

| File | Contents | Domain |
|------|----------|--------|
| `knowledge.ts` | `KnowledgeEntry`, `KnowledgeSubmission`, `KnowledgeRevision` | Legacy knowledge/trap entries |
| `artifacts.ts` | `SkillArtifact`, `SkillCapsule`, `SkillProfile`, `ClientManifest` | Skill artifacts |
| `retrieval.ts` | `RetrievalQuery`, `RetrievalResponse`, `CapsuleMatch`, `SkillLookupQuery` | Retrieval contracts |
| `common.ts` | `Permission`, `LifecycleState`, `Scope`, `SecurityLevel` | Shared domain primitives |

---

## Governance Logic Distribution

### Current Governance Points (Scattered)

| Location | Function | Purpose |
|----------|----------|---------|
| `lib/rbac.ts` | `requirePermission()`, `hasPermission()` | Permission checks |
| `lib/rbac.ts` | `requireTeamAccess()`, `requireHigherLevel()` | Team/level access |
| `lib/retrieval/filters.ts` | `isEntryEligible()`, `filterEligibleEntries()` | Knowledge entry eligibility |
| `lib/retrieval/capsule-recall.ts` | `isArtifactGovernanceEligible()` | Artifact governance eligibility |
| `lib/context.ts` | `ResolvedAuthContext` | Auth context resolution |
| `evals/retrieval/lib/governance.ts` | `evaluateGovernance()` | Evaluation-time governance checks |

### Governance Criteria (Currently Duplicated/Scattered)

```typescript
// From retrieval/filters.ts - Knowledge Entry Eligibility
1. lifecycleState === 'approved'
2. requiredLevel <= auth.securityLevel
3. Team access: entry.teamId matches auth.activeTeamId (or system admin)
4. Scope filter: filters.scopes.includes(entry.scope)
5. Label filter: all requested labels present

// From retrieval/capsule-recall.ts - Artifact Governance Eligibility
1. lifecycleState === 'approved'
2. System admin bypass OR:
   - artifact.teamId === filters.teamId (team match)
   - filters.securityLevel >= artifact.requiredLevel
```

**Key Insight:** Both eligibility functions implement nearly identical governance logic but for different domain types (KnowledgeEntry vs SkillArtifact).

---

## Domain Model Comparison

### KnowledgeEntry (Legacy/Trap)

```typescript
interface KnowledgeEntry {
  id: string;
  teamId: string | null;
  scope: 'global' | 'project';
  labels: string[];
  shortcut: string;        // One-line summary
  detail: string;          // Full description
  requiredLevel: number;
  lifecycleState: LifecycleState;
  owner: ActorRef;
  history: KnowledgeRevision[];
  agentReview?: AgentReviewResult;
  reviewHistory: ReviewDecision[];
}
```

### SkillArtifact (Skill)

```typescript
interface SkillArtifact {
  id: string;
  teamId: string | null;
  scope: 'global' | 'project';
  labels: string[];
  title: string;           // Human-readable title
  slug: string;            // URL-friendly slug
  requiredLevel: number;
  lifecycleState: LifecycleState;
  owner: ActorRef;
  latestRevision: number;
  history: SkillArtifactRevision[];
  agentReview?: AgentReviewResult;
  reviewHistory: ReviewDecision[];
  // Additional:
  metadata: SkillArtifactMetadata;
  lifecycleHistory: SkillArtifactLifecycleEvent[];
}
```

**Key Differences:**
- KnowledgeEntry: `shortcut`/`detail` text fields
- SkillArtifact: `title`/`slug` + structured revision history with derived outputs (capsules, profiles, manifests)

---

## Terminology Clarification Needed

### Current Confusion

| Term | Used In | Meaning |
|------|---------|---------|
| "knowledge" | CLI commands, routes | Legacy text-based entries |
| "skill" | CLI `skill` commands, artifacts | Structured artifact bundles |
| "trap" | Phase title, not in codebase | Implicitly = "knowledge"? |
| "entry" | Retrieval, filters | Generic, could be either |

### Proposed Clarification

| Term | Proposed Domain | CLI Prefix | Route Prefix |
|------|-----------------|------------|--------------|
| **trap** | Short-form knowledge capture (pitfall/warning) | `trap` | `/v1/traps` |
| **skill** | Structured skill artifact bundles | `skill` | `/v1/skills` |

---

## Architectural Goals for Phase 32

### 1. CLI Command Separation

**Current:**
```
trapmap submit          # knowledge/trap submission
trapmap skill edit      # skill artifact edit
trapmap search          # unified retrieval
```

**Proposed:**
```
trapmap trap submit     # trap submission
trapmap trap list       # list traps
trapmap trap show       # show trap details
trapmap trap edit       # edit trap
trapmap trap deactivate # deactivate trap

trapmap skill submit    # skill submission (from directory)
trapmap skill list      # list skills
trapmap skill show      # show skill details
trapmap skill edit      # edit skill
trapmap skill history   # skill revision history

trapmap search          # unified search (both traps and skills)
trapmap search --traps-only
trapmap search --skills-only
```

### 2. Server Route Separation

**Current:** Mixed under `/v1/knowledge`, `/v1/operations/artifacts`, `/v1/retrieval`

**Proposed:**
```
/v1/traps                     # Trap CRUD
/v1/traps/:trapId
/v1/traps/:trapId/resubmit

/v1/skills                    # Skill CRUD
/v1/skills/:skillId
/v1/skills/:skillId/history
/v1/skills/:skillId/revisions

/v1/retrieval/search          # Unified (with domain filter)
/v1/retrieval/traps           # Trap-only retrieval
/v1/retrieval/skills          # Skill-only retrieval (existing)
```

### 3. Shared Governance Module

**Target Location:** `packages/server/src/lib/governance/`

```typescript
// governance/types.ts
interface GovernanceContext {
  teamId: string | null;
  securityLevel: number;
  isSystemAdmin: boolean;
}

interface GovernedEntity {
  teamId: string | null;
  scope: Scope;
  requiredLevel: number;
  lifecycleState: LifecycleState;
}

// governance/eligibility.ts
function isGovernanceEligible(
  entity: GovernedEntity,
  context: GovernanceContext,
): boolean;

function filterGovernedEntities<T extends GovernedEntity>(
  entities: T[],
  context: GovernanceContext,
): T[];

// governance/permissions.ts
function requirePermission(auth: ResolvedAuthContext, permission: Permission): void;
function requireTeamAccess(auth: ResolvedAuthContext, teamId: string): void;
function requireLevel(auth: ResolvedAuthContext, targetLevel: number): void;
```

---

## Implementation Considerations

### Backward Compatibility

| Concern | Mitigation |
|---------|------------|
| Existing CLI users using `trapmap submit` | Keep `submit` as alias for `trap submit` (deprecated) |
| Existing routes `/v1/knowledge/*` | Keep routes, redirect internally to trap handlers |
| Contracts exports | Keep existing exports, add new trap-specific types |

### Migration Strategy

1. **Phase 32-A:** Create shared governance module
2. **Phase 32-B:** Refactor existing code to use shared governance
3. **Phase 32-C:** Add new CLI command structure (with deprecation warnings)
4. **Phase 32-D:** Add new route structure (with backward compat)
5. **Phase 32-E:** Update contracts with domain-specific types

### Testing Strategy

1. Unit tests for shared governance module
2. Integration tests for new CLI commands
3. Backward compatibility tests for legacy routes
4. Evaluation governance tests should use shared module

---

## Dependencies

### Phase Dependencies

| Phase | Dependency Reason |
|-------|-------------------|
| Phase 31 | Mode-aware baselines and routing traces must be preserved |
| Phase 29 | Unified routing layer should be maintained |
| Phase 26-28 | Evaluation governance should use shared module |

### Code Dependencies

| Module | Depends On | Impact |
|--------|------------|--------|
| `retrieval/filters.ts` | `governance/eligibility.ts` | Refactor |
| `retrieval/capsule-recall.ts` | `governance/eligibility.ts` | Refactor |
| `rbac.ts` | `governance/permissions.ts` | Refactor or merge |
| All routes | `governance/*` | Import changes |

---

## Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing CLI workflows | Medium | High | Keep deprecated aliases |
| Evaluation regressions | Medium | High | Ensure governance logic is identical |
| Contract incompatibility | Low | High | Additive changes only |
| Performance overhead | Low | Low | Shared module is pure functions |

---

## Open Questions

1. **Naming:** Should we use "trap" or "knowledge" terminology? "Trap" aligns with "TrapMap" brand but "knowledge" is established in codebase.

2. **Scope:** Should this phase include migration of existing `KnowledgeEntry` records to a new `TrapEntry` type, or just structural separation?

3. **Retrieval unification:** Should `search` command unify both domains by default, or require explicit `--traps`/`--skills` flags?

4. **Contracts package:** Should governance types live in `@trapmap/contracts` or stay server-internal?

---

## Files to Create/Modify

### New Files

| Path | Purpose |
|------|---------|
| `packages/server/src/lib/governance/index.ts` | Governance module entry |
| `packages/server/src/lib/governance/types.ts` | Governance interfaces |
| `packages/server/src/lib/governance/eligibility.ts` | Eligibility functions |
| `packages/server/src/lib/governance/permissions.ts` | Permission helpers |
| `packages/server/src/routes/traps.ts` | Trap routes |
| `packages/server/src/routes/skills.ts` | Skill routes |
| `packages/cli/src/commands/trap.ts` | Trap CLI commands |
| `packages/contracts/src/domain/trap.ts` | Trap contracts (optional) |

### Modified Files

| Path | Changes |
|------|---------|
| `packages/cli/src/index.ts` | Register new commands, deprecate old |
| `packages/cli/src/commands/knowledge.ts` | Deprecate, redirect to trap |
| `packages/server/src/app.ts` | Register new routes |
| `packages/server/src/lib/retrieval/filters.ts` | Use shared governance |
| `packages/server/src/lib/retrieval/capsule-recall.ts` | Use shared governance |
| `packages/server/src/lib/rbac.ts` | Consider merging into governance |

---

## Success Criteria

1. **CLI Separation:** `trapmap trap --help` and `trapmap skill --help` show distinct command groups
2. **Route Separation:** `/v1/traps/*` and `/v1/skills/*` routes are documented
3. **Governance Unification:** Single `isGovernanceEligible()` function used by both domains
4. **Backward Compatibility:** Existing `trapmap submit` still works (with deprecation warning)
5. **No Regressions:** All existing tests pass, evaluation governance checks unchanged

---

## Next Steps

1. Confirm terminology decision (trap vs knowledge)
2. Decide on migration scope (structural only vs data migration)
3. Create shared governance module first
4. Refactor existing code to use shared governance
5. Add new CLI commands and routes incrementally
