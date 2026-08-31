# Skill Registry Mainline

Active execution surface for skill version manager & package manager extraction.

## Status
- Contracts + domain (semver, diff, merge, version-manager) done
- Adapters (skills-sh, github, ai-pkgs-compat, local) done — copying ai-pkgs + ccswitch
- Services (registry, install, update, merge) done
- CLI integration (trapmap skill add / registry search/list/outdated/update/status) done
- Integration (fallow zone, pnpm-workspace, apps/cli dep) done
- Tests: domain + registry-service (3) pending broader

## Checklist
- [x] Hotspot analysis and copy mature impl selection
- [x] Contracts + domain
- [x] Adapters
- [x] Services (with 3-way merge, lockfile)
- [x] CLI integration
- [x] Fallow boundaries + docs
- [ ] Full vitest suite + typecheck
- [ ] E2E: `trapmap skill add ./packages/skills/workflow-with-trapmap --agent trapmap` smoke
- [ ] Closeout + merge
