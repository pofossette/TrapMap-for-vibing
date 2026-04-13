# Feature Research

**Domain:** Team knowledge sharing CLI + reviewable RAG service
**Researched:** 2026-04-13
**Confidence:** MEDIUM

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Team-aware authentication and context selection | Multi-team use breaks immediately without clear team context | MEDIUM | Needs persistent CLI session plus explicit active team |
| Structured knowledge submission and approval | Unreviewed free-form notes do not become trusted team memory | MEDIUM | Must preserve history for rejected and reworked entries |
| Search from plain text problem statements | The core promise is "tell me the problem, get relevant prior experience" | HIGH | Retrieval must respect scope, labels, and tenancy |
| Admin controls for members and entries | Shared knowledge requires curation, not only contribution | MEDIUM | Keep this available from the same CLI at first |
| Import/export and audit trail | Teams need migration and operational control over their knowledge base | MEDIUM | Especially important for bootstrap and compliance-like needs |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Agent pre-review before human approval | Reduces admin load and catches duplicate or weak entries early | HIGH | Needs explicit states such as `agent-pass` and `agent-rejected` |
| Global constraints separated from project knowledge | Lets retrieval surface short, high-signal rules before deeper project notes | MEDIUM | Useful for "always true" rules and organization-wide guidance |
| Claude-compatible skill packaging | Allows direct agent reuse instead of a disconnected knowledge silo | MEDIUM | Valuable because the project is explicitly designed for agent workflows |
| Shell-friendly command surface with JSON mode | Makes the product automatable from bash and LLM runtimes | MEDIUM | Essential for the "bash is all you need" positioning |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Rich GUI before CLI maturity | Feels easier for admins | Splits focus and hides API/contract gaps that agents still need solved | Keep CLI-first and add UI only after workflows stabilize |
| Multimodal retrieval in v1 | Sounds more advanced | Adds indexing, storage, and review complexity before text quality is proven | Stay text-only first |
| Auto-publish agent-reviewed knowledge | Faster throughput | Risks low-trust corpus and silent duplication | Keep admin final approval mandatory |

## Feature Dependencies

```text
Team selection
    └──requires──> Authentication

Knowledge search
    └──requires──> Approved knowledge corpus
                           └──requires──> Submission + review workflow

Resubmission UX
    └──requires──> Stored rejection feedback

Bulk import/export
    └──requires──> Stable knowledge schema + audit logging
```

### Dependency Notes

- **Knowledge search requires approved knowledge corpus:** Retrieval quality is meaningless until intake and review states exist.
- **Resubmission requires stored rejection feedback:** Users cannot improve a rejected item if the system discards why it was rejected.
- **Bulk import/export requires stable schema:** Operations tooling should not be added before the canonical entry shape exists.

## MVP Definition

### Launch With (v1)

- [ ] CLI-based login, team selection, and session persistence — core access path
- [ ] Knowledge submission with structured fields and review lifecycle — core knowledge intake
- [ ] Text-seed retrieval over approved knowledge — core end-user value
- [ ] Admin team/member/entry management — keeps the system trustworthy
- [ ] Bulk import/export and audit trail — makes the system operable in real teams

### Add After Validation (v1.x)

- [ ] Better retrieval ranking heuristics and prompt tuning — add once baseline relevance is measured
- [ ] Admin productivity helpers for reviewing large queues — add when backlog size justifies it

### Future Consideration (v2+)

- [ ] Web admin UI — add if CLI admin ergonomics become the bottleneck
- [ ] Cross-team sharing policies — add after basic tenancy is proven
- [ ] Multimodal knowledge assets — add only if text-only corpus proves insufficient

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Structured submission + review | HIGH | MEDIUM | P1 |
| Team-aware auth and permissions | HIGH | MEDIUM | P1 |
| Text retrieval from CLI | HIGH | HIGH | P1 |
| Admin operations | HIGH | MEDIUM | P1 |
| Bulk import/export | MEDIUM | MEDIUM | P1 |
| Skill packaging | MEDIUM | MEDIUM | P2 |
| Web admin UI | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Generic wiki tools | Generic prompt/skill repos | Our Approach |
|---------|--------------------|----------------------------|--------------|
| Terminal retrieval | Usually absent | Often ad-hoc | First-class CLI command |
| Review workflow | Manual docs process | Rarely structured | Agent pre-review plus admin decision |
| Team isolation | Weak or coarse | Often nonexistent | Explicit team context and permission model |
| Skill compatibility | Usually not agent-native | Varies by format | Claude-compatible packaging from day one |

## Sources

- User-provided product constraints in initialization prompt
- https://code.claude.com/docs/en/skills — skill layout expectations
- https://docs.langchain.com/oss/python/langchain/overview — LangChain usage model

---
*Feature research for: Team knowledge sharing CLI + reviewable RAG service*
*Researched: 2026-04-13*
