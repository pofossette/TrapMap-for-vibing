# CLI 真实服务对接测试主线 — 三构建产物 × CLI 回归 × Docker 资源观测

> **角色**：本细则是 `plan.md` 显式链接的唯一 active mainline，负责三种服务端构建产物的真实启动、CLI 全量对接回归与 Docker CPU/内存/磁盘量化观测。所有阶段以**真实进程 + 真实 PG + 真实 CLI 二进制**为准，mock/ dry-run 仅作开发预验。
> **状态**：active（2026-09-02 立项，待 `plan.md` 链接后执行）
> **Owner**：`apps/cli` + `apps/light` + `apps/distributed` + `services/knowledge-read-go` + `services/go-accelerator` + `infra`
> **关联**：`scripts/backend-target-registry.ts`（light/heavy 构建目标）、`docker-compose.yml`（profiles）、`docs/architecture/DEPLOYMENT.md`、`docs/operations/REGRESSION-COMMANDS.md`、`docs/reference/SYSTEM_TRUTH_SOURCES.md`

---

## 0. 背景与目标

### 0.1 为什么要做真实 CLI ↔ Server 对接

- 三种构建产物已可独立产出镜像与二进制，但**从未在真实容器/进程下被 CLI 逐命令打过**；`pnpm test:deployment-smoke` 仅覆盖 HTTP 契约与最小路由，CLI 侧大量命令（`knowledge submit/review`, `retrieval search`, `skill add/apply`, `team/member`, `feedback`, `maintenance`, `artifacts export`）未在真实 gateway 上回归。
- 分布式与 Go 读路径（`knowledge-read-go :4101` + `go-accelerator :4100`）引入新的网络 hop 与 fallback 分支，若不做真实链路压测，无法量化 CPU/内存/磁盘代价。
- 目标形态：**同一套 CLI 二进制对三种服务端各跑 N 轮（≥3 轮）全量回归**，每轮采集 Docker 粒度资源（CPU%、mem usage/limit、block I/O、磁盘增量），产出可复现的基准报告与回归阈值。

### 0.2 硬约束

- 真实 PG 强制：`TRAPMAP_DATABASE_URL` 指向真实 `postgres:5432/trapmap`（shared PG 姿态，非 json fallback）；`host-local` 的 `TRAPMAP_DATABASE_URL` 空值 fallback 仅用于单元测试，本主线禁止。
- CLI 必须是构建产物：`apps/cli/dist` 或 `pnpm --filter @trapmap/cli build` 后的 `node ./apps/cli/dist/index.js` / 全局 `trapmap`，禁止直接 `tsx` 走源码。
- 三产物互斥验证：每种产物独占 `4000` 端口与 `.data` volume，轮转前必须 `docker compose down -v` 隔离，避免交叉污染。
- 资源数据必须来自 Docker Engine：`docker stats --no-stream --format json` + `docker system df -v` + `df -h /var/lib/docker`，禁止使用宿主 `top` 代替容器视图。
- Subagent 隔离：每个 Phase 的并发 subagent 必须 disjoint file set（见 §7），通过 `exec_command` 并行派发，禁止串行单线程。
- 文档与守卫门禁：每 Phase 收口后 `pnpm typecheck` + `pnpm check:docs` + `pnpm check:structure` + `pnpm check:complexity` 全绿。
- 行预算：新增脚本 ≤300 行/文件、≤500 模块总量；`benchmarks/results/` 与 `docs/archived/evidence/cli-integration-*` 为证据落点，不计入复杂度预算。

### 0.3 三种构建产物定义（权威来源：`scripts/backend-target-registry.ts` + `docker-compose.yml` + 各 `Dockerfile`）

