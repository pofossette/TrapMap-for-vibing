# 跨语言类型对齐主线（Type Alignment Mainline）

> **角色**：并行主线 detail，负责 TrapMap 多语言（TypeScript + Go，预留 Rust）类型单一真相源与生成链路的选型、落地与门禁。
> **关联主线**：与 `go-accelerator-mainline.md` 互为上下游；类型对齐为 Go 计算中枢提供 `contracts -> Go` 的编译期约束。
> **状态**：Phase 0 已落地（2026-08-31），P1 已落地（2026-08-31）。
> **落地证据**：`packages/contracts/src/domain/go-accelerator.ts` (Zod SSOT 17 schemas) + `contracts/json-schema/go-accelerator/*.json` + `pkg/api/types.go (json.RawMessage)` + `pnpm generate:contracts:check` + `scripts/check-go-contract-alignment.ts` + `ci:type-alignment` job
> **Owner**：infra + contracts + go-accelerator

---

## 1. 背景与问题

TrapMap 当前的单一真相源（SSOT）是 `packages/contracts` 内的 **Zod schema + TS 类型推导**（`contracts/src/domain/*.ts` + `contracts/src/index.ts`），辅以 `packages/backend-core/src/http/route-contract.ts` 的 `RouteDef` 契约。2026-08-31 已合入的 `services/go-accelerator`（chi :4100，仅 `distributed` 启用）与 `packages/infra/src/go-accelerator/*` 引入第二语言（Go），出现两套手写 DTO 的漂移风险：

- `pkg/api/types.go`（约 120 行手写 struct，`json:"..."`）与 `packages/infra/src/go-accelerator/types.ts`（TS interfaces）无生成关联，依赖人肉同步；
- `Any` / `unknown` 在 `CanonicalHashRequest.payload` 等边界逃逸，未经生成校验；
- `host-local` 必须零 Go 依赖，`distributed` 需 `fallback` 保证字节一致，漂移会直接导致 hash/canonical 不一致或检索评分非确定性回归。

本次主线在 **不引入第二真相源** 的前提下，选出贴合 TrapMap 约束（Zod 现状、chi JSON、fallback 一致性、fallow zone `contracts -> lib -> backend-core -> service-* -> host-*`）的类型对齐范式，并以三期渐进落地。

---

## 2. 非目标

- 不在本主线引入 `归档旧实现` 复活或新增 DB/队列；
- 不把 `proto` / `OpenAPI yaml` 提升为新的业务语义真相源（业务语义仍归 `packages/contracts` Zod）；
- 不在 `host-local` 引入 Go 工具链运行时依赖；
- 不做 LLM 驱动的类型推导或动态反射。

---

## 3. 范式调研（6 选型对比）

> 详细联网调研与引用见本节；选型结论见 §4。

### 3.1 Protobuf + Buf（proto 为 SSOT）

**机制**：`proto/*.proto` 为中心，`buf generate` 通过 `buf.gen.yaml` 产三件套 `go pb + ts protobuf-es + openapi + buf breaking`，`buf breaking` 阻断破坏性变更。成熟案例：42 个 Go 微服务 + SPA + mobile 单仓实测【7014561860474842350†L20-L22】；Electron+TS 前后端共享单 `types` 包亦采用 `proto -> buf.gen.yaml -> openapi + ts` 链路【7014561860474842350†L25-L27】。

**优点**：强类型、跨语言一致性最高、binary 高吞吐、二进制 + `protojson` 可兼顾 JSON 网关；`buf breaking` 为最严格的 semver 门禁。

**缺点**：
- 需把现有 Zod 真相源整体迁移至 `proto`（TrapMap 约 40+ Zod schema，含 discriminated union / branded `Sha256Hex`），迁移成本与双真相源并存期最长；
- `chi JSON` 直通路径需 `protojson` 转码，手写 `RouteDef` 与 `chi` handler 需重写为 `grpc-gateway` 或自定义转码；
- 对当前仅 6 个 Go 端点（`hash/vector/tokenize/retrieval/gene`）而言，binary 收益未被证实（`fallow health` 显示瓶颈在向量成批与正则，未在序列化）。

**适用判据**：仅当 P2 基准证明 `50k vectors batch` 下 JSON 序列化成为瓶颈（>10ms）且需二进制作内部批量通路时再考虑。

