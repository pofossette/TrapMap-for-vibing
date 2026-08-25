# Experience Gene Retrieval and Activation

## Status

- Owned by [Experience Gene Infrastructure and Pipeline](experience-gene-program-mainline.md).
- Phase order: 4 / 5.

## Goal

提供 gene-native recall、selection 和 activation rendering，使客户端获得一条紧凑、可直接注入模型的 `<strategy-gene>` 控制块。

## Non-goals

- 不替代 v1 retrieval、artifact lookup 或 graph plan。
- 不修复或依赖缺失的 `/v2/retrieval/search` gateway parity。
- 不默认拼接多个完整 Gene。

## Query contract

新增 shared schemas in `packages/contracts/src/domain/experience-gene-retrieval.ts`:

```ts
export const geneSearchQuerySchema = z.object({
  seed: z.string().min(1).max(2000),
  filters: retrievalFiltersSchema.default({ labels: [], scopes: [] }),
  maxResults: z.number().int().min(1).max(5).default(1),
  includeActivationHints: z.boolean().default(false),
});

export const geneMatchSchema = z.object({
  gene: experienceGenePublicSchema,
  score: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
  sourceCitation: geneSourceCitationSchema,
  warnings: z.array(z.string().min(1).max(200)).max(3).default([]),
});

export const geneAvoidWarningSchema = z.object({
  geneId: entityIdSchema,
  title: z.string().min(1).max(280),
  avoidCue: z.string().min(1).max(500),
  reason: z.string().min(1).max(300),
  score: z.number().min(0).max(1),
  sourceCitation: geneSourceCitationSchema,
});

export const geneSourceCitationSchema = z.object({
  kind: geneSourceKindSchema,
  sourceId: entityIdSchema,
  sourceRevision: z.number().int().min(1),
  artifactId: entityIdSchema.nullable(),
  capsuleId: entityIdSchema.nullable(),
});

export const geneSearchResponseSchema = z.object({
  queryId: z.string().optional(),
  primaryGene: geneMatchSchema.nullable(),
  supplementaryAvoid: z.array(geneAvoidWarningSchema).max(3).default([]),
  routingTrace: routingTraceSchema.optional(),
});
```

`experienceGenePublicSchema` 只包含 `geneId/schemaVersion/status/title/signalsMatch/summary/strategy/avoid/constraints/validation/labels/scope/teamId/requiredLevel/updatedAt`。它不暴露 internal prompt、validator issue detail、raw model metadata、content hash、indexing error 或未授权 lineage detail。

## HTTP surface

新增内部与外部 routes:

- internal: `POST /internal/retrieval/genes/search`;
- external: `POST /v1/retrieval/genes/search`.

两条路由都必须以 `createExperienceGeneRouteDefs(deps)` 工厂声明在 `service-knowledge-read`，deps 的最小能力是 `searchGenes(input, context): Promise<GeneSearchResponse>`。host-local monolith 注入 in-process port，并通过现有 monolith filter 只暴露 `/v1` route；distributed knowledge-read service 暴露 `/internal` route；gateway 用 internal client 实现同一个 deps 接口后复用同一 external RouteDef。禁止在任一宿主手写第二套 handler/schema。

请求 schema 不接受 security level；trusted actor/team/security context 由 host auth/header adapter 注入。external caller 提供的 `filters.teamId` 只能进一步收窄到 authenticated team；为 null 时由 server 决定 global visibility，不得覆盖 trusted identity。外部响应在 off/shadow mode 返回 canonical disabled envelope，不返回空命中假象。

## Recall pipeline

1. Parse seed and apply auth/team/security/scope filters。
2. Keyword/tsvector candidates from signals、title、summary、strategy、avoid、labels。
3. pgvector candidates from the Gene embedding built from summary + ordered strategy + avoid cues。
4. Merge using semantic/keyword weights plus boosts:
   - exact signal match;
   - error-text match;
   - boundary/package/version match;
   - source authority;
   - fresh verification。
5. Penalize stale/deprecated、missing validation 和 broad low-confidence matches。
6. Select one primary gene per response。
7. Only add supplementary avoid warnings when they come from distinct sources and do not conflict with primary gene。

Selection logic 放在 backend-core knowledge-read domain pure functions，并由 assembly `gene-selection` contract 包装。contract descriptor 使用 id/provides `gene-selection`，宿主 node 必须提供 service name `geneSelection`、显式 config schema 和 embedded topology，并复用 shared judgment fixture pattern。rule implementation 先行；LLM selection 不是首版需求。

首版 merge weights 固定为 semantic `0.6`、keyword `0.4`; boosts/penalties 是 named constants 且总输出 clamp 到 `[0,1]`。相同分数按 geneId lexicographic 排序。

## Rendering

CLI/MCP renderer 输出：

```text
<strategy-gene>
Domain keywords: {signalsMatch}
Summary: {summary}
Strategy:
  1. {step}
  2. AVOID: {pitfall}
</strategy-gene>
```

渲染器必须：

- 保持 strategy order；
- 把 avoid 单独行并以 `AVOID:` 开头；
- 不输出 full SKILL.md、reference body、asset/script body 或 validator internals；
- 在无命中时明确说明 no matching gene，而不是伪造建议。
- CLI output profile 注册 `experience-gene` payload kind，并为 generic/claude-code/codex/opencode 提供稳定 renderer 或明确 fallback；MCP tool 返回 structured Gene response，客户端需要注入文本时使用同一 formatter。

## Implementation checklist

- [ ] 新增 query/response/public gene schemas 和 tests。
- [ ] 实现 gene keyword and vector recall adapters。
- [ ] 实现 merge/rerank/select pure domain functions。
- [ ] 注册 internal and external RouteDefs in both hosts。
- [ ] 补 distributed internal client forwarding。
- [ ] CLI/MCP formatter/renderer integration。
- [ ] 更新 api-surface and route-surface expectations。
- [ ] 为 off/shadow/serve 三态补 route/config tests。

## Test plan

```bash
pnpm --filter @trapmap/contracts test --run src/domain/experience-gene-retrieval.test.ts
pnpm --filter @trapmap/backend-core test --run src/knowledge-read/domain/gene-selection.test.ts
pnpm --filter @trapmap/service-knowledge-read test --run src/experience-gene-retrieval.test.ts
pnpm --filter @trapmap/host-local test --run src/nest/knowledge-read/experience-gene-route-defs.test.ts
pnpm --filter @trapmap/host-distributed test --run src/gateway/experience-gene-route-defs.test.ts
pnpm --filter @trapmap/cli test --run src/lib/output-profile.test.ts
pnpm --filter @trapmap/app-mcp test --run src/tools/experience-gene.test.ts
pnpm eval:smoke
```

## Rollout and rollback

- route 首版由 `TRAPMAP_EXPERIENCE_GENES_MODE=off|shadow|serve` 控制，默认 `off`。配置 schema 在 host-local 和 distributed config 中共享语义并分别接入现有 typed config。
- off：不派生、不消费、不返回内部或外部 search result。
- shadow：允许内部派生/index/search 和评测采样；external route 返回 disabled envelope，不把 Gene 暴露给客户端。
- serve：internal/external search 正常开放。
- 回滚将 mode 设为 off；不需要移除 route contract。

## Debt register

- 多 Gene composition 明确延后；只有 single-gene eval 显示补充 warning 不足时才另行立项。
