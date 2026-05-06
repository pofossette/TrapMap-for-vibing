# Roadmap: Skill Shareer

## Milestones

- ✅ **v1.0 MVP** — Phases 1-5 (shipped 2026-04-14)
- ✅ **v1.1 Multi-path Retrieval** — Phases 6-11 (shipped 2026-04-16)
- ✅ **v1.2 Skill-Native Retrieval** — Phases 12-16 (shipped 2026-04-17)
- ✅ **v1.3** — Phases 17-24 (shipped 2026-04-20)
- ✅ **v1.4 评测系统构建** — Phases 25-47 (shipped 2026-04-29)
- ✅ **v1.5 功能增强** — Phases 48-67 (shipped 2026-05-04)
- ✅ **v1.6 Test Coverage & Optimization** — Phases 68-76 (shipped 2026-05-04)
- ✅ **v1.7 Eval Structural Coverage & Architecture Health** — Phases 78-86 (shipped 2026-05-05)

## Phases

<details>
<summary>✅ v1.7 Eval Structural Coverage & Architecture Health (Phases 78-86) — SHIPPED 2026-05-05</summary>

### Graph-Plan Evaluation
- [x] Phase 78: Graph-Plan Evaluation (2/2 plans) — completed 2026-05-04

### God File Refactoring
- [x] Phase 80: Operations Route Refactoring (3/3 plans) — completed 2026-05-04
- [x] Phase 81: Orchestrator Decomposition (3/3 plans) — completed 2026-05-05
- [x] Phase 85: CLI Operations Refactoring (3/3 plans) — completed 2026-05-05

### Infrastructure
- [x] Phase 83: Store Decoupling (4/4 plans) — completed 2026-05-05

### Cleanup
- [x] Phase 84: Tech Debt Cleanup (3/3 plans) — completed 2026-05-05
- [x] Phase 86: Gitignore Cleanup (1/1 plan) — completed 2026-05-05

</details>

<details>
<summary>✅ v1.6 Test Coverage & Optimization (Phases 68-76) — SHIPPED 2026-05-04</summary>

### Test Coverage
- [x] Phase 68: Fix failing unit tests (1/1 plan)
- [x] Phase 69: Governance and auth route tests (3/3 plans)
- [x] Phase 70: Retrieval and indexing core tests (3/3 plans)
- [x] Phase 71: CLI and contracts tests + coverage tooling (3/3 plans)

### Performance Optimization
- [x] Phase 72: Query speed optimization (6/6 plans)
- [x] Phase 73: Memory usage optimization (1/1 plan)

### Code Quality
- [x] Phase 74: Dead code removal (1/1 plan)
- [x] Phase 75: TypeScript strict mode compliance (1/1 plan)

### Documentation
- [x] Phase 76: Documentation completion (1/1 plan)

</details>

<details>
<summary>✅ v1.5 功能增强 (Phases 48-67) — SHIPPED 2026-05-04</summary>

### Decay & Retirement
- [x] Phase 48: Lifecycle State Machine (3/3 plans)
- [x] Phase 49: Time-based Decay in Retrieval (5/5 plans)
- [x] Phase 50: Batch Management Interface (3/3 plans)

### Applicability Boundary Model
- [x] Phase 51: Boundary Schema Definition (2/2 plans)
- [x] Phase 52: Boundary Capture in Submission Flow (1/1 plan)
- [x] Phase 53: Boundary Indexing & Graph Integration (3/3 plans)
- [x] Phase 54: Boundary-aware Retrieval (completed via Phase 66)

### Conflict Detection
- [x] Phase 55: Conflict Detection & Display (1/1 plan)

### Feedback Loop
- [x] Phase 56: CLI Feedback Entry Points (4/4 plans)
- [x] Phase 57: Admin Feedback Management (3/3 plans)

### Evidence & Maintenance
- [x] Phase 58: Evidence Metadata & Verification Surface (6/6 plans)
- [x] Phase 59: Ownership & Verification SLA Management (4/4 plans)

