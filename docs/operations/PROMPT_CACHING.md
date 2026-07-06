# 提示缓存指南

提示缓存系统将系统提示分解为**静态**（可缓存）和**动态**（按请求变化）两部分，从而利用提供商级别的提示缓存来降低成本和延迟。

## 架构概览

```
┌──────────────────────────────────────────────────────────────┐
│                    CacheSection[]                             │
│                                                              │
│  ┌─────────────────────────────────┐  cacheScope: 'global'   │
│  │ role, core_principles,          │  （静态 — 可缓存）        │
│  │ security, tool_usage_rules      │                         │
│  └─────────────────────────────────┘                         │
│  ┌─────────────────────────────────┐                         │
│  │ __CACHE_BOUNDARY__              │  （哨兵标记）             │
│  └─────────────────────────────────┘                         │
│  ┌─────────────────────────────────┐  cacheScope: null       │
│  │ code_context, current_env,      │  （动态 — 按请求变化）    │
│  │ examples, metadata              │                         │
│  └─────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│                    PromptBlock[]                              │
│                                                              │
│  ┌─────────────────────────────────┐  cache_control:         │
│  │ （静态部分拼接）                │  { type: 'ephemeral',   │
│  │                                 │    scope: 'global' }    │
│  └─────────────────────────────────┘                         │
│  ┌─────────────────────────────────┐  （无 cache_control）    │
│  │ 动态部分 1                      │                         │
│  └─────────────────────────────────┘                         │
│  ┌─────────────────────────────────┐  （无 cache_control）    │
│  │ 动态部分 2                      │                         │
│  └─────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────┘
```

管线流程：
1. `buildPromptWithCacheControl()` 生成带有静态/动态分类的 `CacheSection[]`
2. 在两组之间插入 `__CACHE_BOUNDARY__` 哨兵标记
3. `buildSystemPromptBlocks()` 将各部分转换为带有 `cache_control` 头的 API 兼容 `PromptBlock[]`

## 核心类型

### `CacheSection`

```typescript
interface CacheSection {
  readonly name: string;       // 部分标识符（如 "role"、"core_principles"）
  readonly content: string;    // 渲染后的内容
  readonly cacheScope: 'global' | 'org' | null;
  // 'global' = 系统级缓存，'org' = 组织级，null = 不缓存
}
```

### `CacheControlHeader` 和 `PromptBlock`

```typescript
interface CacheControlHeader {
  type: 'ephemeral';
  scope: 'global' | 'organization';
}

interface PromptBlock {
  content: string;
  cache_control?: CacheControlHeader;  // 仅静态部分存在此字段
}
```

## 提供商缓存策略

每个提供商定义哪些部分是静态的（可缓存）、哪些是动态的（按请求变化）：

| 提供商      | 静态部分                                               | 动态部分                                  |
|-------------|--------------------------------------------------------|-------------------------------------------|
| `anthropic` | `role`、`core_principles`、`security`、`tool_usage_rules` | `code_context`、`current_environment`、`examples` |
| `openai`    | `role`、`task`、`constraints`                          | `code_context`、`current_environment`     |
| `deepseek`  | `role`、`core_principles`、`constraints`               | `code_context`、`current_environment`、`examples` |
| `kimi`      | `role`、`task`、`constraints`                          | `code_context`、`current_environment`     |
| `gemini`    | `role`、`core_principles`、`constraints`               | `code_context`、`current_environment`、`examples` |
| `default`   | `role`、`core_principles`、`constraints`               | `code_context`、`current_environment`、`examples` |

## API 参考

### `buildPromptWithCacheControl(taskType, slots, modelId?): CacheSection[]`

构建分解为缓存分类部分的提示。`__CACHE_BOUNDARY__` 标记部分会自动插入到最后一个静态部分和第一个动态部分之间。

```typescript
import { buildPromptWithCacheControl } from './lib/ai/prompts.js';

const sections = buildPromptWithCacheControl(
  'boundary-extraction',
  mySlots,
  'claude-opus-4-6',
);

// sections[0..n]  — cacheScope: 'global' 的静态部分
// sections[n+1]   — cacheScope: null 的 __boundary__ 标记
// sections[n+2..] — cacheScope: null 的动态部分
```

### `splitPromptByBoundary(sections): BoundarySplit`

根据 `__CACHE_BOUNDARY__` 哨兵标记将 `CacheSection[]` 数组拆分为静态前缀和动态后缀。由 `buildSystemPromptBlocks()` 内部使用，也可用于自定义缓存策略。

```typescript
import { splitPromptByBoundary } from './lib/ai/cache/index.js';

const { staticPrefix, dynamicSuffix } = splitPromptByBoundary(sections);
// staticPrefix: 边界标记之前的所有部分（均为 cacheScope: 'global'）
// dynamicSuffix: 边界标记之后的所有部分（cacheScope: null）
```

如果未找到边界标记，`staticPrefix` 为空，`dynamicSuffix` 包含所有部分。

### `buildSystemPromptBlocks(sections): PromptBlock[]`

将 `CacheSection[]` 转换为带有 `cache_control` 头的 API 兼容块。静态部分被拼接为单个带有 `ephemeral` / `global` 缓存控制头的块。每个动态部分成为独立的块，不带缓存。