| 代号 | 构建产物 | 镜像 | 入口 | 运行时特征 | compose 形态 |
|------|---------|------|------|-----------|-------------|
| **A — light** | `pnpm build:light` → `@trapmap/app-light` | `trap-map-host-local:latest` (`apps/light/Dockerfile`) | `packages/host-local/src/nest/main.ts` Nest+Fastify 单进程 | 单进程、零 Go、共享 PG、完整 governance/retrieval/candidate 能力 | `docker compose --profile team-monolith up server postgres` ; `RUNTIME_MODE=combined`, `TRAPMAP_DEPLOYMENT_PROFILE=team-monolith` |
| **B — heavy-Node** | `pnpm build:heavy` → `@trapmap/app-distributed`（禁用 Go） | `trap-map-server:latest` (`apps/distributed/Dockerfile`) | `packages/host-distributed/src/gateway/*` + 6 service owners | gateway 4000 + `candidate-ingestion:4004` + `governance-review:4005` + `job-runtime:4006`(+ knowledge-read/write)，共享 PG，无 Go hop | `docker compose --profile distributed up gateway postgres candidate-ingestion governance-review job-runtime identity-access knowledge-read knowledge-write`（`TRAPMAP_KNOWLEDGE_READ_GO_ENABLED=false`, `TRAPMAP_GO_ACCELERATOR_ENABLED=false`） |
| **C — heavy+Go** | heavy + `services/go-accelerator` + `services/knowledge-read-go` | `+ trap-map-go-accelerator:latest` + `trap-map-knowledge-read-go:latest` | 同 B + `services/knowledge-read-go/cmd/server/main.go:4101` (`chi+pgxpool+lru+singleflight`) 承接读路径 `query→recall→ranking→assembly→cache` | gateway 仍 4000，但 `GET /v1/knowledge/search` 与 `POST /v1/retrieval/*` 经 `infra/src/go-accelerator` → Go 读服务（`TRAPMAP_GO_ACCEL_CACHE_SIZE=10000`），其余写/治理仍 Node；Go 仅只读 PG | 同 B 再 `+ go-accelerator:4100` + `knowledge-read-go:4101`（`TRAPMAP_KNOWLEDGE_READ_GO_ENABLED=true`, `TRAPMAP_READ_IMPL=shadow` 起步，验证后可 `go-only` 对比） |

> 三产物覆盖**构建目标 × 运行时拓扑 × 读路径实现**三维对比；A 是 operator 单机真相，B 是分布式基线，C 是 Go 接管读路径的性价回归对象。

---

## 1. CLI 验证面（与 `apps/cli/src/commands/*` 一一对应）

### 1.1 必须覆盖的命令族（`trapmap --help` / `trapmap api:list` 为准）

| 族 | 代表命令 | 前置 | 预期产物 |
|----|----------|------|----------|
| auth/session | `trapmap login --key <key>` / `trapmap session --json` / `trapmap logout` | 需 `TRAPMAP_SYSTEM_ADMIN_KEY` 或 seed member key | 200 + session token 落 `~/.config/trapmap`，`session --json` 返回 `effectivePermissions` |
| team/member | `trapmap team create --name ...` / `trapmap member create/list` / `trapmap team policy ...` | 需 admin | team/member 可 `list` 回显 |
| knowledge lifecycle | `trapmap knowledge submit --file <trap.md> --json` / `resubmit` / `supersede` / `review approve/reject/return` | 需 `knowledge:submit/review` | `lifecycleState` 流转 `submitted→approved` 可查 |
| retrieval | `trapmap retrieval search --query "..." --json` / `retrieval search --use-v2 --json` / `gene search` | 需 knowledge 数据 | 返回 `matches/capsules` 非空，score/citation 可解析 |
| skill | `trapmap skill find --query ... --json` / `skill add --source ...` / `skill apply` | 需 registry 可达 | find 命中 + add 成功 |
| review/governance | `trapmap review queue --json` / `trapmap review approve --id ...` | 需治理队列数据 | queue 可分页，approve 状态变更 |
| artifacts | `trapmap artifacts export --out .tmp/artifacts.json --json` / `trapmap audit list` | 需 artifacts | export 文件落盘且 JSON 合法 |
| feedback/maintenance | `trapmap feedback submit --entryId ...` / `trapmap maintenance run --json` | 需 feedback 权限 | feedback 入队，maintenance 触发 |
| ops | `trapmap load --file ...` / `operations status` | 需 ops 权限 | load 成功，status 返回 `async` 概览 |

