# Deferred Items - Phase 43

## Pre-existing test failure in operations.test.ts

- **File:** `packages/server/src/routes/operations.test.ts`
- **Test:** `operations routes > POST /v1/operations/artifacts/:artifactId/deactivate > re-approving a deactivated artifact rebuilds graph documents`
- **Error:** `expected 0 to be greater than or equal to 1` (line 2614)
- **Context:** The test expects graph index documents to exist after re-approving a deactivated artifact, but the count is 0 after re-approval. This suggests the graph rebuild on re-approval is not producing documents, possibly due to missing derived content on the test artifact.
- **Scope:** Out of scope for Plan 43-02 (store contract propagation). May relate to graph index rebuilding logic or test fixture setup.
- **Discovered during:** Plan 43-02 verification run