```typescript
import { buildSystemPromptBlocks } from './lib/ai/cache/index.js';

const blocks = buildSystemPromptBlocks(sections);
// blocks[0] = { content: "静态内容...", cache_control: { type: 'ephemeral', scope: 'global' } }
// blocks[1] = { content: "动态内容 1..." }
// blocks[2] = { content: "动态内容 2..." }
```

### `buildCacheControlForSection(section): CacheControlHeader | null`

为单个部分构建 `CacheControlHeader`。当 `cacheScope` 为 `null`（动态部分）时返回 `null`。

```typescript
import { buildCacheControlForSection } from './lib/ai/cache/index.js';

const header = buildCacheControlForSection(sections[0]);
// { type: 'ephemeral', scope: 'global' }

const header = buildCacheControlForSection(dynamicSection);
// null
```

## 部分级 LRU 缓存

内存中的 LRU 缓存存储渲染后的部分内容，避免重复计算。

### 缓存配置

| 参数      | 默认值    | 说明                   |
|-----------|-----------|------------------------|
| `max`     | `1000`    | 最大缓存条目数         |
| `ttlMs`   | `3600000` | 毫秒级 TTL（1 小时）   |

### 缓存 API

```typescript
import {
  getCachedSection,    // 获取或计算缓存部分
  invalidateSection,   // 从缓存中移除特定部分
  clearAllSections,    // 清空整个缓存
  getSectionCacheSize, // 获取当前条目数
  resetSectionCache,   // 重置缓存（用于测试）
  computeHash,         // 内容的 SHA-256 哈希
} from './lib/ai/cache/index.js';

// 从缓存获取，或计算并缓存
const content = getCachedSection('role', () => renderRoleSection());

// 模板变更时失效
invalidateSection('role');

// 检查缓存利用率
const size = getSectionCacheSize();
```

当缓存条目过期（TTL）时，缓存记录一次未命中，原因为 `ttl_expired`。当内容被重新计算时，记录原因为 `content_changed` 的未命中。

## 缓存指标

指标跟踪缓存有效性，用于监控和调优。

### 指标接口

```typescript
interface CacheMetrics {
  hitRate: number;        // 缓存命中数 / 总请求数（0 到 1）
  totalRequests: number;  // 缓存查找总次数
  cacheHits: number;      // 缓存命中次数
  cacheMisses: number;    // 缓存未命中次数
  breakReasons: {
    contentChanged: number; // 因新内容导致的未命中
    modelChanged: number;   // 因模型切换导致的未命中
    ttlExpired: number;     // 因 TTL 过期导致的未命中
  };
}
```

### 指标 API

```typescript
import {
  getCacheMetrics,    // 获取当前指标快照
  resetCacheMetrics,  // 重置所有指标（用于测试）
  trackCacheHit,      // 手动记录命中（通常由 getCachedSection 处理）
  trackCacheMiss,     // 手动记录未命中及原因
} from './lib/ai/cache/index.js';

const metrics = getCacheMetrics();
console.log(`缓存命中率: ${(metrics.hitRate * 100).toFixed(1)}%`);
console.log(`TTL 过期未命中: ${metrics.breakReasons.ttlExpired}`);
```

## 端到端示例

```typescript
import {
  buildPromptWithCacheControl,
  buildSystemPromptBlocks,
  getCacheMetrics,
} from './lib/ai/index.js';

// 1. 构建缓存感知提示
const sections = buildPromptWithCacheControl(
  'boundary-extraction',
  {
    role: '边界提取助手',
    task: '从输入中提取边界约束。',
    constraints: ['返回有效的 JSON。'],
  },
  'claude-opus-4-6',
);

// 2. 转换为带有缓存控制头的 API 块
const blocks = buildSystemPromptBlocks(sections);

// 3. 发送到 API（以 Anthropic Messages API 为例）
const response = await anthropic.messages.create({
  model: 'claude-opus-4-6',
  max_tokens: 4096,
  system: blocks.map((b) => ({
    type: 'text' as const,
    text: b.content,
    ...(b.cache_control ? { cache_control: b.cache_control } : {}),
  })),
  messages: [{ role: 'user', content: userInput }],
});

// 4. 监控缓存性能
const metrics = getCacheMetrics();
console.log(`命中率: ${(metrics.hitRate * 100).toFixed(1)}%`);
```

## 边界标记

`__CACHE_BOUNDARY__` 哨兵是一个纯字符串常量，作为独立的 `CacheSection` 插入在静态和动态内容之间：

```typescript
import { CACHE_BOUNDARY_MARKER } from './lib/ai/cache/index.js';
// CACHE_BOUNDARY_MARKER === '__CACHE_BOUNDARY__'
```

该标记被 `splitPromptByBoundary()` 用于查找拆分点。它**不**包含在静态前缀或动态后缀中 -- 在拆分过程中被消费。

## 最佳实践

1. **缓存静态前缀**：静态部分在请求之间很少变化。通过 `buildSystemPromptBlocks()` 将它们合并为单个缓存块。

2. **保持动态部分精简**：动态部分（示例、上下文、元数据）在每次请求时都会重新发送。最小化它们的大小以降低成本。

3. **监控命中率**：使用 `getCacheMetrics()` 验证缓存是否有效。命中率低于 50% 可能表明过多内容被分类为静态但频繁变化。

4. **模板更新时失效**：修改模板文件或覆盖文件时，调用 `clearAllSections()` 以防止过时的缓存内容。
