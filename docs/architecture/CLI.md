# TrapMap CLI 参考

> 本文档记录 `apps/cli` 实现出来的命令面。更细的行为以 `trapmap <command> --help` 和 `@trapmap/contracts` 为准。状态：Active。

## 基本规则

- 你只连统一 gateway，不直连内部微服务（三档 profile 下一致，见 [TrapMap 部署指南](DEPLOYMENT.md)）。
- 命令按会话权限做可见性裁剪（`apps/cli/src/index.ts:138-193` 的 `register*Commands` 按 `visibility` 开关注册）。
- 输出只携带 additive debug 句柄：`requestId`、`traceId`、`queryId`、`feedbackId`、`asyncJobId`。

## 命令分组

注册入口在 `apps/cli/src/index.ts`，命令实现在 `apps/cli/src/commands/`（20 个顶层命令文件 + `operations/` 与 `skill/` 2 个子目录）。

| 分组 | 命令文件 | 说明 |
|---|---|---|
| 身份与团队 | `auth.ts`、`team.ts`、`member.ts` | 登录、团队、成员管理 |
| 知识读写 | `knowledge.ts`、`knowledge-entry-commands.ts`、`trap.ts`、`load.ts` | 条目提交、查询、Trap 视图、批量载入 |
| 检索 | `retrieval.ts`、`policy.ts` | 检索搜索与策略 |
| 审核治理 | `review.ts`、`decay.ts`、`maintenance.ts`、`evidence.ts`、`audit.ts` | 审核队列、decay、maintenance、证据、审计 |
| 反馈 | `feedback.ts`、`feedback-admin.ts` | 反馈提交与后台管理 |
| 定时任务 | `cron.ts` | cron 任务管理 |
| 运维 | `operations.ts` + `operations/`（`activate/deactivate/import/export/edit/list/migrate/capsule-index`） | 工件运维面 |
| Skill | `skill.ts` + `skill/`（`search/apply/review/history/versions/registry/find/edit`） | Skill 工件与 registry（见 [Skill Registry 与版本管理](SKILL-REGISTRY.md)） |
| 输出 | `output-profile.ts` | 输出风格配置 |
| 内建 | `about`、`api:list`、`add`（`apps/cli/src/index.ts:88-111`） | 版本信息、路由表、快捷新增 |

库层在 `apps/cli/src/lib/`：`config.ts`、`http.ts`、`input.ts`、`output.ts`、`markdown-formatter.ts`、`output-profile.ts`、`prompts.ts`、`sanitize.ts`、`skill-artifact-export.ts`、`activation-policy.ts`、`artifact-bundle.ts`。状态文件在 `~/.trapmap/cli.json`。

## 示例

```bash
trapmap about
trapmap api:list
trapmap knowledge --help
trapmap retrieval --help
trapmap skill registry search tdd --limit 5
```

## 常见用法

### 你确认 CLI 连通性

前置条件：`about` 离线可跑；其余需 gateway 运行中。

```bash
trapmap about
trapmap api:list
```

注册与裁剪逻辑在 `apps/cli/src/index.ts:138-193`。

### 你查单命令用法

前置条件：离线可跑。

```bash
trapmap knowledge --help
trapmap retrieval --help
```

### 你搜 Skill

前置条件：gateway 运行中；registry 源可达。

```bash
trapmap skill registry search tdd --limit 5
```

lockfile 落点与版本语义见 [Skill Registry 与版本管理](SKILL-REGISTRY.md)。
