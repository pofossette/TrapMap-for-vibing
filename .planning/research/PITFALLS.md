# Pitfalls Research

**Domain:** Team knowledge sharing CLI + reviewable RAG service
**Researched:** 2026-04-13
**Confidence:** MEDIUM

## Critical Pitfalls

### Pitfall 1: Team Scope Leakage

**What goes wrong:**
Retrieval or admin listing returns entries from the wrong team or from global scope without the right ordering.

**Why it happens:**
Developers add vector search first and bolt tenancy filters on later.

**How to avoid:**
Make team/scope filters mandatory inputs to retrieval and treat them as part of ranking, not as a cosmetic post-filter.

**Warning signs:**
Queries return high-similarity results that belong to a different team, or global constraints appear buried under project-specific items.

**Phase to address:**
Phase 2 and Phase 4

---

### Pitfall 2: Review States Too Shallow

**What goes wrong:**
Rejected items disappear, users cannot see why they failed, and admins lose triage context.

**Why it happens:**
Teams model review as approved vs rejected and ignore pre-review states or revision history.

**How to avoid:**
Model submission lifecycle explicitly and keep both review notes and prior attempt linkage.

**Warning signs:**
Resubmission requires copy-pasting from scratch or support intervention.

**Phase to address:**
Phase 3

---

### Pitfall 3: CLI Looks Friendly but Is Not Agent-Safe

**What goes wrong:**
Commands are readable for humans but unstable for automation because output shape and exit codes are inconsistent.

**Why it happens:**
The CLI is treated like a manual operator tool instead of an agent interface.

**How to avoid:**
Define human-readable defaults, JSON mode, deterministic exit codes, and stdin/flag-based submission flows from the start.

**Warning signs:**
Examples depend on ad-hoc piping or brittle text scraping.

**Phase to address:**
Phase 1 and Phase 4

---

### Pitfall 4: Vector Storage Becomes a Migration Trap

**What goes wrong:**
Embedding schema or metadata changes require painful rewrites because the team treated the vector layer as immutable.

**Why it happens:**
Retrieval is added quickly and reindex cost is not designed for.

**How to avoid:**
Keep raw source content authoritative, make embeddings rebuildable, and isolate vector-specific persistence concerns.

**Warning signs:**
Simple metadata changes imply destructive production fixes.

**Phase to address:**
Phase 1 and Phase 4

---

### Pitfall 5: Skill Packaging Drifts from Anthropic Expectations

**What goes wrong:**
Project "skills" exist but agents cannot reliably discover or load them.

**Why it happens:**
Teams treat skill files as generic markdown notes and skip required structure.

**How to avoid:**
Standardize on Claude-compatible skill directories, `SKILL.md`, and frontmatter-backed metadata from the first platform phase.

**Warning signs:**
Each runtime needs a custom adapter or the same skill content is duplicated in multiple places.

**Phase to address:**
Phase 1

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-coding permission checks in handlers | Faster MVP coding | Inconsistent authorization rules | Only for throwaway spikes, not for tracked phases |
| Storing only final review state | Smaller schema | No resubmission lineage or agent triage data | Never |
| Embedding on request path only | Less background infrastructure | Slow search and unpredictable latency | Acceptable only for tiny corpora during local development |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LangChain model adapters | Binding provider-specific behavior deep in domain services | Keep providers behind config and service interfaces |
| PGVector | Treating vector schema migrations as ordinary field edits | Plan for re-embedding and rebuildable indexes |
| Claude-compatible skills | Putting metadata in README text only | Keep machine-readable metadata in `SKILL.md` frontmatter |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Ranking after fetching too many candidates | Slow searches and noisy results | Apply metadata filters early and keep candidate set bounded | Usually once the corpus grows past a few thousand entries |
| Synchronous import of large datasets | CLI timeouts and blocked API workers | Use background jobs or chunked processing for imports | Large bootstrap imports or repeated backfills |
| Re-running LLM refinement on every low-value query | High latency and cost | Make refinement optional and bounded by relevance threshold | As soon as query volume becomes steady |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Using role template only without explicit permission list | Over-privileged team members | Merge template and per-user permissions in one authorization layer |
| Returning rejected content without ownership check | Data leakage across users or teams | Enforce subject ownership and admin-only overrides |
| Skipping audit logs for admin changes | No accountability for destructive operations | Log review, member, import, export, and deactivation actions |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Rejected items only show "rejected" | Users cannot improve submissions | Return exact review note and prior content |
| Global constraints mixed into generic search results | Users miss high-priority rules | Surface global constraints in a distinct section or ordering tier |
| CLI commands require interactive prompts for everything | Bash and agents cannot automate flows | Offer full flag/stdin execution paths |

## "Looks Done But Isn't" Checklist

- [ ] **Login flow:** Verify team selection persists and is explicit, not implicit guesswork
- [ ] **Submission workflow:** Verify rejected items can be fetched and resubmitted with history preserved
- [ ] **Retrieval:** Verify scope filters prevent cross-team leakage
- [ ] **Skill packaging:** Verify a Claude-compatible runtime can discover project skills without manual wiring

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Team scope leakage | HIGH | Freeze retrieval, audit affected queries, fix filters, re-test tenant boundaries |
| Review states too shallow | MEDIUM | Add lifecycle tables, migrate old decisions into explicit states, backfill links where possible |
| Vector migration trap | MEDIUM | Rebuild embeddings from source content and version the index schema |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Team scope leakage | Phase 2 and Phase 4 | Permission tests and retrieval tenancy tests pass |
| Review states too shallow | Phase 3 | Rejected-item fetch and resubmit workflow works end-to-end |
| CLI not agent-safe | Phase 1 and Phase 4 | Commands support JSON mode and stable exit behavior |
| Vector migration trap | Phase 1 and Phase 4 | Reindex strategy is documented and tested locally |
| Skill packaging drift | Phase 1 | Sample skill directory matches Claude-compatible expectations |

## Sources

- User-provided product requirements
- https://code.claude.com/docs/en/skills — skill packaging expectations
- https://docs.langchain.com/oss/python/integrations/vectorstores/pgvector — vector integration caveats

---
*Pitfalls research for: Team knowledge sharing CLI + reviewable RAG service*
*Researched: 2026-04-13*
