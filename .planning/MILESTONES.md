# Milestones

## v1.0 MVP (Shipped: 2026-04-14)

**Phases completed:** 5 phases, 17 plans, 50 tasks

**Key accomplishments:**

- Bootstrapped the TypeScript monorepo and root tooling layer for the CLI, server, and contracts packages.
- Defined the v1 shared schema surface for auth, teams, knowledge, review, retrieval, and operations.
- Documented the v1 API surface and added bootstrap implementations plus project skill scaffolding.
- Implemented the server-side authentication, session persistence, and active-team foundation.
- Implemented team creation, member onboarding and updates, access-key issuance, and reusable RBAC enforcement.
- Turned the CLI bootstrap into a working authenticated client with permission-aware command visibility.
- Lifecycle-aware knowledge storage now preserves submission history, reviewer decisions, and timeline events on each entry.
- Engineers can submit knowledge from the terminal and inspect their own entry history, status, and reviewer feedback through the same CLI.
- Every submission now passes through a LangChain-backed pre-review that records duplicate, correctness, and completeness risk before human review.
- Higher-level reviewers can reject or approve entries with notes, and submitters can correct and resubmit the same knowledge object with history intact.
- Embeddings-backed retrieval pipeline with eligibility filtering, deterministic fallback, and Fastify route integration.
- Bucket-shaped retrieval response with best-effort refinement, returning null without provider configuration to maintain local/CI compatibility.
- CLI search command with shell-friendly input options, permission-aware visibility, and formatted text/JSON output modes.
- End-to-end workflow tests proving submission-to-search approval gating, resubmit lifecycle linkage, and JSON mode consistency across CLI retrieval commands.
- Admin knowledge management with list, edit, and deactivate capabilities gated by permissions and security levels
- Implemented bulk import/export endpoints with validation, duplicate detection, and security level enforcement
- Comprehensive audit trail for review, import, export, and deactivation actions with CLI query capability

---
