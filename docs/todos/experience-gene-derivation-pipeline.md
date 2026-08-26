# Experience Gene Derivation Pipeline

## Status

- Owned by [Experience Gene Infrastructure and Pipeline](experience-gene-program-mainline.md).
- Phase order: 3 / 5.

## Goal

把 approved trap、approved skill artifact 和 approved skill capsule 转换为可校验的 `ExperienceGene` candidate，并只在治理门禁通过后 solidify。

## Non-goals

- 不修改原始 trap/skill。
- 不把原始日志、secret、私有路径或脚本体放入 Gene。
- 不做无人审核的跨来源自动合并。

## Source eligibility

| Source | Eligibility | Derivation unit | Snapshot |
|---|---|---|---|
| trap | `lifecycleState === 'approved'` 且 `remediation.suppressedFromRetrieval === false` | 一个 trap entry；`sourceId=entryId` | entry id、latest revision、source content hash、title/shortcut、labels、scope/team/security、detail、evidence meta |
| skill-artifact | aggregate `lifecycleState === 'approved'`、remediation 未抑制、目标 revision 等于 `latestRevision` 且 `derived !== null` | 一个 explicit control block 或 bounded semantic section；`sourceId={artifactId}:{derivationUnitId}` | artifact id/revision/sourceHash/title/labels/governance、unit text、unit hash |
| skill-capsule | 所属 artifact approved 且 capsule 属于当前 revision 的 `derived.capsules` | 一个 capsule；`sourceId=capsuleId` | capsule id、content、situation/problem/goal/errorText/contextualPrefix、sourcePaths、artifact governance |

snapshot 必须携带 source revision 和 source content hash。派生开始前重新读取 snapshot；如果 revision/hash/unit hash 与请求不一致，当前任务标记 stale-source 并结束，由新版本 outbox/task 重新入队，不原地改写旧任务 payload。

LLM snapshot budget 首版固定：单文本字段最多 4,000 characters，单个 derivation unit 总输入最多 16,000 characters；截断只能在 paragraph 或 line boundary 发生，并记录 `snapshot.truncated=true`。

## Pipeline stages

```text
approval/remediation signal
  -> outbox event
  -> enqueue derivation task
  -> load immutable snapshot
  -> rule extractor first
  -> optional LLM candidate
  -> deterministic normalize + validate
  -> duplicate/conflict check
  -> solidify or reject
```

### Extractors

Rule extractor:

- 解析已有 `MATCH/GOAL/STRATEGY/AVOID/VERIFY` blocks；heading 匹配 case-insensitive，支持可选编号和 list items；
- 对 trap free text 识别 problem/root cause/fix/verification/avoid 标签；没有显式标签时从 shortcut/detail 提取 signals 和 summary，但没有可验证 strategy steps 时必须返回 `insufficient-structure`，不得编造通用步骤；
- 输出 deterministic candidate；
- 相同 snapshot 与 prompt/config 输入必须产生 byte-equivalent canonical output/content hash。

LLM extractor:

- 仅接收 bounded source snapshot；
- 使用 infrastructure phase 的 `generateStructured`；
- prompt version 固定在代码中；
- temperature、model、retry policy 来自显式 config，不允许隐式全局状态。
- rule candidate 通过 gates 时不需要调用 LLM。rule 返回 insufficient structure 且 LLM provider 未配置或调用失败时，保存 rejected event，reason class 为 `insufficient-structure` 或 `generator-unavailable`；该情况不是可重试 infrastructure failure。

### Validation gates

candidate 必须依次通过：

1. Zod schema parse;
2. compactness budget：signals <=20, strategy steps <=7, avoid cues <=7;
3. source fidelity：normalized lexical token coverage >=0.30，或 source/control-text embedding cosine similarity >=0.50。两个阈值是首版 constants，必须能被测试 fixture 覆盖；
4. safety scan：secret/token/password/cookie assignment、bearer/API key shapes、raw chat transcript markers、stack trace dumps、executable script bodies、asset binary signatures、private absolute paths、tenant identifiers;
5. duplicate check：same-source identical contentHash 幂等跳过；different source 且 embedding cosine >=0.93 视为 duplicate 并 reject，reason class 记录 source pair class 而非 raw seed/text;
6. governance inheritance：scope/team 完全相等，requiredLevel >= source requiredLevel，gene labels 是 source labels subset。

任一 gate 失败时保存 rejected candidate event 和 validator report，不进入 solidified 状态。validator report 记录 first failing gate；为 badcase 分类保留后续 gate 的诊断结果。

gate 顺序固定；前一 gate 失败后仍要运行 safety scan 以发现安全类 badcase，但不得继续执行 duplicate/index/solidify side effects。

### Solidification

- solidify 在一个事务中写入 Gene、keyword projection、embedding projection 和 event。
- embedding 生成失败时 aggregate 保持 validated，index status 写 `failed` 和 redacted error class；retry 成功后才转 ready 并进入同一事务的 search projection。真相源审批链路不等待 Gene indexing。
- 成功后发出 `experience-gene.solidified` outbox event。

### Staleness and remediation

以下情况把关联 solidified genes 标记 stale:

- source revision/hash changes;
- feedback 进入 remediation;
- source deprecated/superseded;
- label/scope/security governance 收紧且无法继承。

输入使用现有 `knowledge.approved/knowledge.lifecycle-updated/knowledge.rejected`、`artifact.approved/artifact.lifecycle-updated/artifact.deactivated` 以及 remediation task/outbox signal。handler 必须先 Zod parse payload；未知 shape 进入 dead-letter/problem pool，不猜测 source id。

