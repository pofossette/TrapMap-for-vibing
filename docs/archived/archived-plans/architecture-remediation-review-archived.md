# 任务文档审阅与补强纪要 — 有文档变量下的二次处理

> **变量:** 已有 `architecture-remediation-mainline.md` 79行 + 7 phases 31-48行（过薄） + `probe-report.md` 38项
> **方法:** 5 枚 Reco 探针重读文档给推荐方向 + 4 枚 Review 探针专审“文档怎么落”与缺失细节，二者均无观点注入，仅读现场。

## Reco 5 枚推荐方向（已采纳）

| 探针 | 推荐 | 落点 |
|---|---|---|
| R1 结构 | 主纲缺量化证据表 + P1/P2 文件重叠 + 缺回滚 | 主纲补量化表/术语/阅读顺序/P0.4 回滚，P1 明确仅 host-local |
| R2 持久化/检索 | P4 缺迁移执行 + P1-C3 依赖 P5 倒置 + 缓存未量化 | P1 加非目标“不接 Cache”，P4 补 baseline 顺序与 guard 命令，P5 补 p95>60% |
| R3 Go | 栈表重复 + 瘦身未定义 + fallback 双 client 不一致 | 主纲删表仅引用，P3 补 Sunset 2026-10-01 与过渡态双 client 说明 |
| R4 契约 | 拆分边界未定义 + 门禁缺完整命令 | P6 补 P6.0 图谱任务与 `generate:contracts:check && git diff` 全命令 |
| R5 部署 | env 清单缺 + thin 无校验 + P2/P7 重叠 | P7 补全 env 清单与 `fallow audit allowlist` 校验，P2 声明配置归 P7 |

## Review 4 枚审阅“文档怎么落”（已补强）

| 审阅 | 指出缺失 | 补强动作 |
|---|---|---|
| V1 过短缺细节 | 缺文件树/接口签名/精确测试/反例 | 每 Phase 补 `改前/改后树` + `CachePort 签名` + `pnpm --filter ... test --run` 精确命令 + `反例/非目标` |
| V2 覆盖失衡 | P5/P6/P7 仅 31-33行但 14 项，Probe G 未显性，缺 Not included | P5/P6/P7 扩至 67-75行，P7 补 Deferred，Go 表去重，每 Phase 补 Not included |
| V3 可派性 | 文件集重叠 + Port 时序 + 产出格式 + commit 粒度 | P1/P2 明确 `host-local vs distributed` only，P5 先定义 Port，统一 `failing test→impl→verify→commit refact(phaseN)` |
| V4 落地 | 缺阅读顺序/何时 Done/术语/工作量提示 | 主纲补阅读顺序与术语表，每 Phase 补证据小节，P6 补预估行数与风险 |

## 补强后体积

| 文档 | 补强前 | 补强后 | 变化 |
|---|---|---|---|
| mainline | 79 | 100 | +21 量化表/术语/回滚 |
| phase1 | 48 | 82 | +34 文件树/反例/精确测试/证据 |
| phase2 | 46 | 72 | +26 树/测试/证据 |
| phase3 | 48 | 69 | +21 Sunset/过渡态/测试 |
| phase4 | 45 | 84 | +39 树/接口/测试/证据 |
| phase5 | 33 | 75 | +42 签名/指标/派发表 |
| phase6 | 31 | 67 | +36 边界/预估/命令 |
| phase7 | 32 | 70 | +38 env 清单/树/Deferred |
| **合计** | 362 | 619 | +257 细节，仍无超大（最大 100） |

> 仍保持“拆开落文档”：最大单文件 100 行，无 300+ 超大；但细节已补齐至可直接派 subagent（精确命令 + 接口签名 + 文件树 + 证据 + 反例）。

## 审阅结论

- **怎么落是对的:** 薄主纲 + delegated 7 细则 + 只读探针，符合 `docs/todos/README.md` “owner 声明 delegated” 的 active surface 规则；`check:docs/structure/mermaid/complexity` 全绿
- **细则是合适粒度:** 60-85 行/份，含 Scope/非目标/树/任务/完成标准/测试/证据/派发表，subagent 可独立执行而不需读超大文档
- **遗留:** P5 的 Redis 可选与 P6 的 contracts 子域拆分仍需 P6.0 图谱后二次确认，已在细则中标注