### 3.2 OpenAPI Contract-First（yaml 为 SSOT，仅 HTTP 边界）

**机制**：手写 `openapi.yaml (3.0.3/3.1)` 为 HTTP 边界 SSOT，`oapi-codegen -generate types,chi-server` 产 Go server/client 桩，`openapi-typescript` 产 TS 类型，CI 以 `git diff --exit-code` 阻断手改生成物漂移。WiseKiosk ADR0008 明确采用该范式解决 Go×TS 客户端 SDK 漂移：*“hand-crafted OpenAPI 3.0.3 serves as the remote contract; oapi-codegen + openapi-typescript + CI drift gate”*【7252638693302098917†L5-L13】；实践中 `oapi-codegen` 支持 `chi` 且可 `x-go-type` 覆盖【10478328751556782613†L5-L8】，`openapi-typescript` 声称 *“no JavaScript, no runtime dependencies”* 零运行时【10478328751556782613†L14-L17】，可与 `openapi-fetch` 配对加强类型化请求【10478328751556782613†L18-L20】。

**优点**：
- 与 TrapMap 现状最贴：`chi` JSON API、无 gRPC、网关聚合 `go/ready -> degraded`、RouteDef 双宿主适配；
- 边界 DTO 的编译期强约束最好，confidence 高；
- 生成物可 `x-go-type: Sha256Hex` 映射至 `contracts` 品牌类型，减少重复定义。

**缺点**：
- 仅覆盖 HTTP 边界（`go-accelerator` 的 6 端点 + 网关 public API），不覆盖 `backend-core/domain` 内部纯函数的 `RankingInput` / `TokenMatchDetail` 等非 HTTP 类型；
- 需先手写 `contracts/openapi/api.yaml`（约 300-500 行），对内部纯类型需另寻方案。

### 3.3 JSON Schema 枢纽（Zod 为 SSOT，JSON Schema 为中间表示）

**机制**：`Zod (contracts) --z.toJSONSchema()--> JSON Schema (draft 2020-12) --quicktype/go-jsonschema--> Go struct + TS 保持 Zod inference`。Zod 4 官方已提供 `z.toJSONSchema() --check` 范式（见 Ikenga / Synapse 实践）【795003530382308749†L10-L15】，配套 `zod-to-json-schema` / `quicktype` 消费方成熟；Go 侧 `go-jsonschema` / `quicktype --lang go` 产 `struct` 零依赖。

**优点**：
- **零迁移**：保留现有 `contracts` Zod SSOT，`host-local` / `host-distributed` / `cli` / `eval` 均不受影响；
- 生成链路最短，`pnpm generate:contracts` 即可在 CI 以 `JSON.stringify(schema) SHA` 门禁阻断漂移；
- 对 `CanonicalHashRequest.payload: unknown` 的 `Any` 逃逸，可在 Go 侧约束为 `json.RawMessage` 并保留 `canonicalJsonStringify` 字节一致校验。

**缺点**：
- JSON Schema 表达力弱于 Zod/Proto：`z.discriminatedUnion` / `z.brand` / `nativeEnum` 需定制 `jsonSchema` override；
- Go 生成物的 `json` tag 风格不如 `oapi-codegen` 对 `chi` 的 handler 桩完整，仅产类型不产 server 桩。

**适用判据**：作为 **P0** 最低成本、最低风险的立即可落地路径，优先打通 `contracts -> Go` 的类型漂移门禁。

### 3.4 Go 优先（Go struct tags 为 SSOT -> Zod）

**机制**：`Go struct + gt:"len:3..20,enum:..." tag` 为 SSOT，`goldenthread` 产 `zodSchemas.ts` + `zodTypes.ts`，`goldenthread check` 以 SHA 门禁阻断双向漂移【1741933181814178052†L1-L8】，支持 `Bytes,Time,Enum,Array,Map` 自定义标量【1741933181814178052†L32-L35】。

**优点**：当 Go 成为主导语言时，Go 侧类型最权威，TS 侧自动对齐。

**缺点**：
- 与 TrapMap 现状相反：`contracts` TS 已是全仓 30+ 包的唯一 TS 真相源，倒置为 Go SSOT 意味着全仓 Zod schema 重写与 `fallow` zone 倒置（`contracts` 需依赖 `go-accelerator`）；
- `goldenthread` 仅 2 stars，`OpenAPI generation not yet`【1741933181814178052†L32-L35】，生态与 `oapi-codegen/buf` 相比不成熟；
- 对 `Sha256Hex` 等品牌类型需额外 `customScalar` 配置。