> 每个命令必须同时验证 **`--json` 结构化输出可被 `jq` 解析**与**人类可读输出非空**；失败命令需落 `stderr` 快照与 `exitCode`。

### 1.2 Fixture 与数据准备

- 使用 `evals/fixtures/traps/*.md` 与 `packages/skills/workflow-with-trapmap` 作为最小种子；每轮前 `pnpm --filter @trapmap/db exec tsx src/seed.ts` 或 `apps/cli load` 重建 baseline。
- 检索前需至少 `knowledge submit` 3 条 + `review approve` 1 条，确保召回非空。
- 每产物首轮前执行 `pnpm --filter @trapmap/host-distributed exec tsx src/migrate.ts`（或 light 侧等价）确保 42 表 schema 就绪。

### 1.3 重复次数与幂等

- 每产物 **≥3 轮全量 CLI 回归**（`run=1..N`），轮间执行 `docker compose restart postgres` 或 `TRUNCATE` 隔离，验证无状态泄漏。
- 每轮内高频读命令（`retrieval search`）额外 `×10` 循环，采集 p50/p95 延迟（`time trapmap retrieval search ...`）与 Go cache hit 率（C 产物 `GET /metrics` 的 `go_accel_cache_hits_total`）。

---

## 2. Docker 资源观测规范

### 2.1 采集面

- **CPU / 内存**：`docker stats --no-stream --format '{{json .}}'` 逐容器 `CPUPerc / MemUsage / MemPerc / NetIO / BlockIO / PIDs`；采样频率每轮 CLI 序列前后各一次 + 循环中每 2s 采样（`watch -n2`）。
- **磁盘**：`docker system df -v`（image/container/volume 细项） + `docker inspect <container> --format '{{.SizeRootFs}}'` + 宿主 `df -h /var/lib/docker` + `du -sh .data logs`；每轮前后 diff。
- **网络/日志增量**：`docker logs --timestamps <container> | wc -l` 与 `du -sh logs/`，关联 CLI 产出。
- **PG 磁盘**：`SELECT pg_database_size('trapmap')` 与 `docker exec trapmap-postgres du -sh /var/lib/postgresql/data`.

### 2.2 阈值（首版基线，未达标记 `WARN` 不阻断，发 `open-debt`）

| 指标 | A light | B heavy-Node | C heavy+Go |
|------|---------|--------------|------------|
| 启动后 idle CPU | ≤5% 单容器 | gateway ≤5% + workers 各 ≤3% | 同 B，但 `knowledge-read-go` ≤2% |
| 单轮 CLI 全量峰值 CPU | ≤80% | 网关 ≤80%，单 worker ≤60% | Go 读服务 ≤60%（替代 Node recall CPU） |
| 内存 RSS 峰值 | ≤1.2 GB 单容器 | gateway ≤800MB + workers 各 ≤512MB | + Go 读服务 ≤400MB |
| 磁盘增量/轮 | ≤50 MB (`image` 不增，仅 `container writable + volume`) | 同左 | 同左，Go image 层已计入 `df -v` |
| 检索 p95（10 次循环） | — | 基准 | C 相对 B 读 p95 ≤1.1×（shadow 模式）或 ≤0.9×（go-only）才视为收益 |

> 阈值首轮实测后校准；超限项入 `docs/todos/open-debt-and-compromises.md` 但不回滚主线。

### 2.3 证据落点

