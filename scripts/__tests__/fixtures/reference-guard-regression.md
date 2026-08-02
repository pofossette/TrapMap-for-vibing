# Reference Guard Regression Fixture

This file is a regression fixture for Task 3's source-reference guard.

It contains a deliberate stale source reference that points to a non-existent
file path. The reference guard should detect this and fail with a precise
file/line/path error.

## Stale Reference

The authority source for this feature is `packages/server/src/lib/nonexistent-module.ts`.

This reference points to a file that does not exist in the repository. The guard
should report the exact file, line number, and missing path.
