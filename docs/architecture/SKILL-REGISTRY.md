# Skill Registry 与版本管理

> 真源：`packages/skill-registry/src/`。状态：Active。

## 定位

`@trapmap/skill-registry` 管客户端侧 Skill 包的解析与版本（npm-like + git-like 双角色）。服务端权威修订仍在 DB 的 `SkillArtifact` 中（见 [工件系统](components/ARTIFACTS.md)）。`packages/skills/` 下放 2 个内置技能与 `README.md`。

## 包布局

`packages/skill-registry/src/` 下设 5 层（实测存在 `adapters/ cli/ contracts/ domain/ services/`）：

| 层 | 内容 |
|---|---|
| `contracts/` | `SkillSource`、`SkillRegistryEntry`、`SkillVersion`、`SkillLockEntry`（lockfile v1）、`SkillManifest` |
| `domain/` | `semver`（caret / tilde / range）、`diff`（文件快照 diff）、`merge`（3 路 git-like）、`version-manager`（单调性与 range 解析） |
| `adapters/` | `RegistryAdapter` 接口 + `skills-sh`、`github`、`ai-pkgs-compat`、`local` 实现 |
| `services/` | `RegistryService`（源解析 + 扇出搜索）、`InstallService`（主本 + agent 副本 + lockfile）、`UpdateService`（outdated / updateAll）、`MergeService`（status / check / 3 路合并） |
| `cli/` | `add/search/list/outdated/update/remove/status/diff/install` |

## 命令面

```bash
trapmap skill add vercel-labs/skills --skill tdd --agent cursor --project
trapmap skill registry search tdd --limit 5
trapmap skill registry list --json
trapmap skill registry outdated
trapmap skill registry update --yes
trapmap skill registry status
trapmap skill registry install
trapmap skill remove tdd
```

`--agent` 取值 `claude-code|codex|cursor|all`，`--global/--project` 决定作用域。lockfile 落点：项目 `.trapmap/skills.lock`，全局 `~/.trapmap/skills.lock`；可选声明文件 `trapmap.skills.json` 供 `install` 使用。

## 多 agent 安装路径

| Agent | 项目 | 全局 |
|---|---|---|
| trapmap | `.trapmap/skills/<slug>` | `~/.trapmap/skills/<slug>` |
| claude-code | `.claude/skills/<slug>` | `~/.claude/skills/<slug>` |
| codex | `.codex/skills/<slug>` | `~/.codex/skills/<slug>` |
| cursor | `.cursor/skills/<slug>` | `~/.cursor/skills/<slug>` |

## 版本语义

每个 Skill 带 `version`（semver）+ `revision`（int）+ `sourceHash`（规范文件 sha256）。`diffSnapshots(base, next)` 输出文件级增删改；`threeWayMerge` 策略取 `ours/theirs/union/manual`，双边分叉即冲突。服务端注册（`POST /v1/skills/import`）未在 gateway route-defs 中出现，标未知/待确认（2026-09-08）。

## 常见用法

### 你搜包

前置条件：registry 源可达。

```bash
trapmap skill registry search tdd --limit 5
```

源解析扇出由 `packages/skill-registry/src/` 下的 `services/` 层承担。

### 你看本地状态

前置条件：离线可跑；只读本地 lockfile。

```bash
trapmap skill registry status
trapmap skill registry list --json
```

lockfile 落点见本页「命令面」节。

### 你升级

前置条件：registry 源可达。

```bash
trapmap skill registry outdated
trapmap skill registry update --yes
```
