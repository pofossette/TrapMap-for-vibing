# @trapmap/web-panel

Administrative web panel for TrapMap.

## Purpose

This package hosts the browser-based operations console used by administrators
to inspect runtime health, review pending governance work, and perform manual
interventions that should not be exposed through the CLI.

## Commands

```bash
rtk pnpm --filter @trapmap/web-panel dev
rtk pnpm --filter @trapmap/web-panel build
rtk pnpm --filter @trapmap/web-panel test
rtk pnpm --filter @trapmap/web-panel typecheck
```

## Runtime API

- Default mode uses the real gateway API.
- Set `VITE_ADMIN_PANEL_API_MODE=mock` to force the local mock API.
- Set `VITE_ADMIN_PANEL_API_BASE_URL` to override the gateway origin when needed.

## Structure

- `src/app`: bootstrap, providers, router, shell
- `src/pages`: route-bound page composition
- `src/features`: workflow/controller boundaries
- `src/services`: API adapter boundary
- `src/stores`: Zustand slices
- `src/shared`: reusable UI helpers
- `src/styles`: global styles and design tokens

## Planned Capabilities

- Service and deployment status dashboard
- Pending manual review queue
- Review detail workspace with approval and rejection actions
- Inline JSON editing tools for manual correction scenarios
- Operational audit visibility for administrator actions