- 结构化：`benchmarks/results/cli-integration/{A-light,B-heavy,C-go}/{run-01..run-0N}/stats.jsonl` + `df.json` + `cli-timings.jsonl` + `metrics.txt`（C 的 `/metrics` 快照）。
- 人读：`docs/archived/evidence/cli-integration-2026-09-02/{A-light,B-heavy,C-go}/README.md` 聚合表 + 折线图（`pnpm exec tsx scripts/cli-integration-report.ts` 生成，见 Phase 4）。
- 原始 `docker stats` 与 `docker system df` 快照必须 commit 为证据，禁止仅口头结论。

---

## 3. 分阶段执行计划（Subagent-Driven, Disjoint File Sets）

> 总则：每 Phase 由 1 owner + N subagent 并行；每个 subagent 单次只改 disjoint 文件集；每 Phase 结束 `typecheck + check:docs/structure/complexity + focused test` 全绿才可勾选；Phase 0 证据未落不得进入 Phase 1。

### Phase 0 — 基建与可复现底座（预计 1 day）

- [ ] **0.1 构建产物产出与镜像校验**（owner: `infra`）
  - `pnpm build && pnpm build:light && pnpm build:heavy && docker build -f apps/light/Dockerfile -t trap-map-host-local:latest . && docker build -f apps/distributed/Dockerfile -t trap-map-server:latest . && docker build -f services/go-accelerator/Dockerfile -t trap-map-go-accelerator:latest services/go-accelerator && docker build -f services/knowledge-read-go/Dockerfile -t trap-map-knowledge-read-go:latest services/knowledge-read-go`
  - `docker images | grep trap-map` 落快照，`docker system df -v` 基线；任一构建失败即阻断。

- [ ] **0.2 compose 形态与网络隔离验证**
  - `docker network create trapmap-distributed || true`；校验 `docker compose --profile team-monolith config` / `--profile distributed config` 无 `port 4000` 冲突。
  - 产出 `docs/archived/evidence/cli-integration-2026-09-02/compose-config/{light,heavy,heavy-go}.yaml`。

- [ ] **0.3 CLI 二进制与真 gateway 预检**
  - `pnpm --filter @trapmap/cli build && node ./apps/cli/dist/index.js about && node ./apps/cli/dist/index.js api:list | wc -l` 计数对照 `apps/cli/src/index.ts` 注册数。
  - `TRAPMAP_DATABASE_URL=postgres://trapmap:trapmap@127.0.0.1:5432/trapmap pnpm --filter @trapmap/app-light exec tsx src/migrate.ts --dry-run` 校验 42 表可建。

- [ ] **0.4 资源采集脚本落地**（`scripts/cli-integration-collect.ts` + `scripts/cli-integration-report.ts`）
  - `collect`: 封装 `docker stats --no-stream --format json` → `stats.jsonl`, `docker system df -v` → `df.json`, `curl -s http://127.0.0.1:4000/health` → `health.json`, `curl -s http://127.0.0.1:4101/metrics || true` → `metrics.txt`。
  - `report`: 将 `benchmarks/results/cli-integration/**` 聚合为 Markdown 表 + `mermaid` 折线（CPU/内存/磁盘三图）。
  - 单测：`pnpm test:file -- scripts/__tests__/cli-integration-collect.test.ts`（mock `execSync`）。

- [ ] **0.5 清理守则与回滚脚本**
  - `scripts/cli-integration-reset.sh`: `docker compose --profile distributed --profile team-monolith down -v --remove-orphans; docker volume prune -f; rm -rf .data/* logs/*; docker system df -v`，确保轮转隔离。

**Phase 0 验收**：三镜像可构建、`compose config` 无冲突、CLI `api:list` 非空、四脚本可执行且单测绿。

---

### Phase 1 — Artifact A (light) 真实 CLI 回归 × 资源基线

- [ ] **1.1 启动与健康**
  - `TRAPMAP_DATABASE_URL=... docker compose --profile team-monolith up -d --build --wait`；`curl -f http://127.0.0.1:4000/health` 与 `/ready` 200；`docker ps --format table` 快照。

