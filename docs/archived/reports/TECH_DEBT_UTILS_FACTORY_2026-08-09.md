# 技术债分析：重复工具函数回潮与工厂模式一致性（2026-08-09）

> 分析范围：`packages/*` 生产代码 + `scripts/`、`evals/`。方法：全局符号/模式扫描（`rg`）+ codegraph 结构核对，对照 [`TECH_DEBT_UTILS_TYPES_2026-08-08.md`](TECH_DEBT_UTILS_TYPES_2026-08-08.md) 的迁移清单检查回潮。
> 本报告是人工分析产物，按 [REPO_STRUCTURE](../../reference/REPO_STRUCTURE.md) 规则归档于 `docs/archived/reports/`；应转入长期债务登记的条目见文末「建议登记条目」。
>
> **更新记录（2026-08-09 同日第二版）**：第 3、4 节全部发现已在本日修复落地（lib 新增 3 个工具 + 消费方迁移 + 死代码删除 + 工厂收敛），详见第 7 节实施记录。`AGENTS.md` 工具清单与 `docs/todos/open-debt-and-compromises.md` 对应条目已同步为「已缓解」。

## 1. 结论摘要

| 维度 | 结论 |
|---|---|
| lib 迁移后的主体状态 | **良好**：`nowIso`/`timestamp`/`formatDate`/`timeout`/`truncate`/`uniqBy`/`sha256` 生产消费方已改用 `@trapmap/lib`（见第 2 节），无回潮 |
| 新发现的重复工具函数 | **5 类**：`hashSecret`×3、`asRecord`/`isRecord`×3（两处逐字相同）、label 归一化 `normalize*`×6（5 处逐字相同）、前缀 ID 生成×5（同包内两处逐字相同）、非 crypto 随机 ID `Math.random().toString(36)`×4 |
| 死代码/无人消费导出 | `service-knowledge-write/knowledge-deps/store-utils.ts`（`hashSecret`/`createOpaqueToken`/`createSlug` 无消费者）、`backend-core/src/discovery/{cached-discovery,round-robin-selector}.ts`（仅测试消费，生产用 `DynamicDiscovery`） |
| 工厂模式一致性 | **主体合规**：`adapter-factory.ts`、`createXxxDeps`/`createXxxServiceModule`、`createInternalServiceClients` 等是标准范例；**3 处失范**：`createLabelReadProjection` 命名与实现不符、discovery 链在 gateway `server.ts` 内联 `new` 且重复构造、backend-core 两套 discovery 实现重叠 |

## 2. `@trapmap/lib` 迁移状态核对（回潮检查）

上一版报告（2026-08-08）的迁移清单当前状态：

- `nowIso`：生产消费全部走 lib（`search-knowledge.ts:301`、`documents.ts:68/93`、`backend-core-adapters.ts` 等），**无回潮**。
- `truncate`：`response-summary.ts:134` 用 lib；`contextual-enrichment.ts` 的 `truncateForPrompt` 仍是有意保留（段落边界截断，lib 注释已记录），**符合预期**。
- `timeout`：`resilience.ts` 用 lib；`internal-client.ts`（AbortController 取消）与 `processing-task-queue.ts`（poll 间隔）仍是有意保留，**符合预期**。
- `uniqBy`：`pg-ports.ts:139`、`labels/backfill.ts:92` 均用 lib，**无回潮**。
- `sha256`：`artifact-bundle.ts` 用 lib；但 **`hashSecret` 仍以本地实现存在于 3 处**（见下），属于 lib `sha256` 可直接替代的场景。

## 3. 重复实现的工具函数（新发现 / 遗留）

### 3.1 `hashSecret` × 3（lib `sha256` 可直接替代）

逐字相同的 `createHash('sha256').update(x).digest('hex')`：

| 位置 | 备注 |
|---|---|
| `host-local/src/nest/runtime/auth-context.ts:15` | 模块内私有函数 |
| `service-knowledge-write/src/knowledge-deps/store-utils.ts:3` | 导出但**无任何消费者**（死代码，见 3.5） |
| `evals/retrieval/lib/adapters.ts:36` | eval 测试适配器 |

lib `sha256`（`packages/lib/src/hash.ts:17`）返回类型即 `Sha256Hex`，三处均可直接替换；`store-utils.ts` 若保留则整体挪入 lib 或删除。

### 3.2 `asRecord` / `isRecord` × 3（两处逐字相同）

