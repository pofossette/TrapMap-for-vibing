# Phase 15: Client Activation for References, Assets, and Scripts - Research

**Researched:** 2026-04-16  
**Domain:** Retrieval-time activation hints plus client-side download/policy control for skill references, assets, and scripts  
**Confidence:** MEDIUM

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
No `15-CONTEXT.md` exists, so this phase must follow the roadmap, requirements, AGENTS.md, and the current codebase only.

### Claude's Discretion
The implementation may choose the exact activation contract and CLI UX as long as it stays contracts-first, keeps the server out of script execution, and reuses the existing artifact/export seams instead of creating a parallel transport path.

### Deferred Ideas (OUT OF SCOPE)
- Browser UI or web-based activation flows
- Server-side script execution
- Multimodal asset understanding
- Relaxing client policy beyond the server default
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RETR-05 | activation response 能指出下一步应读取的 references、可用 scripts 和相关 assets | Retrieval v2 already returns capsule hits and profile hints, but not `clientManifest`-backed activation hints. This phase should bridge retrieval results to `latestRevision.derived.clientManifest`. |
| ACTV-01 | 客户端可按 activation metadata 按需下载 references、assets 与 scripts | The server already stores `artifactFilePayloads`, exposes artifact export, and the CLI already materializes bundle payloads to disk. Phase 15 should add selective activation flow on top of those pieces rather than inventing new storage. |
| ACTV-02 | 脚本执行策略至少支持 `reference-only`、`needs-approval`、`client-executable`、`blocked` | Current script descriptors only expose `manual | auto | blocked`. Phase 15 needs a richer activation-policy vocabulary that is explicit about download vs execution. |
| ACTV-03 | 服务端永不执行 skill scripts，只返回策略、描述、文件引用与哈希信息 | Existing server architecture already keeps script bodies out of retrieval results and exports bundles rather than executing anything. Keep that boundary absolute. |
| ACTV-04 | 客户端本地策略可以比服务端默认策略更严格，但不能更宽松 | The effective-policy merge should be resolved on the client from a server default plus local override, with monotonic tightening only. |
| COMP-01 | `contracts` 继续作为 CLI 与 server 的唯一共享契约真源 | Any activation request/response or policy schema change must land in `packages/contracts` first. |
</phase_requirements>

## Summary

Phase 15 should be treated as an activation surface layered on top of Phase 12 artifact manifests and Phase 14 capsule retrieval, not as a new storage or export system. The repo already has the two critical building blocks: `latestRevision.derived.clientManifest` on each artifact revision and an audited artifact export path backed by stored file payloads. What is missing is the contract between retrieval and delivery: retrieval needs to tell the client what to fetch next, and the client needs a policy-aware way to fetch only the relevant files.

The clean boundary is:
- retrieval stays distilled-first and metadata-only
- activation metadata is sourced from `clientManifest`, not from raw payload inspection in the CLI
- file bytes are delivered only through an explicit activation/export route
- script execution decisions remain entirely client-side and explicit

The current code already proves this direction is additive:
- `packages/server/src/lib/artifacts/derive.ts` builds `clientManifest` metadata for references, assets, and scripts
- `packages/server/src/routes/operations.ts` exports either distilled metadata or full bundle payloads with access checks and audit logging
- `packages/cli/src/lib/skill-artifact-export.ts` already knows how to safely materialize bundle files to disk
- `packages/cli/src/commands/retrieval.ts` already consumes the Phase 14 v2 retrieval path and is the natural place to surface read-next hints

## Concrete Code Seams

