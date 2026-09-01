# Skill Registry Mainline

Active execution surface for skill version manager & package manager extraction.

## Status
- Contracts + domain (semver, diff, merge, version-manager) done
- Adapters (skills-sh, github, ai-pkgs-compat, local) done — copying ai-pkgs + ccswitch
- Services (registry, install, update, merge) done
- CLI integration (trapmap skill add / registry search/list/outdated/update/status) done
- Integration (fallow zone, pnpm-workspace, apps/cli dep) done
- Tests: domain + registry-service + adapters 8 suites 17 cases passing (2026-09-01 fix @trapmap/lib barrel), cli 31 suites 547 cases passing, E2E local install smoke ok (workflow-with-trapmap 8 files)

## Checklist
- [x] Hotspot analysis and copy mature impl selection
- [x] Contracts + domain
- [x] Adapters
- [x] Services (with 3-way merge, lockfile)
- [x] CLI integration
- [x] Fallow boundaries + docs
- [x] Full vitest suite + typecheck (skill-registry 8/8, cli 31/31, typecheck 0)
- [x] E2E: `trapmap skill add ./packages/skills/workflow-with-trapmap --agent trapmap` smoke (InstallService local 8 files, RegistryService parse ok)
- [ ] Closeout + merge (deferred to mainline)
