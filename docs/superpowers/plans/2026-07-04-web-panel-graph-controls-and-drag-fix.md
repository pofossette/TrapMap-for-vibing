# Web Panel Graph Controls And Drag Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both graph preview pages use project-standard HeroUI selects and stop node-label ghosting during graph dragging.

**Architecture:** Keep page-specific selection state in the graph pages, but switch their dropdown rendering to the same HeroUI `Select`/`ListBox` pattern already used elsewhere in `web-panel`. Fix drag ghosting once in the shared `G6GraphComponent` by tightening drag event behavior instead of patching each page separately.

**Tech Stack:** React 19, HeroUI, Vitest, Vite, AntV G6

## Global Constraints

- Reuse existing `@heroui/react` `Select` and `ListBox` patterns already present in `packages/web-panel/src/pages/activity/activity-page.tsx` and `packages/web-panel/src/pages/review-queue/review-queue-page.tsx`.
- Keep drag-fix scope inside `packages/web-panel/src/shared/ui/g6-graph-component.tsx`; do not fork graph behavior per page.
- Follow TDD: write failing tests first, verify red, implement minimal code, verify green.

---

### Task 1: Lock Graph Page Control Rendering

**Files:**
- Create: `packages/web-panel/src/pages/graph-page-controls.test.tsx`
- Modify: `packages/web-panel/src/pages/trap-graph/trap-graph-page.tsx`
- Modify: `packages/web-panel/src/pages/skill-graph/skill-graph-page.tsx`

**Interfaces:**
- Consumes: `TrapGraphPage(): ReactElement`, `SkillGraphPage(): ReactElement`
- Produces: page markup containing HeroUI `Select.Trigger`-backed button triggers instead of native `<select>` controls

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run `rtk pnpm --filter @trapmap/web-panel test --run src/pages/graph-page-controls.test.tsx` and confirm it fails because native `select` elements still exist**
- [ ] **Step 3: Replace graph page native `select` controls with HeroUI `Select`/`ListBox` composition matching existing page patterns**
- [ ] **Step 4: Re-run `rtk pnpm --filter @trapmap/web-panel test --run src/pages/graph-page-controls.test.tsx` and confirm it passes**

### Task 2: Lock Shared Graph Drag Behavior

**Files:**
- Create: `packages/web-panel/src/shared/ui/g6-graph-component.test.tsx`
- Modify: `packages/web-panel/src/shared/ui/g6-graph-component.tsx`

**Interfaces:**
- Consumes: `G6GraphComponent` props `{ data, onSelectNode, onSelectEdge, searchKeyword?, highlightColor? }`
- Produces: shared drag behavior that updates node fixed positions during drag without restarting the force layout on `node:dragstart`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run `rtk pnpm --filter @trapmap/web-panel test --run src/shared/ui/g6-graph-component.test.tsx` and confirm it fails because drag start still triggers layout**
- [ ] **Step 3: Implement the minimal shared drag fix in `g6-graph-component.tsx`**
- [ ] **Step 4: Re-run `rtk pnpm --filter @trapmap/web-panel test --run src/shared/ui/g6-graph-component.test.tsx` and confirm it passes**

### Task 3: Focused Verification

**Files:**
- Test: `packages/web-panel/src/pages/graph-page-controls.test.tsx`
- Test: `packages/web-panel/src/shared/ui/g6-graph-component.test.tsx`

**Interfaces:**
- Consumes: green implementation from Tasks 1 and 2
- Produces: verified regression coverage for graph page controls and shared drag behavior

- [ ] **Step 1: Run `rtk pnpm --filter @trapmap/web-panel test --run src/pages/graph-page-controls.test.tsx src/shared/ui/g6-graph-component.test.tsx`**
- [ ] **Step 2: If needed, run `rtk pnpm --filter @trapmap/web-panel typecheck` to confirm no typing regressions**
- [ ] **Step 3: Review the changed files for accidental scope creep and stop**
