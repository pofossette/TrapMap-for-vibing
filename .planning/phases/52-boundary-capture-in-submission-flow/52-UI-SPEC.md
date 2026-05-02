---
phase: 52
slug: boundary-capture-in-submission-flow
status: draft
shadcn_initialized: false
preset: none
created: 2026-05-02
---

# Phase 52 — UI Design Contract

> Visual and interaction contract for frontend phases. Generated from research, minimal contract due to API limits.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (CLI-focused phase) |
| Preset | not applicable |
| Component library | none |
| Icon library | none |
| Font | monospace (terminal) |

---

## Spacing Scale

Declared values (must be multiples of 4):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline gaps |
| sm | 8px | Compact element spacing |
| md | 16px | Default element spacing |
| lg | 24px | Section padding |
| xl | 32px | Layout gaps |
| 2xl | 48px | Major section breaks |
| 3xl | 64px | Page-level spacing |

Exceptions: Terminal output uses character-based spacing (2-space indentation)

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 | 1.5 |
| Label | 12px | 600 | 1.4 |
| Heading | 16px | 600 | 1.3 |
| Code | 13px | 400 | 1.6 |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | #1e1e1e | Terminal background |
| Secondary (30%) | #2d2d2d | Cards, panels |
| Accent (10%) | #4ade80 | Success indicators, approved status |
| Destructive | #ef4444 | Rejected status, errors |

Accent reserved for: approved status badges, success messages

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | Approve entry / Reject entry |
| Empty state heading | No entries awaiting review |
| Empty state body | All caught up! New submissions will appear here. |
| Error state | Failed to load review queue — check server connection |
| Boundary section heading | Boundary Constraints |
| Boundary empty state | No boundary constraints defined |
| Boundary extraction note | Agent extracted candidate boundaries from content |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |

---

## UI Components

### Review Queue Entry Display

```
┌─────────────────────────────────────────────────────────────┐
│ Entry: {shortcut}                           Status: {status} │
├─────────────────────────────────────────────────────────────┤
│ Labels: {label1}, {label2}                                  │
│                                                             │
│ {detail text truncated to 200 chars...}                     │
│                                                             │
│ ── Boundary Constraints ─────────────────────────────────── │
│ scope: {value}                                              │
│ temporal: {value}                                           │
│ maturity: {value}                                           │
│ ... (other layers)                                          │
│                                                             │
│ Note: {extraction source or "Author provided"}              │
└─────────────────────────────────────────────────────────────┘
```

### Boundary Edit Form (CLI)

```
Boundary Constraints (JSON input):
{
  "scope": ["global"] | ["project"] | ["global", "project"],
  "temporal": { "start": "ISO-date", "end": "ISO-date" },
  "maturity": ["experimental"] | ["stable"] | ["deprecated"],
  "audience": ["developer"] | ["architect"] | ...,
  "context": ["backend"] | ["frontend"] | ...,
  "stack": [{ "name": "react", "version": "18.x" }]
}

Fields:
  --boundary <json>  Provide boundary constraints as JSON
  --clear-boundary   Remove all boundary constraints
```

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