- [ ] **1.2 CLI 全量回归（轮 1）+ 资源采样**
  - 按 §1.1 顺序执行 12 族命令，每条 `time` 计时、保存 `stdout`/`stderr`/`exitCode` 至 `benchmarks/results/cli-integration/A-light/run-01/cli-*.json`；前后各一次 `collect`，循环中 `retrieval search ×10` 期间每 2s `docker stats` 后台采样。
  - 断言：所有命令 `exit 0` 且 `--json` 可 `jq`，`retrieval` 非空；任一失败落 `FAILED.md` 并重跑 1 次确认 flake。

- [ ] **1.3 重复轮 2/3 + 磁盘增量**
  - 执行 `cli-integration-reset.sh` 后重跑 1.1-1.2 两次；`du -sh .data` 与 `pg_database_size` diff 三轮对比；产出 `A-light/README.md` 初版表。

- [ ] **1.4 证据与报告**
  - `report` 生成 `docs/archived/evidence/cli-integration-2026-09-02/A-light/report.md`（含 CPU/内存/磁盘表 + CLI p95）。

**Phase 1 验收**：3 轮全绿、`stats.jsonl` 每轮 ≥3 样本、`system df -v` 三轮无 image 层泄漏、报告可复现。

---

### Phase 2 — Artifact B (heavy-Node, 无 Go) 分布式对等回归

- [ ] **2.1 启动（分布式 Node-only）**
  - `TRAPMAP_KNOWLEDGE_READ_GO_ENABLED=false TRAPMAP_GO_ACCELERATOR_ENABLED=false docker compose --profile distributed up -d --wait gateway postgres candidate-ingestion governance-review job-runtime identity-access knowledge-read knowledge-write`；`curl -f http://127.0.0.1:4000/health | jq .dependencies` 确认 6 服务 `healthy`。

- [ ] **2.2 CLI 全量回归（轮 1..3）**
  - 复用 1.2 同套 CLI 序列；额外覆盖 `distributed` 特有：`gateway` 路由透传（`knowledge-read` 的 `search` 经 gateway 4000 非直连）、`candidate ingestion` 跟踪（`submit` 后 `review queue` 可见）、`job-runtime` 异步 outbox（`operations status/async`）。
  - 资源采样同 1.2，但 `docker stats` 需逐容器（gateway/candidate/governance/job-runtime/postgres）分别记录，不得合并为单容器平均。

- [ ] **2.3 与 A 的等价性对比**
  - 同一 CLI 输入在 A 与 B 上的 `responses` 逐字段 diff（`jq -S` 归一化后 `diff -u`），仅允许 `traceId/timestamp` 差异；不一致项记为 `PARITY_DRIFT` 入 `open-debt`。

- [ ] **2.4 证据与报告**
  - 产出 `docs/archived/evidence/cli-integration-2026-09-02/B-heavy/report.md` + `A-vs-B-parity.md`。

**Phase 2 验收**：B 三轮全绿、逐容器 `stats.jsonl` 完整、A/B parity 无业务字段漂移。

---

### Phase 3 — Artifact C (heavy+Go) 读路径接管回归

- [ ] **3.1 启动（heavy+Go, shadow 起步）**
  - `TRAPMAP_KNOWLEDGE_READ_GO_ENABLED=true TRAPMAP_READ_IMPL=shadow TRAPMAP_GO_ACCEL_CACHE_SIZE=10000 docker compose --profile distributed up -d --wait gateway postgres go-accelerator knowledge-read-go candidate-ingestion governance-review job-runtime`；校验 `curl -f http://127.0.0.1:4101/health` + `curl -f http://127.0.0.1:4100/health` 200，且 `gateway /health` 含 `knowledgeReadGo: healthy`。

- [ ] **3.2 Shadow 模式 CLI 回归（轮 1..3）**
  - 同套 CLI 全量；重点 `retrieval search` ×10 循环时记录 `go-accelerator` 与 `knowledge-read-go` 的 `stats` 及 Go `/metrics`（`cache_hits/miss`, `pg_pool_conns`, `request_duration_seconds` histogram）。
  - 断言：shadow 下 C 返回与 B 字节一致（`infra` fallback 保证），`metrics` 显示 cache 命中率递增。