- `service-knowledge-write/src/knowledge-snapshot-owner.ts:12` 与 `wave9-artifact-snapshot-owner.ts:12`：**逐字相同**（同包两个 snapshot owner 文件，`allRevisions` 也在两处重复）。
- `contracts/src/domain/parsing.ts:141` 的 `isRecord`（排除数组）与 `host-distributed/src/governance-review/conflict-read.ts:11` 的 `isRecord`（不排除数组）——**语义有差异**，合并时需保留各自语义。

### 3.3 Label 归一化 `normalizeLabel`/`normalizeValue`/`normalizeGraphLabel` × 6（5 处逐字相同）

逐字相同的 `value.toLowerCase().trim().replace(/\s+/g, '-')`：

| 位置 | 名称 |
|---|---|
| `service-knowledge-write/src/labels/backfill.ts:171` | `normalizeLabel` |
| `service-knowledge-write/src/labels/candidate-recall.ts:158` | `normalizeLabel` |
| `service-knowledge-write/src/labels/repository/pg-repository.ts:408` | `normalize`（私有方法） |
| `service-knowledge-write/src/labels/graph-align.ts:190` | `normalizeValue` |
| `service-knowledge-read/src/graph-llm-extract/llm-extract-ids.ts:10` | `normalizeValue`（已导出，可复用） |
| `contracts/src/domain/graph-query.ts:129` | `normalizeGraphLabel`（同语义，契约层私有） |

`contracts` 的 `graph-query.ts` 与 `llm-extract-ids.ts` 已导出同名同语义实现，`service-knowledge-write/labels/` 下 4 处应统一引用同一实现（注意 `contracts` 不得反向依赖业务包，落点需选在 `contracts` 或 `@trapmap/lib`）。

### 3.4 前缀 ID 生成 × 5（同包内两处逐字相同）

`${prefix}_${randomUUID().replaceAll('-', '').slice(0, N)}` 模式：

| 位置 | 细节 |
|---|---|
| `service-knowledge-write/src/pg-ports.ts:51`（`generateId`）与 `artifact-ports.ts:64`（`id`） | **同包、逐字相同**（`slice(0,16)`），应立即合并 |
| `service-knowledge-read/src/rag-log.ts:83` | `qry_` + `slice(0,12)` |
| `service-governance-review/src/pg-ports.ts:167` | `feedback_` + `slice(0,12)` |
| `service-governance-review/src/conflict-workflow.ts:99` | `conflict_` + 全量 UUID |

另外 `service-knowledge-write/src/knowledge-deps/next-sub-id.ts` 是 `randomUUID()` 的零包装模块，与 `generateId` 职责重叠。

### 3.5 非 crypto 随机 ID `Math.random().toString(36)` × 4

| 位置 | 说明 |
|---|---|
| `ai-providers/src/ai-dynamic/context-resolver.ts:96` | `session-${Date.now()}-...` |
| `service-job-runtime/src/rabbitmq-task-transport.ts:121` | `rtmq_${Date.now()}_...` |
| `service-knowledge-write/src/labels/backfill.ts:129` | `backfill_${Date.now()}_...` |
| `service-knowledge-write/src/labels/llm-align.ts:287` | `align_${Date.now()}_...` |

无冲突语义需求，可统一为 `randomUUID()`（或保留前缀化 helper）。

### 3.6 死代码 / 无人消费导出

- **`service-knowledge-write/src/knowledge-deps/store-utils.ts`**：`hashSecret`/`createOpaqueToken`/`createSlug` 全仓库无导入方（含 `scripts/`、`evals/`）。若保留 `hashSecret`/`createSlug` 能力应挪入 `@trapmap/lib` 并补测试，否则删除。
- **`backend-core/src/discovery/cached-discovery.ts` + `round-robin-selector.ts`**：TTL 缓存 + round-robin 组合实现，**生产代码零消费者**（仅自身测试与 `discovery/index.ts` re-export）。生产实际使用 `runtime/dynamic-discovery.ts`（一体化实现），详见第 4 节。

### 3.7 边界内的近似重复（记录不处理）

- `web-panel/src/shared/lib/json-editor.ts` 的 `parseJsonDraft` 与 `ai-providers/src/ai-parse.ts` 的 `parseJsonWithSchema`：模式相似但分别服务浏览器 UI 与 LLM 解析，`web-panel` 未开放 `lib` zone，不属合并范围。
- `host-distributed/src/gateway/server.ts` 的 `normalizeLabels`/`labelKey` 与 `internal-observability.ts` 的 `formatPrometheusLabels`：metrics label 排序格式化重复，量小且各自内联，暂记录。
- `evals/retrieval/lib/adapters.ts` 与 `host-local/auth-context.ts` 的 `hashSecret` 已并入 3.1 条目。

