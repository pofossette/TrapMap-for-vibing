# Phase 85: CLI Operations Refactoring

## Context

`packages/cli/src/commands/operations.ts` 目前有 1060 行代码，是 CLI 端最大的命令文件。

## Current Responsibilities

1. **list** — 列出 knowledge 条目
2. **edit** — 编辑 knowledge 条目
3. **deactivate** — 停用 knowledge 条目
4. **export** — 导出 knowledge 条目
5. **artifact-export** — 导出 skill artifact
6. **import** — 导入 knowledge 或 artifact
7. **activate** — 激活 artifact
8. **migrate** — 迁移 legacy knowledge
9. **status** — 兼容性状态

## Problem

1. **单文件过大** — 1060 行超出健康阈值
2. **辅助函数混杂** — `buildArtifactBundle`, `scanSkillDirectory`, `parseSkillMetadata` 等与命令注册混在一起
3. **与 server 端 operations 对应** — 应该与 server 端拆分保持一致

## Goals

1. 将大文件拆分为独立命令模块
2. 辅助函数移至 lib 目录
3. 主文件仅负责命令注册

## Proposed Structure

```
packages/cli/src/
├── commands/
│   ├── operations.ts        # 主入口，仅注册命令 (~50 行)
│   └── operations/
│       ├── list.ts          # list 命令 (~80 行)
│       ├── edit.ts          # edit 命令 (~80 行)
│       ├── deactivate.ts    # deactivate 命令 (~60 行)
│       ├── export.ts        # export + artifact-export (~200 行)
│       ├── import.ts        # import 命令 (~200 行)
│       ├── activate.ts      # activate 命令 (~150 行)
│       ├── migrate.ts       # migrate 命令 (~150 行)
│       └── status.ts        # status 命令 (~80 行)
└── lib/
    └── artifact-bundle.ts   # buildArtifactBundle, scanSkillDirectory 等 (~200 行)
```

## Acceptance Criteria

- [ ] `operations.ts` 主文件 < 100 行
- [ ] 每个命令文件 < 250 行
- [ ] 辅助函数移至 lib 目录
- [ ] 所有现有测试通过
- [ ] CLI 命令行为保持不变

## Dependencies

- Phase 80 (server 端 operations 拆分，建议先完成)

## Estimated Effort

Medium (4-6 hours)

## Related

- Phase 80: Operations Route Refactoring (server 端)