- [ ] **3.3 Go-only 对比（可选，若 shadow 全绿）**
  - `TRAPMAP_READ_IMPL=go-only` 重启 `knowledge-read-go` 后单轮 CLI 回归，记录 p95 相对 B 的收益；不一致记为 `GO_PARITY_DRIFT` 并回退 `shadow`。

- [ ] **3.4 证据与报告**
  - 产出 `docs/archived/evidence/cli-integration-2026-09-02/C-go/report.md` + `B-vs-C-perf.md`（CPU/内存/p95 收益表）。

**Phase 3 验收**：C shadow 三轮全绿、Go 容器 `stats.jsonl` 与 `/metrics` 快照完整、与 B 响应等价（shadow）或收益可量化（go-only）。

---

### Phase 4 — 跨产物综合对比与量化报告

- [ ] **4.1 报告器定版**（`scripts/cli-integration-report.ts` 强化）
  - 输入 `benchmarks/results/cli-integration/{A,B,C}/**`，输出 `docs/archived/evidence/cli-integration-2026-09-02/SUMMARY.md`：三产物 CPU/内存/磁盘/ `retrieval p95` 四表 + 三折线图（`mermaid xychart-beta`，需过 `pnpm check:mermaid`）。

- [ ] **4.2 阈值判定与 debt 登记**
  - 将实测对照 §2.2 阈值，超限项写入 `docs/todos/open-debt-and-compromises.md`（新增 `cli-integration resource drift 2026-09-02` 条目，含 `进入条件/后续落点`）。

- [ ] **4.3 文档回写**
  - 更新 `docs/operations/REGRESSION-COMMANDS.md`（新增 `pnpm test:cli-integration` 入口）、`docs/architecture/DEPLOYMENT.md`（三产物实测资源区间）、`docs/architecture/GO_TECH_STACK.md` 附录（Go 读服务实测收益）。

**Phase 4 验收**：`SUMMARY.md` 含真实数据、三图可渲染、债务已登记、doc guard 全绿。

---

### Phase 5 — 自动化与 Closeout

- [ ] **5.1 一键脚本**（`scripts/cli-integration-run.sh` / `pnpm test:cli-integration`）
  - 串联 `collect → run CLI matrix → collect → report`，支持 `--artifact A|B|C|all --runs 3 --keep-volumes`；失败保留 `benchmarks/results` 供复盘。

- [ ] **5.2 守卫与 CI 接线（dry-run friendly）**
  - `package.json` 新增 `test:cli-integration`（调用 `run.sh --dry-run` 时仅校验 CLI `api:list` + `compose config`，不需 docker），`check:docs` 新增 `SUMMARY.md` 必须含 `docker stats` 表的 `mustContain`。

- [ ] **5.3 Closeout 归档**
  - `git mv docs/todos/cli-server-integration-mainline.md docs/archived/archived-plans/cli-server-integration-mainline-archived.md`，更新 `docs/archived/README.md` 与 `docs/todos/README.md`，`plan.md` 切回 `暂无 active mainline` 或下一候选；`typecheck/docs/structure/complexity` 全绿。

---

## 4. Subagent 派发计划（Disjoint File Sets, Max Parallel）