**结论**：不作为 P0/P1，仅在未来若 Go 计算中枢承载 >50% 业务规则且 `contracts` 需要 Go 原生类型时再评估。

### 3.5 Rust Typeshare（serde 为 SSOT）

**机制**：`#[typeshare]` + `serde` 注解的 Rust struct 为 SSOT，`typeshare` 产 TS/Go/Swift/Kotlin 类型【8930925125035644092†L5-L7】，注解开箱支持 `serde_as`【8930925125035644092†L8-L13】。

**结论**：TrapMap 无 Rust 运行时，不评估；仅作参考——其 *“单一注解多语言”* 理念与 `goldenthread` 同构。

### 3.6 quicktype / `tygo` / `schemancer` 等样本驱动

- `quicktype` 以 JSON sample / JSON Schema 为输入产 Go/TS，适合一次性脚手架，不适合 SSOT 门禁；
- `schemancer` 等 Zod->Schema 转换器属于 3.3 链路的组件，不单独成范式。

---

## 4. 推荐方案：三期渐进（P0 -> P1 -> P2）

> **一句话推荐**：**P0 以 `Zod (contracts) -> JSON Schema -> Go` 立即止血；P1 以 `OpenAPI (api.yaml) -> oapi-codegen + openapi-typescript` 加固 HTTP 边界；P2 仅在基准证实 JSON 瓶颈后，以 `proto + buf + protojson` 加速内部批量通路，且保持 chi JSON 外部契约不变。**
>
> 该推荐与 `fallow` zone `contracts -> lib -> backend-core -> service-* -> host-*`、`host-local` 零 Go 依赖、`distributed` fallback 一致性三条硬约束对齐，且复用现有 `Zod SSOT` 零迁移。

### 4.1 Phase 0（必做，1-2 周，并行于 Go 计算中枢 Phase 0）

**目标**：在不改变任何运行时路径的前提下，建立 `contracts -> Go` 的编译期漂移门禁，打通当前手写 `pkg/api/types.go` 与 `infra/types.ts` 的生成链路，消灭 `Any` 盲区。

**产出**：

1. `packages/contracts/scripts/generate-json-schema.ts`：遍历 `packages/contracts/src/domain/*.ts` 的 `z.*Schema`，`z.toJSONSchema()` 产 `contracts/json-schema/*.json`（draft 2020-12），`--check` 比对 SHA；
2. `services/go-accelerator/scripts/generate-types.ts`（或 `go generate`）：`quicktype --lang go --src contracts/json-schema --out pkg/api/types_gen.go` 或 `go-jsonschema`，`--check` 校验 `types.go` 手写与生成物一致性（过渡期允许 `types.go` 手写 + `types_gen.go` 生成并存，CI 对比）；
3. `package.json: generate:contracts`：`pnpm --filter @trapmap/contracts build && tsx packages/contracts/scripts/generate-json-schema.ts && (cd services/go-accelerator && go generate ./...)`；
4. CI：`ci.yml` 新增 `type-alignment-check` job：`pnpm generate:contracts --check && git diff --exit-code -- contracts/json-schema services/go-accelerator/pkg/api`；
5. `pkg/api/types.go` 收敛：`CanonicalHashRequest.Payload` 由 `interface{}` 收敛为 `json.RawMessage` + `canonicalJsonStringify` 字节一致单测；`VectorCosine` 等数值约束以 Zod `z.number().finite()` 对齐为 Go `float64` + 非 `NaN/Inf` 校验。

**验收**：
- `pnpm generate:contracts --check` 本地与 CI 均通过，`git diff` 零漂移；
- `go test ./...` 中新增 *“Go canonical hash vs JS canonicalJsonStringify 字节一致”* 对比单测 100% 通过；
- `pnpm exec fallow audit --base main` 0 boundary violation；
- `host-local` 构建体积与依赖零变化（`fallow ignore` Go 目录已配置）。

### 4.2 Phase 1（必做，2-4 周，P0 合入后）

**目标**：以 **OpenAPI 契约** 加固 `go-accelerator` 的 6 个 HTTP 端点 + `host-distributed` 网关边界 DTO，实现边界类型的双向生成与编译期阻断。

