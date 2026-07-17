# Wave-3 Owner-Domain Review Fix Report

Addressed the three Important review findings from `8173e912`:

- restored the semantic duplicate cutoff to `0.38` and added adjacent boundary
  fixtures: a `7/19` (`~0.368`) rejection and an `8/21` (`~0.381`) recall match;
- added deterministic entity-type/id tie-breakers after similarity sorting;
- set duplicate trace lanes to `exact`, `indexed-recall`, or `none` based on
  the actual match path and added assertions for recall and exact lanes.

Verification:

- candidate focused suite: 32 passed;
- contracts candidate suite: 31 passed;
- `rtk pnpm typecheck`: passed;
- Fallow new-only against `5cabe54f`: introduced dead-code, complexity, and
  duplication all `0`;
- `rtk git diff --check`: passed.
