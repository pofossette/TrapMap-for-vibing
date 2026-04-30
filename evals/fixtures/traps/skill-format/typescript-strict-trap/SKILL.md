---
name: typescript-strict-trap
description: TypeScript strict mode pitfalls including type narrowing failures, any leakage, and declaration merging
labels:
  - typescript
  - javascript
  - strict-mode
  - type-safety
  - ts
---

# TypeScript Strict Mode Pitfalls

## Implicit Any from Missing Type Annotations

When TypeScript strict mode is not enabled, function parameters and return types default to any, hiding type errors. Code that compiles without errors in non-strict mode fails at runtime with "undefined is not a function" or "cannot read property of null" errors. Migrating to strict mode later reveals hundreds of latent type errors.

Prerequisite: must enable strict mode from project inception.
Requires explicit type annotations on all exported functions and class methods.

To mitigate: enable strict mode in tsconfig.json from day one. Fix: add `"strict": true` to tsconfig.json and resolve all resulting errors incrementally. Use `// @ts-expect-error` temporarily only during migration.

## Type Narrowing Failure with Union Types

When using union types (e.g., string | null), TypeScript cannot narrow the type inside async callbacks or closures. The compiler reports "object is possibly null" even after a null check, because the variable might have changed between the check and the callback execution. This leads to runtime null reference errors.

Fix: use type guards that return boolean predicates, or assign to a const before the async boundary. Requires understanding TypeScript control flow analysis.

## Declaration Merging with Module Augmentation

When using declaration merging to extend third-party module types, incorrect augmentation can corrupt the type system silently. The types compile but do not match the runtime values, causing undefined behavior. This error is especially common when augmenting express Request type or vitest matchers.

To mitigate: keep augmentations minimal and test them with runtime assertions. Fix: use module augmentation only in dedicated .d.ts files, verify augmented types with type-level tests.