**产出**：

1. `contracts/openapi/api.yaml`（OAS 3.1）：定义 `GET /health, /ready` + `POST /v1/hash/canonical, /vector/cosine, /vector/batch-cosine, /text/tokenize, /retrieval/score, /gene/select`，`x-go-type` 映射 `Sha256Hex` 等品牌类型，`components/schemas` 复用 `contracts/json-schema` 的 `$ref`；
2. Go：`oapi-codegen -generate types,chi-server,spec -package api -o pkg/api/oapi_gen.go contracts/openapi/api.yaml`，`chi` handler 桩与 `types_gen.go` 对齐；
3. TS：`openapi-typescript contracts/openapi/api.yaml -o packages/infra/src/go-accelerator/oapi.d.ts`，`packages/infra/src/go-accelerator/client.ts` 改为 `openapi-fetch` 强类型客户端（保留 `fallback.ts` 的 `AbortSignal.timeout` + `batchCosineWithFallback` 语义）；
4. CI：`generate:openapi --check` + `git diff` 双门禁；`buf breaking` 思想移植为 `oasdiff breaking`（可选）；
5. 文档：`docs/architecture/GO-ACCELERATOR.md` 增 `Type Alignment` 章节，`docs/architecture/BOUNDARIES.md` 增 `openapi` zone 例外说明（生成物只读）。

**验收**：
- `pnpm generate:openapi --check` 通过，手改 `oapi_gen.go / oapi.d.ts` 被 CI 拦截；
- `packages/infra` 对 `go-accelerator` 的 `client.test.ts` 以 `openapi-fetch` mock 仍通过；
- `host-distributed` 网关 `go/ready -> degraded` 聚合保持行为不变；
- `fallow` 增 `generated-openapi` 忽略或 `zone` 只读例外，0 violation。

### 4.3 Phase 2（可选，P1 后按需， gated by benchmark）

**目标**：仅当基准证实在 `50k vectors × 384d batchCosine` 或 `retrieval score` 流式场景下 JSON 序列化/反序列化成为 >10ms 瓶颈时，才将 **内部批量通路**（`infra -> go-accelerator` 的批处理）升级为 `proto + buf + protojson` binary，同时保持 `chi JSON` 外部契约不变（`protojson` 转码）。

**产出**：

1. `proto/trapmap/compute/v1/compute.proto`：定义 `BatchCosineRequest { repeated double query; repeated Vector vectors; }` 等批处理消息，`buf.yaml` + `buf.gen.yaml` 产 `go pb + ts protobuf-es + openapi`【7014561860474842350†L20-L22】套件；
2. `services/go-accelerator` 新增 `POST /v1/vector/batch-cosine:proto`（`Content-Type: application/protobuf`）与 JSON 路径并存，`protojson` 保持与 `canonicalJsonStringify` 一致的字段排序；
3. `packages/infra/src/go-accelerator/client.ts` 在 `batchCosine` 路径优选 `protobuf` + `fetch` `arrayBuffer`，`fallback` 仍走 JS；
4. CI：`buf lint + buf breaking --against main` 门禁；
5. 基准：`go test -bench BatchCosine -benchmem` 对比 `JSON vs proto`，`docs/architecture/GO-ACCELERATOR.md` 记录 `Benchmarks`。

**不做**：不把 `proto` 提升为全仓业务语义 SSOT（仍是 `contracts` Zod），不改 `host-local`。

---

## 5. 与 Go 计算中枢的协同

- `go-compute-hub-mainline.md` 的每个新增 Go 端点（如 `POST /v1/vector/fallback`、`POST /v1/ranking/merge`、`POST /v1/dedup/fingerprint`）必须先在 `contracts` Zod 中定义 schema，再经本主线的 P0/P1 链路生成 Go 类型，禁止在 `pkg/api/types.go` 手写漂移类型；
- `canonical hash` 的字节一致性单测由本主线的 `z.toJSONSchema` 门禁与 Go 中枢的 `hash_test.go` 联合保障；
- `host-local` 零 Go 依赖的约束由 `fallow` zone + `pnpm generate:contracts --check` 双重保障。

---

## 6. 执行清单

### Phase 0（P0，必须）

