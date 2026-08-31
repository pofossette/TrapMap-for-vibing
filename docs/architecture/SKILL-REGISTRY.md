# Skill Registry & Version Manager (@trapmap/skill-registry)

Extracted version control for `packages/skills` + TrapMap CLI skill handling, fulfilling package-manager + version-controller dual role (npm-like + git-like).

## Inspiration
- **ai-pkgs** (npm: ai-pkgs, github: SnowingFox/ai-skills): skills as distributable packages with lockfile, `ai-pkgs skills add <pkg> --agent cursor --project`, `list/outdated/update`, manifest `ai-pkgs.json`. Copied multi-agent path handling & registry search patterns.
- **skills.sh** (https://www.skills.sh): curated marketplace API `/api/skills/search`, `/api/skills/<slug>/bundle`. Copied bundle fetch & search semantics.
- **ccswitch** (huanghuoguoguo/ccswitch): local skill discovery across `~/.claude/skills`, `~/.codex/skills`, `~/.agents/skills`, `~/.cursor/skills`. Copied local adapter & multi-agent install dirs.
- **TrapMap native**: semver monotonicity in `pnpm check:skills`, revision history in `SkillArtifact`.

## Package Layout
`packages/skill-registry/src/`:
- `contracts/` — `SkillSource`, `SkillRegistryEntry`, `SkillVersion`, `SkillLockEntry` (lockfile v1), `SkillManifest`
- `domain/` — `semver` (caret/tilde/range), `diff` (file snapshot diff), `merge` (3-way git-like), `version-manager` (monotonic & range resolve)
- `adapters/` — `RegistryAdapter` interface + `skills-sh`, `github`, `ai-pkgs-compat`, `local` implementations
- `services/` — `RegistryService` (source parsing + fan-out search), `InstallService` (primary + agent copies + lockfile), `UpdateService` (outdated/updateAll), `MergeService` (status/check/3-way merge)
- `cli/` — `add/search/list/outdated/update/remove/status/diff/install` mirroring ai-pkgs CLI

## CLI Surface

```bash
trapmap skill add vercel-labs/skills --skill tdd --agent cursor --project
trapmap skill add anthropics/skills/retrieval
trapmap skill add skills.sh/tdd
trapmap skill add ./local-skill --agent codex
trapmap skill registry search tdd --limit 5
trapmap skill registry list --json
trapmap skill registry outdated
trapmap skill registry update --yes
trapmap skill registry status
trapmap skill registry diff anthropics/skills/tdd
trapmap skill registry install  # from lockfile
trapmap skill remove tdd
```

Flags copy ai-pkgs: `--agent <claude-code|codex|cursor|all>`, `--global/--project`, `--json`, `--yes`.

## Version Control (git-like)

- Each skill has `version` (semver) + `revision` (int) + `sourceHash` (sha256 of canonical files)
- Lockfile: `.trapmap/skills.lock` (project) / `~/.trapmap/skills.lock` (global) — maps slug -> {version,resolved,integrity,source,installedAt,installPath,agentTargets,scope}
- Manifest: `trapmap.skills.json` (optional) — declarative skills list for `trapmap skill registry install`
- Diff: `diffSnapshots(base, next)` -> file added/removed/modified/unchanged
- 3-way merge: `threeWayMerge(base, local, remote, strategy)` — `ours/theirs/union/manual`; conflicts when both diverged; `check()` predicts fast-forward vs conflict

## Multi-Agent Install Paths (copied ccswitch)

| Agent | Project | Global |
|-------|---------|--------|
| trapmap | `.trapmap/skills/<slug>` | `~/.trapmap/skills/<slug>` |
| claude-code | `.claude/skills/<slug>` | `~/.claude/skills/<slug>` |
| codex | `.codex/skills/<slug>` | `~/.codex/skills/<slug>` |
| cursor | `.cursor/skills/<slug>` | `~/.cursor/skills/<slug>` |

## Fallow Boundaries

`skill-registry` zone: `packages/skill-registry/src/**` allowed -> `[contracts, lib]`
Consumers: `cli`, `host-local`, `host-distributed` allowed to import `skill-registry`.

## Relationship to TrapMap Server

Server keeps authoritative `SkillArtifact` revisions in DB. Registry manager is client-side package resolution; on `add` it can optionally `POST /v1/skills/import` after install to register in TrapMap. Future: gateway proxies registry search to avoid CORS and cache.