| Subagent | 负责 Phase | 文件集（互斥） | 验证 |
|----------|-----------|---------------|------|
| S0-infra | Phase 0.4-0.5 | `scripts/cli-integration-collect.ts`, `scripts/cli-integration-report.ts`, `scripts/cli-integration-reset.sh`, `scripts/__tests__/cli-integration-*.test.ts` | `pnpm test:file -- scripts/__tests__/cli-integration-collect.test.ts` + `typecheck` |
| S1-light | Phase 1 | `benchmarks/results/cli-integration/A-light/*`, `docs/archived/evidence/cli-integration-2026-09-02/A-light/*`（仅证据，不改脚本） | `docker stats` 落盘 + CLI 全量 3 轮 |
| S2-heavy | Phase 2 | `benchmarks/results/cli-integration/B-heavy/*`, `docs/archived/evidence/.../B-heavy/*` | 同上，逐容器 stats |
| S3-go | Phase 3 | `benchmarks/results/.../C-go/*`, `docs/archived/evidence/.../C-go/*` | + `/metrics` 快照 |
| S4-report | Phase 4 | `docs/archived/evidence/.../SUMMARY.md`, `docs/operations/REGRESSION-COMMANDS.md`, `docs/architecture/DEPLOYMENT.md` | `check:docs` |
| S5-automation | Phase 5 | `scripts/cli-integration-run.sh`, `package.json` scripts, `scripts/complexity-budgets.json` | `pnpm test:cli-integration -- --dry-run` |

> 主控仅负责 `docs/todos/cli-server-integration-mainline.md` 与 `plan.md`，不与 subagent 争写同一文件。

---

## 5. 最小验证集合（按改动范围）

- 采集/报告脚本：`pnpm --filter @trapmap/cli test --run` + `pnpm test:file -- scripts/__tests__/cli-integration-collect.test.ts` + `pnpm typecheck`
- 三产物回归：`curl -f http://127.0.0.1:4000/health` + `curl -f http://127.0.0.1:4000/ready` + CLI 全量 `exit 0` + `jq` 解析
- 分布式：`pnpm test:distributed-closeout` + `pnpm test:discovery-closeout`
- Go 读服务：`go test ./... -count=1`（`services/knowledge-read-go` + `services/go-accelerator`） + `go vet ./...`
- 文档：`pnpm check:docs && pnpm check:structure && pnpm check:complexity && pnpm check:mermaid`

---

## 6. 风险与回退

| 风险 | 缓解 |
|------|------|
| Go 镜像构建慢/失败 | Phase 0 先 `docker build` 探路，失败即降级为仅 A/B |
| PG 卷污染导致 CLI 非幂等 | 每轮必 `reset.sh`，并 `SELECT count(*) FROM knowledge_entries` 断言 baseline |
| `docker stats` 采样抖动 | 每轮 ≥3 样本取中位数，报告中标注 `min/median/max` |
| 端口 4000 占用 | 启动前 `lsof -i :4000 || ss -tlnp` 检查，失败自动 `down -v` |
| `mermaid xychart-beta` 渲染失败 | 回退为 `flowchart` + 表格，`check:mermaid` 本地验证 |

---

## 7. 问题池（新发现先入此，不另开主线）

- [ ] Go `shadow` 与 `go-only` 的 p95 收益是否稳定（需多日基线）
- [ ] `docker system df -v` 的 `BuildCache` 膨胀是否影响磁盘阈值
- [ ] CLI `skill add` 需外网，离线环境是否 mock registry
- [ ] `TRAPMAP_TASK_TRANSPORT=amqp` 与本主线 PG 队列是否需交叉（deferred，已在 `open-debt` 登记）

---

## 8. 证据清单（Closeout 时勾选）

- [ ] `benchmarks/results/cli-integration/A-light/run-0{1,2,3}/stats.jsonl + df.json + cli-timings.jsonl`
- [ ] `benchmarks/results/cli-integration/B-heavy/run-0{1,2,3}/stats.jsonl`（逐容器） + `parity.json`
- [ ] `benchmarks/results/cli-integration/C-go/run-0{1,2,3}/stats.jsonl + metrics.txt + cache-hit.json`
- [ ] `docs/archived/evidence/cli-integration-2026-09-02/{A-light,B-heavy,C-go}/report.md`
- [ ] `docs/archived/evidence/cli-integration-2026-09-02/SUMMARY.md`（三产物四表三图）
- [ ] `pnpm typecheck 0` / `check:docs 7/7` / `check:structure 3/3` / `check:complexity green` / `check:mermaid pass` 截图