## 4. 工厂模式一致性核查

### 4.1 合规范例（无问题）

- `host-local/src/nest/adapters/adapter-factory.ts`：`createKnowledgeReadAdapter` 带参数校验、注释、mode 分支——标准工厂。
- 各 service 的 `createXxxDeps` + `createXxxServiceModule` 模式（`deps.ts`）一致。
- `host-distributed` 的 `createInternalServiceClients`、`createRemoteKnowledgeWriteClient`、`createServiceDatabase`。
- `backend-core` 各 context 的 `createXxxModule(deps)` 工厂。

### 4.2 问题 1：`createLabelReadProjection` 命名与实现不符

- `service-knowledge-write/src/labels/repository/factory.ts:15` 名为 `createLabelReadProjection`，实际返回完整 `LabelRepository`（读+写+事件），而 `artifact-ports.ts:300` 的 `createArtifactReadProjection` 返回纯只读 `ArtifactReadProjection`。命名暗示只读投影，实现是完整仓储。
- 仅 `scripts/label-runner.ts` 消费该工厂；`PgLabelRepository` 类本身也直接导出，存在绕过工厂直接 `new` 的旁路（当前生产未使用，测试在用）。
- 建议：改名 `createPgLabelRepository`（或统一命名规则），并决定工厂是否为唯一构造入口。

### 4.3 问题 2：discovery 链在 gateway `server.ts` 内联 `new` 且重复构造

`host-distributed/src/gateway/server.ts`：
- 282-291 行：`new ConsulDiscoveryAdapter` → `new DynamicDiscovery` → `new DiscoveryResolver` 内联组装；
- 336-343 行：注销路径**再次** `new ConsulDiscoveryAdapter`（同一配置重复构造，logger 形状 shim 也复制了一份）。
- 与 `host-local` 的 Nest DI（`ConsulService`）构成两套不一致的组装方式；backend-core 已有 `CachedDiscovery`/`RoundRobinSelector` 组合却未接线。
- 建议：抽出 `createDiscoveryResolver(config)` 工厂（放 `host-distributed/gateway/`），register/deregister 共用同一 adapter 实例，消除重复构造。

### 4.4 问题 3：backend-core 两套 discovery 实现重叠

- `discovery/cached-discovery.ts` + `round-robin-selector.ts`（组合式、带 stats 观测）与 `runtime/dynamic-discovery.ts`（一体化 TTL cache + round-robin）功能重叠。
- 生产只走 `DynamicDiscovery`；组合式实现从未接线——属于「建了组合/工厂却无人消费」的半成品，是工厂模式最典型的失范形态。
- 建议：二选一收敛（推荐保留组合式并让 `DynamicDiscovery` 退化为组合的薄封装，或删除组合式），消除死代码与双实现漂移风险。

## 5. 影响与触发条件

| 类别 | 影响 | 触发条件 |
|---|---|---|
| `hashSecret`/`normalize*`/前缀 ID 重复 | 语义漂移风险低但复制成本持续；改一处漏一处 | 新增标签归一化、ID 生成或 token 哈希调用点 |
| `asRecord` 逐字重复 | 两处 snapshot owner 修改需同步（已出现 `allRevisions` 复制） | 改任一 snapshot backfill |
| discovery 双实现 | 组合式实现长期无测试覆盖漂移；gateway 注册/注销路径可能行为不一致 | 修改 Consul 行为、新增 discovery 观测 |
| `store-utils.ts` 死代码 | 无即时风险，但导出面误导消费者 | 有人按导出名直接引用 |

## 6. 建议登记条目（open-debt-and-compromises.md）

1. **重复工具函数回潮（5 类）**：`hashSecret`×3、`asRecord`×2（逐字）、`normalize*`×6、前缀 ID×5、`Math.random().toString(36)`×4 → 收敛到 `@trapmap/lib`（`hash.ts`/`string.ts` 扩展或新增 `id.ts`），`contracts` 语义化实现（`normalizeGraphLabel`）与 lib 去重；P2。
2. **死代码清理**：`store-utils.ts`（删除或入 lib）、`cached-discovery.ts`+`round-robin-selector.ts`（生产零消费者）→ 与第 4.4 节合并收敛；P2。
3. **`createLabelReadProjection` 命名与构造入口**：改名并确定工厂唯一入口；P3。
4. **discovery 组装收敛**：抽出 `createDiscoveryResolver` 工厂，消除 gateway 重复构造与两套实现重叠；P2。