### Write Path Optimization
- [x] Phase 60: Type Consolidation & Lifecycle State Machine (4/4 plans)
- [x] Phase 61: Candidate Pipeline Independent Table (3/3 plans)
- [x] Phase 62: Knowledge Entry Row-Level Table (4/4 plans)
- [x] Phase 63: Skill Artifact Row-Level Table & JSONB Cleanup (4/4 plans)

### Gap Closure
- [x] Phase 64: Retrieval Pipeline Integration (1/1 plan)
- [x] Phase 65: Feedback Lifecycle & Decay Route Wiring (2/2 plans)
- [x] Phase 66: Boundary-aware Retrieval Completion (4/4 plans)
- [x] Phase 67: Audit Cleanup & Documentation (1/1 plan)

</details>

## Progress

| Milestone | Phases | Plans | Status | Shipped |
|-----------|--------|-------|--------|---------|
| v1.0-v1.4 | 1-47 | 93 | Complete | 2026-04-29 |
| v1.5 | 48-67 | 58 | Complete | 2026-05-04 |
| v1.6 | 68-76 | 20 | Complete | 2026-05-04 |
| v1.7 | 78-86 | 19 | Complete | 2026-05-05 |
| v1.8 | 87-99 | — | Planned | — |

### Documentation Governance

- [ ] Phase 88: Documentation Restructuring & Synchronization (0/? plans)

### Usage Analytics

- [ ] Phase 89: Usage Analytics & Statistics (0/? plans)

### Agent-Native CLI Integration

- [ ] Phase 96: Agent-Native CLI — trapmap load (0/? plans)
- [ ] Phase 97: Agent-Native CLI — trapmap init (0/? plans)
- [ ] Phase 99: Agent-Native Verification (0/? plans)

### Phase 88: Documentation Restructuring & Synchronization

**Goal:** 重构项目文档体系——消除重复、同步代码、建立目录结构与可视化标准
**Depends on:** Phase 86

**Background:** 文档审计发现以下问题：
- 3 层 architecture.md 重复（根 / docs/ / docs/architecture/）
- ARCHITECTURE_en.md 不完整且增加维护负担
- docs/retrieval-structure-adjustment.md 和 docs/archived-plans/plan.md 为过时历史文档
- API.md 缺失 ~30 个路由、CLI.md 缺失 ~18 个命令
- CLI 命令语法与实际代码不一致
- 绝大部分文档为纯文字，缺少流程图
- docs/ 目录扁平，无主题分组

**Requirements:**

1. **消除重复文件**
   - 删除 `docs/architecture.md`（与根 `architecture.md` 重复）
   - 删除 `docs/architecture/ARCHITECTURE_en.md`（不完整的英文翻译）
   - 保留根 `architecture.md` 作为简洁概览，指向 `docs/architecture/ARCHITECTURE.md` 详版

2. **归档过时文档**
   - 将 `docs/retrieval-structure-adjustment.md` 移入 `docs/archived/`
   - 将 `docs/archived-plans/` 移入 `docs/archived/`
   - 在 `docs/archived/README.md` 中说明归档原因

3. **重建 docs/ 目录结构**（按主题分组）
   ```
   docs/
   ├── README.md              (导航枢纽，更新目录索引)
   ├── guides/                (面向用户/贡献者的操作指南)
   │   ├── GETTING_STARTED.md
   │   ├── CONTRIBUTING.md
   │   └── CODE_GUIDE.md
   ├── reference/             (API/CLI/数据模型等查阅性文档)
   │   ├── api-surface.md
   │   ├── DATA_MODEL.md
   │   ├── GLOSSARY.md
   │   └── PERFORMANCE.md
   ├── operations/            (运维/安全/环境配置)
   │   ├── SECURITY.md
   │   ├── ENVIRONMENT.md
   │   └── TESTING.md
   └── architecture/          (保持现有，不变)
   ```