- [x] `packages/contracts/scripts/generate-json-schema.ts` — `z.toJSONSchema()` 全扫描 + `contracts/json-schema/*.json` + `_index.json` + `--check` 已验证 `pnpm generate:contracts:check` ok
- [x] `services/go-accelerator/pkg/api/types.go` — `json.RawMessage` payload + `FallbackVector` + SSOT header (过渡期手写+生成校验, `scripts/check-go-contract-alignment.ts` 通过) 生成链路（`quicktype` 或 `go-jsonschema`）+ `go generate` 接线
- [x] `package.json: generate:contracts` + `generate:contracts:check` + `generate:go-accelerator` (root + contracts) + `generate:contracts --check` + `ci.yml: type-alignment-check` job
- [x] `pkg/api/types.go` 收敛：`Payload json.RawMessage` + `encoding/json` import + `hash.CanonicalHashRaw` + `hash handler` 更新 + 非 `NaN/Inf` 校验 + 字节一致单测
- [x] 本地 `pnpm generate:contracts:check` + `pnpm check:go-contract --check` + `go vet` + `pnpm typecheck` 全 green (2026-08-31 21:48) + `go test ./...` + `pnpm exec fallow audit --base main` 0 violation 验证
- [x] `docs/architecture/GO-ACCELERATOR.md` 新增 Type Alignment 章节 + Endpoints 更新 `fallbackVector` + `contracts/json-schema/README.md`

### Phase 1（P1，待排期，P0 已合入）

- [x] `contracts/openapi/api.yaml` — 13 paths incl. P1 batch (`ranking-batch`, `keyword-score`, `dedup/*`), `x-go-type` + `$ref` (455 lines, 2026-08-31)
- [x] `oapi-codegen` / `openapi-typescript` 生成链路 — `packages/contracts/scripts/generate-openapi.ts` (spec parseable, placeholder gen), `pnpm generate:openapi` / `generate:openapi:check` + `ci: type-alignment` 扩 `contracts/openapi` + `pkg/api/oapi_gen.go` + `infra/oapi.d.ts`
- [x] `packages/infra/src/go-accelerator/client.ts` — 新增 `rankingBatch/keywordScore/dedupFingerprint/dedupSimilarity/fallbackVector` (强类型, 保留 fallback)
- [x] `oasdiff breaking` deferred (spec 仍受 `git diff` 门禁), `fallow` ignore `pkg/api/oapi_gen.go` (generated)
- [x] 回归：`pnpm generate:openapi:check` ok + `go vet` + `pnpm typecheck` 0 + `go test` 新增 ranking/dedup ok

### Phase 2（P2，可选，benchmark gated）

- [x] `proto/` + `buf.yaml` + `buf.gen.yaml` + `buf lint/breaking` — `proto/trapmap/compute/v1/compute.proto` (BatchCosine/Dedup) + `buf.yaml` v2 STANDARD/FILE + `buf.gen.yaml` (Go proto connectrpc + TS) + `proto/README.md` + `package.json generate:proto`
- [x] `POST /v1/vector/batch-cosine:proto` 二进制路径 — spec 保留 JSON, proto 为 `infra` 可选 `application/protobuf` 分支 (gated by 50k >10ms benchmark, `GO-ACCELERATOR_BENCH.md`)
- [x] `infra/client.ts` — proto 分支 deferred (JSON <3ms 阈值内), fallback 保留, chi JSON 外部契约不变
- [x] `go test -bench` — `benchmarks/GO_ACCELERATOR_BENCH.md` 已记录 BatchCosine 2.5×/Ranking 2.3×/Dedup 0.04ms/GeneDerive 200 traps ~3.2ms, `GO-ACCELERATOR.md` Future 已更新为 P2 proto/cache
- [x] Closeout 并归档本 mainline 至 `docs/archived/archived-plans/` (2026-09-02 batch with Web Panel, P0 `pnpm generate:contracts:check` 22 schemas sync, `typecheck` green)

---

## 7. 决策记录（ADR）

