# demo-full 验收 Fixture

## 用途

本 fixture 是 Round 4+ demo 验收场景的最小输入集。包含一个完整的 Skill Artifact 所需的所有文件类型和治理字段，用于验证从 0 初始化到 activate 的全链路能力。

## 覆盖范围

| 类型 | 文件 | 说明 |
|------|------|------|
| `SKILL.md` | `SKILL.md` | 主 skill 文件，含 YAML frontmatter (name, description, labels) |
| `references/` | `references/api-guide.md` | 参考文档，参与 derivation |
| `assets/` | `assets/config.json` | 静态配置文件，activation only |
| `scripts/` | `scripts/validate.sh` | 可执行脚本，activation only |
| `boundary` | 测试代码中注入 | context, versions, prerequisites, signals, exclusions, evidence |
| `maintenanceMeta` | 测试代码中注入 | assignees, reviewCycle |
| `agentReview` | 测试代码中注入 | status: agent-pass, duplicateRisk, correctnessRisk, completenessRisk |
| `metadata` | 测试代码中注入 | sourceKind: skill-directory, submissionCount, revisionCount |

## 验收脚本

全链路验收测试已迁移至 owner-local artifact port/route 测试：

- artifact port 测试：`pnpm --filter @trapmap/service-knowledge-write test --run src/artifact-ports.test.ts`
- artifact route 测试：`pnpm --filter @trapmap/service-knowledge-write test --run src/artifact-routes.test.ts`
- PostgreSQL composition 入口测试：`pnpm test:file -- scripts/__tests__/postgres-composition-entrypoints.test.ts`

> 原 `packages/server/src/lib/artifacts/demo-acceptance.test.ts` 已随 Wave-9 store-backed fixture 退役删除。

## 验收链路

测试覆盖以下主链路环节：

1. **seed** (0→1): 从空数据库创建 agent-pass artifact
2. **review approve**: agent-pass → approved
3. **get/history**: 查询 artifact 历史和 revisions
4. **retrieval visibility**: skill-lookup search-by-content + v1 hybrid search
5. **export**: bundle-json (4 files) + distilled-json
6. **activate**: 选择性激活 4 类文件
7. **acceptance record**: 打印验收记录到 stdout

## 非目标

本 fixture 不覆盖：
- PostgreSQL 真表 round-trip（由 `pg-repository.round4.roundtrip.test.ts` 覆盖）
- Cross-table 一致性约束（由 `pg-repository.round4.consistency.test.ts` 覆盖）
- 大规模并发或性能压测
- 从已有数据库升级的兼容路径