| Module | Current Role | Phase 15 Change |
|--------|--------------|-----------------|
| `packages/contracts/src/domain/retrieval.ts` | Shared seed-only retrieval v2 request/response contracts | Extend v2 response with activation hints derived from `clientManifest` while keeping output metadata-only |
| `packages/contracts/src/domain/artifacts.ts` | Defines script descriptors and `clientManifest` metadata | Either extend these schemas or add a sibling activation-policy contract that can express server default policy plus client-effective policy inputs |
| `packages/contracts/src/domain/operations.ts` | Shared artifact import/export contracts | Add activation/download request and response schemas for selective file delivery if full bundle export is too coarse |
| `packages/server/src/lib/retrieval/orchestrator.ts` | Builds capsule matches and profile hints | Enrich v2 results with `readNext`, asset hints, and script profile hints from eligible artifacts' manifests |
| `packages/server/src/lib/retrieval/assembly.ts` | Pure response shaping for v2 retrieval | Keep pure; shape activation metadata without exposing file bodies |
| `packages/server/src/routes/operations.ts` | Audited artifact import/export route | Reuse this boundary for explicit activation/download requests backed by stored file payloads |
| `packages/cli/src/commands/retrieval.ts` | Search UX for v1/v2 retrieval | Surface activation hints and route users into activation commands without downloading everything by default |
| `packages/cli/src/commands/operations.ts` | Existing import/export command family | Natural place to add activation/download commands because it already handles artifact file transport |
| `packages/cli/src/lib/skill-artifact-export.ts` | Safe local file materialization helpers | Reuse for selective writes during activation instead of adding ad hoc filesystem logic |

## Architectural Direction

### Pattern 1: Retrieval returns guidance, not payloads
The retrieval response should carry:
- which artifact revision matched
- which references are most relevant to read next
- which assets are available for activation
- which scripts are available, with capability and policy metadata only

It should not carry file bodies or auto-run anything.

### Pattern 2: Activation is explicit and selective
The client should ask for exactly the references/assets/scripts it wants to stage locally. The server should return bytes only for those selected paths, still guarded by artifact/team/level checks and audit logging.

### Pattern 3: Effective script policy is monotonic
The server supplies the default policy for a script. The client may tighten that policy locally, but never relax it. This needs one shared ordering, for example:

`blocked` > `reference-only` > `needs-approval` > `client-executable`

The client computes the stricter of:
- server default
- local override
- command-time safety mode

### Pattern 4: Reuse artifact export primitives
Selective activation should reuse:
- stored `artifactFilePayloads`
- existing path validation and payload metadata
- existing CLI directory materialization helpers

Do not create a second file store or bypass the current artifact/export seam.

## Recommended Plan Decomposition

### 15-01: Activation response with read-next hints, asset metadata, and script profiles
- Extend retrieval v2 contracts with activation metadata sourced from `clientManifest`
- Keep the response distilled and metadata-only
- Add pure assembly/orchestrator logic plus retrieval regressions

### 15-02: Policy model for scripts and client-side override rules
- Introduce a shared activation-policy vocabulary that satisfies ACTV-02/03/04
- Add pure helpers for server default policy shaping and client effective-policy resolution
- Persist local override configuration on the CLI side without creating execution side effects yet

### 15-03: CLI activation/download workflows for references, assets, and scripts
- Add an explicit activation/download contract and route, or extend artifact export in a selector-safe way
- Add CLI commands that fetch selected files and materialize them locally
- Reuse existing safe-write helpers and enforce policy before any script staging/execution prompt

## Risks and Mitigations

| Risk | Why it matters | Mitigation |
|------|----------------|------------|
| Retrieval leaks raw payload data | Breaks distilled-first retrieval and expands context surface | Keep activation hints metadata-only in retrieval contracts and assembly |
| CLI fetches whole bundles by default | Violates on-demand delivery and increases unnecessary transfer | Add path selectors for activation fetches or a dedicated activation route |
| Script policy is ambiguous | Client may accidentally execute scripts too freely | Define one shared policy ordering and test stricter-only override behavior |
| Activation bypasses existing access rules | Artifact payloads may leak across teams or levels | Reuse the artifact route boundary with auth, team, and level checks plus audit logging |

## Verification Focus

When Phase 15 executes, verification should prove:
- retrieval v2 returns activation hints without returning file content
- selective activation fetches only requested paths
- client override logic can tighten but never widen server policy
- no server path executes script content

