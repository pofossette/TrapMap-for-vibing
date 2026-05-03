# Phase 49: Time-based Decay in Retrieval - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning
**Mode:** Auto-generated from ROADMAP and Phase 48 completion context

<domain>
## Phase Boundary

Phase 49 should apply freshness-based ranking multipliers in retrieval with configurable decay curves for different knowledge types.

This phase is about ranking-time decay scoring, not about lifecycle state transitions or governance filtering (already done in Phase 48).

In scope:
- Define freshness types for knowledge entries (evergreen, versioned, volatile)
- Implement decay curve functions (exponential, linear) with configurable parameters
- Apply decay multiplier to retrieval scores based on entry age and freshness type
- Expose decay multiplier in retrieval explanation metadata
- Allow per-freshness-type configuration of decay curve parameters

Out of scope:
- Lifecycle state transitions (Phase 48)
- Hard decay filtering in governance (Phase 48)
- Batch management of stale entries (Phase 50)
- Conflict detection (Phase 55)

</domain>

<decisions>
## Implementation Decisions

### From Phase 48 (Locked Dependencies)

- **DecayState enum**: active, review-due, stale, expired, superseded (already defined)
- **DecayConfig schema**: reviewDueDays, staleDays, expireDays, enabled (already defined)
- **DecayMeta schema**: lastVerifiedAt, decayState, supersededById, decayStateComputedAt (already defined)
- **Hard decay**: expired/superseded already filtered in governance eligibility
- **Soft decay**: stale entries already penalized in rerank (staleDecayPenalty=0.1)

### Working Assumptions for Phase 49

- Freshness type is a new dimension separate from DecayState
- Freshness type determines WHICH decay curve to apply, not WHETHER to apply decay
- Evergreen content: no time-based decay (reference docs, best practices)
- Versioned content: decays when target version mismatches (version-specific traps)
- Volatile content: time-based exponential decay (incident workarounds, temporary fixes)
- Decay multiplier should be visible but not override governance hard-decay

### Target Direction

- Add `freshnessType` field to knowledge records (default: evergreen)
- Create decay curve functions: exponentialDecay(t, halfLife, floor), linearDecay(t, rate, floor)
- Add decay curve config to DecayConfig or create FreshnessConfig
- Compute freshness multiplier in rerank after soft-decay penalty
- Include decayMultiplier in retrieval explanation metadata

</decisions>

<code_context>
## Existing Code Insights

### Decay contracts already defined (Phase 48)

From `packages/contracts/src/domain/decay.ts`:
- `decayStateSchema` with 5 states
- `decayConfigSchema` with threshold days
- `decayMetaSchema` for record tracking

### Retrieval rerank already applies stale penalty (Phase 48)

From `packages/server/src/lib/retrieval/rerank.ts`:
- `RerankConfig` has `staleDecayPenalty` option (default 0.1)
- Soft decay penalty applied after boosts, before [0,1] capping
- `hasStaleDecayState` helper function exists

### Governance already filters expired/superseded (Phase 48)

From `packages/server/src/lib/governance/eligibility.ts`:
- `isGovernanceEligible` excludes expired/superseded when decay enabled
- Admin bypass available via `excludeDecayed: false`

### Knowledge records have decayMeta field (Phase 48)

From `packages/server/src/lib/store.ts`:
- `KnowledgeRecord.decayMeta: DecayMeta | null`
- `SkillArtifactRecord.decayMeta: DecayMeta | null`

### Retrieval explanation exists but lacks decay detail

From `packages/contracts/src/domain/retrieval.ts`:
- Retrieval response includes match reasons and citations
- No existing field for decay multiplier explanation

</code_context>

<specifics>
## Specific Ideas

- Add `freshnessTypeSchema = z.enum(['evergreen', 'versioned', 'volatile'])` to contracts
- Add `freshnessType` to DecayMeta or as separate field on records
- Create decay curve functions:
  - `exponentialDecay(ageDays, halfLifeDays, floor): number`
  - Returns multiplier in [floor, 1.0] range
- Add FreshnessDecayConfig:
  - `evergreen: { enabled: false }` (no decay)
  - `versioned: { enabled: true, mode: 'step', ... }`
  - `volatile: { enabled: true, mode: 'exponential', halfLifeDays: 30, floor: 0.3 }`
- Compute final score: `baseScore * decayMultiplier` after rerank
- Add `decayMultiplier?: number` to retrieval result metadata

</specifics>

<deferred>
## Deferred Ideas

- Version-mismatch detection for versioned freshness type (requires version extraction)
- Machine learning to auto-classify freshness type from content
- Decay curve visualization dashboard
- Per-team freshness configuration overrides

</deferred>

---

*Phase: 49-time-based-decay-in-retrieval*
*Context gathered: 2026-05-02*