stale Gene 不参与 serve 模式。重建成功后旧 Gene 转 deprecated，新 Gene solidified。

## Implementation checklist

- [x] 定义 outbox event payloads 和 task payload schemas。
- [x] 实现 trap/skill/capsule snapshot loaders。
- [x] 实现 rule extractor 与 parser tests。
- [ ] 实现 LLM extractor 与 structured failure tests。
- [ ] 实现 validator/normalizer/safety scanner。
- [ ] 实现 duplicate/conflict check。
- [ ] 接入 task queue、retry、dead-letter 和 idempotency key。
- [ ] 实现 solidify/stale/deprecate transactional writes。
- [ ] 注册 truth-source lifecycle/remediation handlers。
- [ ] 测试 source revision/hash、remediation、deactivation 和 governance 收紧四类 stale trigger。

## Acceptance criteria

1. 同一 immutable snapshot 的 rule candidate 或 byte-equivalent LLM candidate 重复消费时不会产生第二个 active Gene；不同 LLM 输出必须进入 duplicate/conflict gate，不得静默双写。
2. 每个 rejected gate 都有 focused test，安全 gate 的 badcase 先于 extractor/prompt 调整落地。
3. LLM 输出无法通过 schema/fidelity/safety/governance gate 时永远不会写入 solidified aggregate 或 retrieval projection。
4. rollout flag 为 off 时不 enqueue、不 consume 新 derivation task。

## Test plan

```bash
pnpm --filter @trapmap/service-knowledge-write test --run src/experience-gene-derivation.test.ts
pnpm --filter @trapmap/service-knowledge-write test --run src/experience-gene-safety.test.ts
pnpm --filter @trapmap/service-job-runtime test --run src/handlers/experience-gene.test.ts
pnpm --filter @trapmap/service-knowledge-write test --run src/experience-gene-staleness.test.ts
pnpm --filter @trapmap/contracts test --run src/domain/experience-gene-events.test.ts
pnpm typecheck
```

## Rollout and rollback

- derivation/index/stale handlers 都由 rollout flag 控制；off 时不 enqueue 也不 consume Gene task/outbox work。
- 回滚只需停止 enqueue/consume；已 solidified Gene 保留审计记录。

## Debt register

- 自动 fidelity threshold 首版保守设置；若 false rejection 过高，先补充 badcase 再调参，不在事故中临时放宽安全 gate。

## Execution record（2026-08-26）

### 已完成实现

- Contracts 新增 bounded trap/skill-artifact/skill-capsule immutable snapshot schemas、truth-source lifecycle event schema 和 solidified outbox payload schema；已知 lifecycle payload 必须携带 `entryId` 或 `artifactId`，未知 shape 不会进入 Gene handler。
- backend-core knowledge-write domain 新增 deterministic rule extractor：支持 case-insensitive、可选编号的 `MATCH/GOAL/STRATEGY/AVOID/VERIFY` heading 与 list items，并识别 trap 的 problem/fix/avoid/verify 标签。无 strategy 时返回 `insufficient-structure`，不编造步骤。
- 相同 snapshot/time 输入生成相同 aggregate/content hash；Gene ID 从 provenance idempotency key 派生。snapshot text 首版由 schema 限制在 16,000 characters，`truncated` 显式进入 snapshot contract。
- 新增 compactness/fidelity/governance validator 与 safety scanner；fidelity 支持lexical coverage >=0.30 或 embedding cosine >=0.50。safety scanner 覆盖 secret assignment、bearer/API token、chat transcript、stack trace、executable body、private key/binary signature、private absolute path 和 tenant identifier。duplicate callback 在前置 gate 失败时不会执行。
- knowledge-write owner 新增 approved trap、approved artifact revision + SKILL.md unit、以及 current approved capsule 的 PostgreSQL snapshot loaders。loader 在 SQL 中强制 lifecycle/remediation eligibility，trap source hash 从 canonical revision content 派生，artifact 使用 immutable revision source hash，capsule 使用 capsule-specific canonical hash。
- 新增 rule-first derivation orchestrator：重新读取 snapshot 后校验 revision/source-hash/snapshot-hash；stale-source 直接结束且不写 rejection。rule candidate 通过 deterministic gates 后 save candidate 并标记 validated；schema/safety/fidelity/governance rejection 写 immutable rejected event；同 provenance 主键冲突返回 idempotent，不产生第二个 active Gene。

### 当前边界

本记录是 Phase 3 的第二检查点。LLM extractor、task queue/outbox enqueue 与 dead-letter wiring、embedding/index retry、solidified outbox 写入、staleness/remediation handlers 尚未实现；因此 duplicate/conflict 投影集成和相关 checklist 保持打开。

### 验证证据

```bash
pnpm --filter @trapmap/contracts test --run src/domain/experience-gene.test.ts src/domain/experience-gene-events.test.ts
# 2 files / 9 tests passed
pnpm --filter @trapmap/backend-core test --run src/knowledge-write/domain/experience-gene-derivation.test.ts src/knowledge-write/domain/experience-gene-safety.test.ts src/knowledge-write/domain/experience-gene-hashing.test.ts
# 3 files / 10 tests passed
pnpm --filter @trapmap/service-knowledge-write test --run src/experience-gene-snapshots.test.ts src/experience-gene-derivation.test.ts
# 2 files / 6 tests passed
pnpm typecheck
# exit 0
pnpm exec biome check <changed-files>
# exit 0
pnpm exec fallow audit --base HEAD --no-cache
# verdict pass; no introduced dead-code, complexity, duplication, or boundary findings
```
