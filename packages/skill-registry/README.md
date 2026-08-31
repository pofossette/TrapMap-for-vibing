# @trapmap/skill-registry

Skill Version Manager & Package Manager for TrapMap.

Extracted from `packages/skills` + `apps/cli` skill trap versioning, with `ai-pkgs` / `skills.sh` inspiration.

## Goals
- Internal version control: semver + revision, git-like history/diff/merge for local skills
- External registries: skills.sh, GitHub (anthropics/skills, openai/skills, vercel-labs/skills), ai-pkgs compat, generic git URL
- CLI parity: `trapmap skill add <source>`, `search --registry`, `list`, `outdated`, `update`, `remove`, `status`, `diff`, `install` from lockfile
- ccswitch-style multi-agent targets: `--agent claude-code|codex|cursor|... --global/--project`
- Lockfile: `.trapmap/skills.lock` + `trapmap.skills.json` manifest; check updates & 3-way merge preserving local edits.

See `docs/architecture/SKILL-REGISTRY.md` for full design.