4. **同步 API.md 与实际路由**（~30 个缺失路由）
   - 遍历 `packages/server/src/routes/` 所有路由文件
   - 补全 feedback, decay, maintenance, candidates, boundary-search, operations/* 等路由
   - 修正 v2/v3 版本描述
   - 标注废弃路由

5. **同步 CLI.md 与实际命令**（~18 个缺失命令）
   - 遍历 `packages/cli/src/commands/` 所有命令文件
   - 补全 evidence, feedback, feedback-list, feedback-batch, maintenance, decay, about 等命令
   - 修正语法不一致（search:v2 → search --v2, trap create → trap submit 等）

6. **添加 Mermaid 流程图**（替代纯文字叙述）
   - ARCHITECTURE.md: 系统分层架构图、请求生命周期流程图
   - FLOW.md: 核心数据流（提交→审核→索引→检索）用 Mermaid sequenceDiagram
   - KNOWLEDGE_LIFECYCLE.md: 状态机转换用 Mermaid stateDiagram-v2
   - INGESTION.md: 异步摄取管道用 Mermaid flowchart
   - RETRIEVAL.md: 检索管道多阶段流程图
   - SECURITY.md: 认证/授权流程图

7. **修正文档与代码不一致**
   - 生命周期状态大小写（draft → DRAFT）
   - 删除不存在的脚本引用（setup-db.sh, seed.sh）
   - 更新 PACKAGES.md 中的依赖图

8. **更新导航文档**
   - `docs/README.md` 反映新目录结构
   - `AGENTS.md` 的链接全部更新
   - `README.md` 的文档链接全部更新

**Success Criteria:**
- [ ] 无重复的 architecture 文件（仅保留 2 个：根概览 + 详版）
- [ ] ARCHITECTURE_en.md 已删除
- [ ] 过时文档已归档到 docs/archived/
- [ ] docs/ 按主题分为 guides/ reference/ operations/ architecture/ 四个子目录
- [ ] API.md 覆盖 100% 的实际路由
- [ ] CLI.md 覆盖 100% 的实际命令，语法与代码一致
- [ ] 至少 6 个架构/流程文档包含 Mermaid 流程图
- [ ] 所有文档中的代码引用（类型名、命令、路径）经 typecheck 验证无误
- [ ] AGENTS.md 和 README.md 的链接全部可访问
- [ ] 无断链或指向已删除文件的引用

---

### Type Hygiene

- [x] Phase 87: Type & State Machine Centralization (3/3 plans) — completed 2026-05-06

Plans:
- [x] 087-01-PLAN.md — Decompose store.ts into domain-separated store/ directory
- [x] 087-02-PLAN.md — Create state-machines/index.ts barrel export
- [x] 087-03-PLAN.md — Create lib/types.ts unified entry + compile verification test

### Phase 87: Type & State Machine Centralization ✅

**Goal:** 集中导出 server 包的散落类型、枚举和状态机，建立统一的 barrel re-export 体系
**Depends on:** Phase 86
**Completed:** 2026-05-06

**Requirements:**
1. 将 `store.ts` 中 35+ 个 record 接口拆分到 `store/types/` 目录（按领域：knowledge-records.ts, skill-records.ts, system-records.ts 等）
2. 创建 `server/src/lib/types.ts` 统一 re-export 所有子模块类型（indexing, retrieval, ai, candidates, governance, store 等）
3. 为 decay 和 lifecycle 状态机创建统一导出点（`state-machines/index.ts`）
4. 所有现有 import 路径保持 backward-compatible（旧路径 re-export 自新位置）
5. 添加类型导出的编译验证测试

**Success Criteria:**
- [x] store.ts 中的接口按领域拆分到独立文件
- [x] 存在 `lib/types.ts` 作为所有 server 类型的统一入口
- [x] 状态机有统一的 barrel 导出
- [x] 所有现有 import 路径不受影响（typecheck 通过）
- [x] 现有测试全部通过

### Phase 89: Usage Analytics & Statistics

**Goal:** 实现面向组织管理员和系统管理员的使用统计功能，包括请求次数（按组织/账户）、skill/trap 检索命中计数、热门条目排行、以及统计查询 API
**Depends on:** Phase 86

**Requirements:**

1. **usage_events 数据表**
   - 创建 `usage_events` 数据库表，记录每次检索请求
   - 字段：id, organization_id, account_id, entry_type (skill/trap/knowledge), entry_id, query_text (optional), created_at
   - 异步写入，不阻塞检索管道主路径

2. **检索管道埋点**
   - 在检索管道（orchestrator/检索路由）中添加埋点
   - 每次成功检索后异步写入 usage_events 表
   - 记录命中条目的 entry_type 和 entry_id

3. **使用量统计 API — GET /v1/operations/stats/usage**
   - 支持按组织、账户、时间范围筛选请求次数
   - 支持按日/周/月粒度聚合
   - 返回请求次数时间序列数据

4. **命中排行 API — GET /v1/operations/stats/hits**
   - 返回 skill/trap 的检索命中排行（Top N）
   - 支持按时间范围筛选
   - 支持按 entry_type 过滤

5. **系统汇总 API — GET /v1/operations/stats/summary**
   - 返回系统级汇总：总请求数、活跃组织数、活跃用户数
   - 支持按时间范围筛选

6. **权限控制**
   - 组织管理员可查看本组织的统计数据
   - 系统管理员（admin）可查看全部统计
   - 普通用户无权访问统计接口

7. **索引优化**
   - 为 usage_events 表创建查询索引
   - 索引字段：organization_id, account_id, created_at, entry_type
   - 复合索引覆盖常用查询模式

8. **数据归档机制**
   - 超过 90 天的原始事件可归档或聚合为日汇总表
   - 提供归档 CLI 命令或定时任务
   - 归档后保留聚合数据，删除原始明细

**Success Criteria:**
- [ ] usage_events 表创建完成，包含所有必要字段和索引
- [ ] 检索管道埋点生效，异步写入不影响检索延迟
- [ ] GET /v1/operations/stats/usage 返回按组织/账户/时间的请求计数
- [ ] GET /v1/operations/stats/hits 返回 skill/trap 的 Top N 命中排行
- [ ] GET /v1/operations/stats/summary 返回系统级汇总数据
- [ ] 权限控制正确：组织管理员仅可见本组织数据，admin 可见全部
- [ ] 统计查询性能满足要求（P95 < 200ms）
- [ ] 归档机制可在 90 天后清理原始事件并保留聚合数据
- [ ] 所有新增 API 有对应的单元测试和集成测试

### Phase 96: Agent-Native CLI — trapmap load

**Goal:** 实现 `trapmap load` 命令，封装 检索→筛选→激活→格式化 为单条命令，输出 agent 可直接消费的 markdown context block，并重写 SKILL.md 使用精简 workflow
**Depends on:** Phase 86

**Requirements:**
1. 创建 `packages/cli/src/lib/markdown-formatter.ts` — `formatLoadMarkdown()` 格式化函数
2. 创建 `packages/cli/src/commands/load.ts` — `trapmap load "<seed>" --phase planning|implementation [--max-results 3] [--json]`
3. Planning phase 调用 `/v1/skills/search-by-content`，Implementation phase 调用 `/v2/retrieval/search`
4. Top N matches 自动激活（调用 `/v1/operations/artifacts/activate`）
5. 默认输出 markdown，`--json` 输出原始 JSON
6. 注册命令到 `packages/cli/src/index.ts`，受 `allowSearch` 权限控制
7. Control Path 简化为 3 步：`trapmap load --phase planning` → `trapmap load --phase implementation` → 验证
8. 删除 `references/retrieval.md`（被 `trapmap load` 封装）
9. 删除 `references/artifacts.md`（被 `trapmap load` 封装）
10. 保留 `references/accumulation.md`, `registration.md`, `review.md`
11. Guardrails 保持安全相关条目

**Success Criteria:**
- [ ] `trapmap load --phase planning "<seed>"` 返回包含 capsule 内容 + 已激活文件的 markdown
- [ ] `trapmap load --phase implementation "<seed>"` 返回 trap-first markdown
- [ ] 脚本/资产的 policy 警告正确显示在 markdown 中
- [ ] SKILL.md 仅通过 `trapmap load` 指导 agent
- [ ] 无已删除文件的残留引用
- [ ] 保留的 reference 文件完好
- [ ] 所有单元测试通过

### Phase 97: Agent-Native CLI — trapmap init

**Goal:** 实现 `trapmap init` 命令，通过 `npx skills add` 将精简版 skill 安装到目标 agent 环境
**Depends on:** — (独立于 Phase 96)

**Requirements:**
1. 创建 `packages/cli/src/commands/init.ts` — `trapmap init [--agent claude-code|cursor|codex] [--repo <url>] [--global]`
2. 自动检测已安装 agent（`.claude/`, `.cursor/`, `.codex/`）
3. 多个 agent 时交互式选择
4. 委托 `npx skills add` 执行安装
5. 不需要 session auth（本地操作）

**Success Criteria:**
- [ ] `trapmap init` 正确检测 agent 环境并安装 skill
- [ ] `--agent` 参数手动指定 agent 生效
- [ ] npx 不可用时给出有用的错误信息
- [ ] 单元测试通过

### Phase 99: Agent-Native Verification

**Goal:** 验证 Phase 96-97 所有实现的端到端正确性
**Depends on:** Phase 96, Phase 97

**Requirements:**
1. 验证 scripts/assets 在 markdown 输出中正确消费（body content 内联）
2. 验证所有 policy 类型（needs-approval, blocked）的警告正确显示
3. 验证 mediaType 到代码块语言标签的映射
4. 全量 CLI 测试通过
5. 全项目 TypeScript 编译通过
6. 验证 SKILL.md 重写完整性（无残留引用）

**Success Criteria:**
- [ ] `pnpm --filter @trapmap/cli test` 全部通过
- [ ] `pnpm -r exec tsc --noEmit` 无错误
- [ ] Scripts 和 assets 的 body 正确出现在 markdown 中
- [ ] 无断链或指向已删除文件的引用

### Phase 100: Store Repository Pattern — Domain-specific repository interfaces to replace raw StoreData access

**Goal:** 将 SkillShareerStore 的 snapshot/transact 裸操作替换为领域级 Repository 接口，使路由层不再直接依赖 StoreData 结构，同时让 Json/PG 双实现路径对称
**Depends on:** Phase 99

**Requirements:**

1. **定义领域 Repository 接口**
   - 创建 `KnowledgeRepo` 接口：CRUD + 按状态查询 + 生命周期转换 + 索引状态更新
   - 创建 `TeamRepo` 接口：CRUD + slug 查询
   - 创建 `MembershipRepo` 接口：CRUD + 按用户/团队查询 + 权限检查
   - 创建 `SessionRepo` 接口：创建/验证/销毁会话
   - 创建 `AccessKeyRepo` 接口：发放/撤销/验证密钥
   - 创建 `UserRepo` 接口：CRUD + handle 查询
   - 创建 `CandidateRepo` 接口：提交/状态流转/重复检测
   - 创建 `ArtifactRepo` 接口：CRUD + 工件生命周期

2. **JsonStore 实现所有 Repository 接口**
   - 每个接口提供基于 StoreData 操作的 Json 实现
   - 复用现有 transact() 保证原子性
   - 保持向后兼容：过渡期 SkillShareerStore 仍可用

3. **PG 实现对齐**
   - 现有 createXxxRepository() 函数签名对齐新接口
   - 确保 Json/PG 实现行为一致性（测试验证）

4. **路由层迁移**
   - 将路由中对 StoreData 的直接操作替换为 Repository 接口调用
   - app.ts 的 skillShareer decorator 类型从 any 改为具体接口类型
   - onReady 钩子中的 repo 初始化统一为两种路径都执行

5. **类型拆分**
   - 将 store.ts 中 35+ 个 Record 接口按领域拆分到 `store/types/` 目录
   - 创建 `lib/types.ts` 统一 re-export

**Success Criteria:**
- [ ] 所有 8 个 Repository 接口定义完成，每个有独立文件
- [ ] JsonStore 和 PG 分别实现所有接口
- [ ] 路由层零处直接访问 StoreData（typecheck 验证）
- [ ] skillShareer decorator 类型安全（无 any）
- [ ] 现有测试全部通过，行为无回归
- [ ] store.ts 中的 Record 接口按领域拆分完成

### Phase 101: Lifecycle State Machine with Event Bus — Explicit state machine for knowledge lifecycle with domain event system

**Goal:** 将知识条目的 LifecycleState 转换规则从散落在路由/if-else 中提升为显式状态机定义，并引入领域事件机制使索引同步、审计记录、通知等解耦为事件订阅者
**Depends on:** Phase 100

**Requirements:**

1. **显式状态机定义**
   - 创建 `lifecycle-machine.ts`：声明式定义所有合法状态转换（`draft→submitted→agent-pass→approved→deactivated` 等）
   - 每条转换包含：from、to、guard（权限/前置状态检查）、event（触发的事件名）
   - 提供 `canTransition(current, target, ctx): boolean` 和 `executeTransition(current, target, ctx): TransitionResult`

2. **领域事件系统**
   - 创建 `lib/events/event-bus.ts`：轻量 EventEmitter 封装，支持 `publish(event)` 和 `subscribe(event, handler)`
   - 定义核心领域事件：`knowledge.submitted`、`knowledge.approved`、`knowledge.rejected`、`knowledge.deactivated`、`knowledge.updated`、`artifact.approved`、`artifact.deactivated`
   - 事件 payload 包含：entryId、fromState、toState、actor、timestamp

3. **索引管道事件订阅**
   - `indexing/events.ts` 订阅 `knowledge.approved` → 触发 upsert
   - `indexing/events.ts` 订阅 `knowledge.deactivated` → 触发 remove
   - 替换当前路由中的手动 `syncKnowledgeIndex()` 调用

4. **审计事件订阅**
   - 审计记录模块订阅所有领域事件，自动写入审计日志
   - 替换路由中的手动 `recordAudit()` 调用

5. **候选管道事件订阅**
   - 候选处理订阅 `knowledge.submitted` 触发重复检测
   - 替换路由中的手动候选创建调用

6. **路由层简化**
   - 路由只做：验证请求 → 调用状态机 `executeTransition()` → 返回响应
   - 所有副作用（索引、审计、候选、通知）通过事件自动触发

**Success Criteria:**
- [ ] 状态机定义覆盖所有 LifecycleState 转换路径
- [ ] 非法转换被状态机拒绝（测试覆盖所有非法路径）
- [ ] 索引同步完全由事件驱动，路由层无直接调用
- [ ] 审计记录完全由事件驱动，路由层无直接调用
- [ ] 现有测试全部通过，行为无回归
- [ ] 新增状态或事件只需扩展状态机定义，不需改路由

### Phase 102: IndexAdapter Generalization and Retrieval Plugin — Dynamic adapter registry with pluggable recall channels

**Goal:** 将 IndexAdapter 的 kind 字段从固定联合类型泛化为字符串注册表，并将检索管道的召回通道抽象为可插拔接口，使新增索引/召回通道无需修改核心 pipeline 和 orchestrator
**Depends on:** Phase 101

**Requirements:**

1. **IndexAdapter 注册表**
   - `IndexAdapter.kind` 从 `'vector' | 'keyword' | 'graph'` 改为 `string`
   - 创建 `AdapterRegistry` 类：`register(adapter)` / `get(kind)` / `all()`
   - `KnowledgeIndexStateRecord` 中 vector/keyword/graph 固定字段改为 `Map<string, AdapterSyncState>` 动态结构
   - pipeline fan-out 遍历注册表而非固定数组

2. **RecallChannel 接口**
   - 定义 `RecallChannel` 接口：`{ name: string, recall(query, ctx): Promise<RecallCandidate[]>, scoreNormalizer(candidate): number }`
   - 现有 semantic/keyword/graph 各自实现该接口
   - orchestrator 通过注册的 channel 列表动态 fan-out 召回

3. **检索策略模式**
   - 将 `routing.ts` 中的 if-else 版本分派改为策略注册表
   - 定义 `RetrievalStrategy` 接口：`{ version: string, execute(query, channels): Promise<RetrievalResponse> }`
   - v1/v2/v3 各自实现策略，新增版本只需注册

4. **Score 融合框架**
   - 定义 `ScoreFusion` 接口：`{ name, fuse(candidates[]): MergedCandidate[] }`
   - 实现 RRF (Reciprocal Rank Fusion) 融合器
   - 可替换为自定义融合策略

5. **配置驱动**
   - 通过环境变量或配置文件控制启用哪些 adapter 和 channel
   - `INDEX_ADAPTERS=vector,keyword,graph` 或 `RECALL_CHANNELS=semantic,keyword,graph`
   - 未启用的 adapter/channel 跳过注册

**Success Criteria:**
- [ ] AdapterRegistry 支持运行时注册/查询任意 kind 的适配器
- [ ] KnowledgeIndexStateRecord 使用动态 Map 而非固定字段
- [ ] RecallChannel 接口有 3 个实现（semantic/keyword/graph）
- [ ] routing.ts 无 if-else 版本判断，改为策略查找
- [ ] 通过配置可禁用任意 adapter 或 channel
- [ ] 现有测试全部通过，行为无回归

### Phase 103: CLI Dynamic Registration and Transport Abstraction — Plugin-based command discovery with pluggable transport layer

**Goal:** 将 CLI 命令注册从手动逐一 import 改为目录扫描自动发现，并将 HTTP 调用抽象为 Transport 接口，使 CLI 可支持多种传输方式（HTTP、gRPC、进程内直连）
**Depends on:** Phase 102

**Requirements:**

1. **Transport 接口抽象**
   - 定义 `Transport` 接口：`{ call(method: string, params: Record<string, unknown>): Promise<unknown>, healthCheck(): Promise<boolean> }`
   - 创建 `HttpTransport` 实现：封装现有 `lib/http.ts` 的 fetch 调用
   - 创建 `InProcessTransport` 实现：直接调用 server app.inject()，用于测试和嵌入式场景
   - Transport 工厂根据配置选择实现

2. **命令自动发现**
   - 约定：`src/commands/` 下每个 `.ts` 文件导出 `register(app, transport, visibility)` 函数
   - `index.ts` 启动时 glob 扫描 `commands/*.ts`，动态 import 并注册
   - 新增命令只需添加文件，不需改 index.ts

3. **命令注册标准化**
   - 统一命令注册签名：`register(app: Command, ctx: CommandContext)` 其中 `CommandContext = { transport, visibility, config }`
   - 现有命令迁移到新签名（机械性重构）

4. **输出格式化策略**
   - 定义 `OutputFormatter` 接口：`{ success(data), error(err), table(rows, columns) }`
   - 创建 `HumanFormatter`（ANSI 表格）和 `JsonFormatter`（JSON 模式）
   - 通过 `--json` flag 或配置选择格式化器

5. **配置统一**
   - CLI 配置（session、team、format）通过 `CommandContext.config` 传递
   - 消除各命令中重复的 `loadCliState()` 调用

**Success Criteria:**
- [ ] Transport 接口有 HttpTransport 和 InProcessTransport 两个实现
- [ ] index.ts 通过目录扫描自动发现命令，无手动 import
- [ ] 所有命令使用统一 `register(app, ctx)` 签名
- [ ] `--json` 通过 OutputFormatter 策略实现
- [ ] 新增命令只需添加文件到 commands/ 目录
- [ ] 现有测试全部通过，行为无回归

---

*Roadmap updated: 2026-05-06 — Merged Phase 98 into Phase 96; v1.8 now has 6 phases (87-99, skipping 98)*