## 7. 实施记录（2026-08-09 同日修复落地）

| 条目 | 处理 | 落点 |
|---|---|---|
| `hashSecret`×3 | 全部改用 lib `sha256` | `host-local/src/nest/runtime/auth-context.ts`、`evals/retrieval/lib/adapters.ts`；`store-utils.ts` 整文件删除 |
| `asRecord`×2（逐字） | 新增 lib `asRecord`（`object.ts` + 4 单测） | `knowledge-snapshot-owner.ts`、`wave9-artifact-snapshot-owner.ts` 改从 lib 导入 |
| `normalizeLabel`×5（4 处逐字 + 1 处重导出） | 新增 lib `normalizeLabel`（`string.ts` + 4 单测） | labels `backfill.ts`/`candidate-recall.ts`/`pg-repository.ts` 改从 lib 导入；`llm-extract-ids.ts` 改为 `export { normalizeLabel as normalizeValue }` 保持既有导出名 |
| 前缀 ID×5 | 新增 lib `prefixedId`（`id.ts` + 4 单测） | `pg-ports.ts`（16）、`artifact-ports.ts`（16）、`rag-log.ts`（12）、governance `pg-ports.ts`（12）、`conflict-workflow.ts`（全量） |
| `Math.random().toString(36)`×4 | 统一为 lib `prefixedId` | `context-resolver.ts`、`rabbitmq-task-transport.ts`、labels `backfill.ts`/`llm-align.ts`；`ai-providers`、`service-job-runtime` 新增 `@trapmap/lib` 依赖与 tsconfig reference |
| `nextSubId` 零包装模块 | 删除，改用 `prefixedId('sub')` | `knowledge-record-mutations.ts` 5 处 |
| 死代码 `store-utils.ts` | 删除 | 全仓库零消费者 |
| 死代码 `cached-discovery.ts` + `round-robin-selector.ts` | 删除（含测试与 `discovery/index.ts`、`backend-core/src/index.ts` re-export） | `backend-core/README.md` 服务发现示例同步裁剪，仅保留 `DynamicDiscovery` |
| `createLabelReadProjection` 命名失范 | 改名 `createPgLabelRepository` | factory/repository barrels/labels barrel/service 入口/`scripts/label-runner.ts`/测试 |
| gateway discovery 重复构造 | 新增 `createGatewayDiscovery` 工厂（`host-distributed/src/gateway/discovery-factory.ts`） | `server.ts` 注册/注销复用同一 adapter，消除 336 行重复 `new` |
| backend-core 两套 discovery 重叠 | 删除未接线组合式实现，保留 `DynamicDiscovery` | 见死代码行 |

**验证**：lib 42 tests、service-knowledge-write 97、service-knowledge-read 68、backend-core 67、governance-review 41、ai-providers 47、job-runtime 21、host-local runtime+observability 142 全绿；根级 `pnpm typecheck` 无错误；`fallow audit --base main` 49 changed files 无 issue；`pnpm eval:smoke` 基线即有 27 个 postgres-coordinated 失败（与本改动无关，HEAD 基线同样失败）；`host-distributed server.test.ts` 1 个 OTel bootstrap 超时（`--testTimeout=30000` 下通过，HEAD 基线同样超时）。

## 附：数据来源

- 全局符号/模式扫描：`hashSecret`/`asRecord`/`isRecord`/`normalizeLabel`/`normalizeValue`/`normalizeGraphLabel`/`generateId`/`nextSubId`/`Math.random().toString(36)`/`randomUUID().replace` 跨包计数
- `@trapmap/lib` 源码（`packages/lib/src/index.ts`）与消费方 grep 核对（`nowIso`/`truncate`/`timeout`/`uniqBy`/`sha256` 引用点）
- `backend-core/src/discovery/` 与 `runtime/dynamic-discovery.ts` 结构核对（组合式实现零生产消费者）
- `scripts/label-runner.ts`（`createLabelReadProjection` 唯一生产消费方）
- 上一版报告 [`TECH_DEBT_UTILS_TYPES_2026-08-08.md`](TECH_DEBT_UTILS_TYPES_2026-08-08.md) 迁移清单对照
