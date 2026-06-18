# Runtime Recomposition Plan 01: Shared Client Core Extraction

## 状态

- 状态：`active`
- 依赖：`00-baseline-and-target-architecture.md`

## 目标

从 `packages/cli` 中抽出一个可复用的客户端共享核心包，先承载当前 `lib/http.ts` 的 gateway 访问层，再逐步承载 CLI 和 Web 面板都会复用的 session、错误模型、请求封装与高层 resource client。

## 当前事实

- `packages/cli/src/lib/http.ts` 当前已经具备：
  - 基于单一 gateway URL 的请求模型
  - 统一 `ApiError`
  - session token header 注入与续传
  - JSON 响应解析与错误归一化
- 它仍直接依赖 `CliState` 与 `resolveCliGatewayUrl()`，因此无法直接被 Web 面板复用。

## 目标产物

建议新增：

- `packages/client-core/package.json`
- `packages/client-core/src/index.ts`
- `packages/client-core/src/http/*.ts`
- `packages/client-core/src/session/*.ts`
- `packages/client-core/src/resources/*.ts`
- `packages/client-core/README.md`

建议在 `packages/cli` 中保留：

- CLI state 持久化
- 命令参数解析
- 输出格式化
- 调用 `client-core` 的 adapter

## 设计原则

### 1. 先抽低层 transport，再抽资源级 client

第一步只抽：

- `ApiError`
- request/response envelope
- base URL resolution contract
- auth/session injection contract
- JSON parse / error normalization

第二步再抽：

- auth client
- retrieval client
- operations client
- skill / trap / feedback 等资源 client

### 2. 不把 CLI state 带进新包

共享包不能依赖 `CliState`。建议改成显式注入：

- `baseUrl`
- `getSessionToken(): string | null`
- `setSessionToken?(token: string | null): void`

### 3. 优先浏览器兼容

- 共享层必须以 `fetch` 标准接口为基础。
- 不能引入 Node-only API、文件系统依赖或 TTY 输出逻辑。
- 包导出应能同时被 CLI 和未来浏览器端 bundler 消费。

## 计划阶段

### Phase 1. 抽 transport 和 session contract

- 新建最小 `client-core`
- 从 CLI 迁出 `ApiError`、`apiRequest`、response parsing
- 把 `CliState` 依赖改成显式 session/baseUrl provider

### Phase 2. 为 CLI 建立 adapter

- `packages/cli` 新增 adapter，把 `CliState` 映射到 `client-core` contract
- 保持现有命令面不变

### Phase 3. 建立 resource-level client

- 把当前 CLI 命令中重复的 endpoint/path 拼接和请求 envelope 收口到共享资源 client
- 优先覆盖后续 Web 面板首批会用到的 auth、retrieval、operations/status

### Phase 4. 设计浏览器消费边界

- 明确浏览器端 session 存储、CSRF/credential 策略、token 更新方式
- 保持这部分作为 host adapter，不污染共享核心包

## 风险

- 如果抽包时把 CLI 配置模型直接搬过去，会让共享包反向依赖终端工具语义。
- 如果一开始就把所有命令逻辑都塞进共享包，会做成另一个“无边界大包”。
- 如果没有先冻结浏览器兼容约束，后续 Web 面板接入时仍会发生二次拆分。

## 验收标准

- CLI 不再直接持有底层 HTTP transport 实现。
- `client-core` 可在不依赖 CLI state 的情况下完成认证请求和普通 API 请求。
- 新包能明确承接未来 Web 面板对 gateway 的首批复用需求。