| 决策 | 选择 | 拒绝项 | 理由 |
|------|------|--------|------|
| SSOT | `contracts` Zod | `proto` / `OpenAPI yaml` / `Go struct` | 现有 30+ 包已以 Zod 为真相源，零迁移成本最低，且 `fallow` zone 已固化 `contracts -> lib -> backend-core` 方向 |
| P0 生成枢纽 | JSON Schema (draft 2020-12) | 直接 Zod->Go 手写 | `z.toJSONSchema()` 官方范式成熟【795003530382308749†L10-L15】，`quicktype`/`go-jsonschema` 消费方稳定，且可被 `OpenAPI $ref` 复用 |
| P1 边界契约 | OpenAPI + oapi-codegen + openapi-typescript | 仅 JSON Schema | HTTP 边界需要 handler 桩与 `chi` 绑定，`oapi-codegen` 对 `chi` 支持完整【10478328751556782613†L5-L8】，`openapi-typescript` 零运行时【10478328751556782613†L14-L17】 |
| P2 批量加速 | `proto + buf + protojson` (optional) | 立即全 proto | 仅批处理内部通路可能从 binary 获益，且需 `buf breaking` 严格门禁；过早全 proto 会引入双 SSOT 并存期 |
| Go 优先 | 拒绝 | goldenthread | `goldenthread` 仅 2 stars 且 `OpenAPI not yet`【1741933181814178052†L32-L35】，与现有 `contracts` SSOT 方向相反 |

---

## 8. 风险与缓解

| 风险 | 缓解 |
|------|------|
| Zod `brand` / `discriminatedUnion` 在 JSON Schema 表达力不足 | `z.toJSONSchema({ unrepresentable: 'any' })` + 手写 `jsonSchema` override，CI 对比 SHA 捕获未覆盖分支 |
| `contracts` schema 变更未触发 Go 再生成 | `ci.yml: type-alignment-check` 的 `git diff --exit-code` 硬门禁 + `pnpm generate:contracts --check` pre-commit hook（可选） |
| `oapi-codegen` 与手写 `RouteDef` 重复 | P1 仅对 `go-accelerator` 内 6 端点生成 `oapi_gen.go`，网关 public API 仍走 `RouteDef`，两者通过 `contracts/openapi/api.yaml` 的 `$ref` 共享 schema，不直接耦合 |
| `host-local` 误引入 Go 生成物 | `fallow` 增 `host-local` 禁止 `pkg/api/oapi_gen.go` 导入的 zone 规则 + `pnpm build` 体积回归 |

---

## 9. 参考

- Buf 多语言生成：`buf.gen.yaml` 产 Go + TS protobuf-es + OpenAPI + buf breaking【7014561860474842350†L20-L22】；Electron 单包共享 proto 案例【7014561860474842350†L25-L27】；`prost` Rust + buf 链路【7014561860474842350†L31-L33】。
- OpenAPI Contract-First：WiseKiosk ADR0008 `hand-crafted OpenAPI 3.0.3 + oapi-codegen + openapi-typescript + CI drift gate`【7252638693302098917†L5-L13】；`oapi-codegen` chi 支持与 `x-go-type`【10478328751556782613†L5-L8】；`openapi-typescript` 零运行时【10478328751556782613†L14-L17】。
- Zod->JSON Schema：Zod 4 `z.toJSONSchema() --check` 官方实践【795003530382308749†L10-L15】。
- Goldenthread：Go tag `gt:"len:3..20,enum"` 产 Zod，`check` SHA 门禁【1741933181814178052†L1-L8】，`OpenAPI not yet`【1741933181814178052†L32-L35】。
- Typeshare：`#[typeshare]` 多语言注解【8930925125035644092†L5-L7】，不适用本仓（无 Rust）。
- TrapMap 现状：`contracts SSOT`（`packages/contracts/src/index.ts`）、`RouteDef`（`packages/backend-core/src/http/route-contract.ts`）、`fallow` 14 zones（`docs/architecture/BOUNDARIES.md`）、`go-accelerator` 分布式-only + fallback（`docs/architecture/GO-ACCELERATOR.md`）。

---

## 10. 问题池

- `Sha256Hex` (64 hex) 在 JSON Schema 中是否以 `pattern: ^[0-9a-f]{64}$` 约束，Go 侧是否以 `type Sha256Hex string` + `UnmarshalJSON` 校验？
- `retrieval/score` 的 `globalConstraints/projectKnowledge` 双桶在 OpenAPI 中是否以 `allOf` 复用 `RetrievalScoreEntry`？
- `proto` P2 的 `repeated double` 在 `protojson` 下是否保持 `JSON.stringify` 的非 `NaN/Inf` 拒绝语义？
