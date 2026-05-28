# Server Routes

Fastify 路由模块，每个文件对应一组 API 端点。

## 路由文件

| 文件 | 端点 |
|------|------|
| `access-keys.ts` | Access Key 管理 |
| `admin-benchmark.ts` | 管理基准测试 |
| `admin-boundary-search.ts` | 边界搜索管理 |
| `auth.ts` | 认证 |
| `candidates.ts` | 候选管理 |
| `decay.ts` | 衰减操作 |
| `evidence.ts` | 证据管理 |
| `feedback.ts` | 反馈 |
| `feedback-admin.ts` | 反馈管理 |
| `knowledge.ts` | 知识条目 |
| `maintenance.ts` | 维护任务 |
| `members.ts` | 成员管理 |
| `operations.ts` | 操作管理 |
| `retrieval.ts` | 检索 |
| `review.ts` | 审核 |
| `teams.ts` | 团队管理 |
| `traps.ts` | 陷阱管理 |

## 子目录

- `candidates/` — 候选相关子路由
- `operations/` — 操作相关子路由

## 约定

- 每个路由文件导出一个 Fastify 插件函数
- 测试文件与路由文件同目录（`*.test.ts`）
- Nyquist 测试使用 `*.nyquist.test.ts` 后缀
