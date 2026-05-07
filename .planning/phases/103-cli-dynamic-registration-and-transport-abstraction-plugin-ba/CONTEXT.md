# Phase 103: CLI Dynamic Registration and Transport Abstraction — Context

## Why This Phase Exists

CLI 命令在 `packages/cli/src/index.ts` 中逐一 import 并手动注册。每新增一个命令领域需要：
1. 创建 `commands/xxx.ts` 文件
2. 在 `index.ts` 中添加 import 语句
3. 在 `index.ts` 中添加 `registerXxxCommands()` 调用
4. 在 `index.ts` 中添加权限 visibility 判断

`lib/http.ts` 硬编码了对 Fastify HTTP API 的调用方式（fetch + auth header injection），CLI 与 HTTP transport 紧耦合。

## Current Architecture (Before)

### Command Registration (index.ts)
```typescript
import { registerAuthCommands } from './commands/auth.js';
import { registerTeamCommands } from './commands/team.js';
import { registerMemberCommands } from './commands/member.js';
import { registerKnowledgeCommands } from './commands/knowledge.js';
import { registerTrapCommands } from './commands/trap.js';
import { registerRetrievalCommands } from './commands/retrieval.js';
import { registerReviewCommands } from './commands/review.js';
import { registerSkillCommands } from './commands/skill.js';
import { registerOperationsCommands } from './commands/operations.js';
import { registerAuditCommands } from './commands/audit.js';
import { registerEvidenceCommands } from './commands/evidence.js';
import { registerDecayCommands } from './commands/decay.js';
import { registerMaintenanceCommands } from './commands/maintenance.js';
import { registerFeedbackCommands } from './commands/feedback.js';
import // ... 每加一个命令都要手动 import + 注册

const visibility = { /* 权限判断 */ };
registerAuthCommands(program);
registerTeamCommands(program, { allowCreate: visibility.allowTeamCreate });
registerKnowledgeCommands(program, { /* permissions */ });
// ... 15+ 个手动注册调用
```

### HTTP Transport (lib/http.ts)
```typescript
// 硬编码 fetch 调用
export async function httpClient(method, path, body?) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Cookie': sessionCookie, ... },
    body: JSON.stringify(body),
  });
  return response.json();
}
```

## Target Architecture (After)

### Transport Abstraction
```typescript
interface Transport {
  call(method: string, params: Record<string, unknown>): Promise<unknown>;
  healthCheck(): Promise<boolean>;
}

class HttpTransport implements Transport { /* 现有 http.ts 逻辑 */ }
class InProcessTransport implements Transport { /* app.inject() for testing */ }

// 工厂
function createTransport(config: CliConfig): Transport {
  return config.serverUrl
    ? new HttpTransport(config.serverUrl, config.session)
    : new InProcessTransport();
}
```

### Auto-discovery
```typescript
// index.ts 简化
const commandFiles = glob.sync('commands/*.ts', { cwd: __dirname });
for (const file of commandFiles) {
  const mod = await import(`./${file}`);
  mod.register(program, ctx);
}
```

### Unified Command Context
```typescript
interface CommandContext {
  transport: Transport;
  visibility: VisibilityMap;
  config: CliConfig;
  output: OutputFormatter;
}

// 每个命令
export function register(app: Command, ctx: CommandContext) {
  app.command('submit')
    .action(async (content) => {
      const result = await ctx.transport.call('knowledge.submit', { content });
      ctx.output.success(result);
    });
}
```

## Key Files to Understand

### CLI Entry
- `packages/cli/src/index.ts` — 主入口，命令注册 + 权限 visibility 计算

### Command Modules (all need migration)
- `packages/cli/src/commands/auth.ts`
- `packages/cli/src/commands/team.ts`
- `packages/cli/src/commands/member.ts`
- `packages/cli/src/commands/knowledge.ts`
- `packages/cli/src/commands/trap.ts`
- `packages/cli/src/commands/retrieval.ts`
- `packages/cli/src/commands/review.ts`
- `packages/cli/src/commands/skill.ts`
- `packages/cli/src/commands/operations.ts`
- `packages/cli/src/commands/audit.ts`
- `packages/cli/src/commands/evidence.ts`
- `packages/cli/src/commands/decay.ts`
- `packages/cli/src/commands/maintenance.ts`
- `packages/cli/src/commands/feedback.ts`

### Infrastructure
- `packages/cli/src/lib/config.ts` — CLI 状态管理（session, team, format）
- `packages/cli/src/lib/http.ts` — HTTP 客户端（→ Transport 实现）
- `packages/cli/src/lib/output.ts` — 输出格式化（→ OutputFormatter 实现）

### Permission Model
- `packages/contracts/src/domain/common.ts` — permissionSchema (15 permissions)
- `packages/cli/src/index.ts` lines 21-55 — visibility 计算逻辑

## Constraints

- **No external dependencies** — Transport 和自动发现用 Node.js 内置能力（glob 用已有的 fast-glob/vite 依赖）
- **Backward compatible** — 命令行参数和输出格式不变
- **Load command still works** — Phase 96 的 `trapmap load` 命令必须兼容新注册机制
- **Permission visibility preserved** — 命令动态注册后仍需正确判断可见性

## Risks

- 动态 import 可能有启动性能影响（首次 import 的编译开销）
- 自动发现可能意外注册测试文件或非命令文件（需约定过滤）
- Transport 抽象可能过度设计（如果只有 HTTP 一种实现长期存在）

## Dependencies

- Phase 102: IndexAdapter Generalization（确保 server 端架构稳定后再改 CLI）
- Phase 96: Agent-Native CLI — trapmap load（load 命令需兼容新注册机制）
