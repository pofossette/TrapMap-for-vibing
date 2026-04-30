---
name: react-hooks-trap
description: React hooks pitfalls including stale closures, missing dependencies, and effect cleanup
labels:
  - react
  - hooks
  - javascript
  - frontend
  - closure
  - useEffect
---

# React Hooks Pitfalls

## Stale Closure in useEffect

When useEffect captures state variables in its closure, the captured values become stale on subsequent renders. The effect reads old state values instead of current ones, causing incorrect behavior that is difficult to debug. The error often appears as undefined or null values where current state was expected.

Prerequisite: must understand JavaScript closures and React rendering model.
Requires adding all used variables to the dependency array.

To mitigate: use the exhaustive-deps eslint rule. Fix: add all referenced state and props to the useEffect dependency array, or use useRef to hold mutable values that persist across renders.

## Missing Cleanup in Effects

Effects that create subscriptions, timers, or event listeners without cleanup cause memory leaks. The component unmounts but the effect callback continues running, updating state on an unmounted component. This causes the "cannot update unmounted component" warning and potential crash.

Requires a cleanup return function from useEffect. Fix: return a cleanup function that removes event listeners, clears intervals, and unsubscribes from observables.

## Incorrect Key Prop in Lists

Using array index as key in list rendering causes state corruption when items are reordered, inserted, or removed. React reuses DOM elements incorrectly, causing undefined behavior and visual bugs that are hard to reproduce in local testing but appear in production with real data.

Fix: use stable unique identifiers as keys instead of array indices. Test with vitest to verify list reconciliation behavior.
