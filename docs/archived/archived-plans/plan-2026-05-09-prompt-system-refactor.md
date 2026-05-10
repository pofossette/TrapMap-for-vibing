# Trap-Map 提示词系统完全重构计划

> **方案选择**：方案 B - 完全重构（参考 OpenCode 架构）
>
> **创建时间**：2026-05-09
>
> **预计周期**：3-4 周

---

## 一、重构目标

### 核心目标

将当前基于插槽（slot-based）的单一 XML 模板系统，重构为**基于 Provider 的多格式模板系统**，实现：

1. **多模型适配**：不同 AI 模型使用最佳的 prompt 格式
2. **缓存优化**：静态/动态内容分层，实现 prompt caching
3. **运行时动态**：根据任务类型和会话状态注入内容
4. **可扩展性**：易于添加新的 Provider 和格式

### 参考架构

**OpenCode Provider 模板系统**：
```
prompt/
  anthropic.txt    → Anthropic 专用（Markdown + XML）
  openai.json      → OpenAI 专用（JSON-based）
  deepseek.xml     → DeepSeek 专用（XML）
  kimi.json        → Kimi 专用（JSON-based）
  default.txt      → 默认格式（Markdown）
```

**Claude Code 分层缓存**：
```typescript
systemPromptSection("role", () => "...")           // 静态 → 全局缓存
DANGEROUS_uncachedSystemPromptSection("env", () => "...")  // 动态 → 不缓存
const SYSTEM_PROMPT_DYNAMIC_BOUNDARY = "__DYNAMIC_BOUNDARY__"
```

---

## 二、新架构设计

### 目录结构

```
packages/server/src/lib/ai/
├── providers/                          # Provider 模板系统
│   ├── index.ts                        # Provider 选择和加载逻辑
│   ├── types.ts                        # Provider 类型定义
│   ├── anthropic.xml                   # Anthropic 模板
│   ├── openai.json                     # OpenAI 模板
│   ├── deepseek.xml                    # DeepSeek 模板
│   ├── kimi.json                       # Kimi 模板
│   ├── gemini.xml                      # Gemini 模板
│   └── default.xml                     # 默认模板（当前格式）
├── renderers/                          # 多格式渲染器
│   ├── index.ts                        # 渲染器入口
│   ├── xml-renderer.ts                 # XML 格式渲染
│   ├── json-renderer.ts                # JSON 格式渲染
│   ├── markdown-renderer.ts            # Markdown 格式渲染
│   └── providers/                      # Provider 特定渲染逻辑
│       ├── anthropic-renderer.ts
│       ├── openai-renderer.ts
│       └── ...
├── cache/                              # 缓存管理
│   ├── index.ts                        # 缓存管理入口
│   ├── section-cache.ts                # Section 级别缓存
│   ├── boundary-marker.ts              # 静态/动态边界标记
│   └── metrics.ts                      # 缓存命中率监控
├── dynamic/                            # 运行时动态注入
│   ├── index.ts                        # 动态注入入口
│   ├── injections.ts                   # 内容注入器
│   ├── context-resolver.ts             # 运行时上下文解析
│   └── conditions.ts                   # 条件内容注入
├── slots/                              # 插槽定义（保留，作为 Provider 的配置）
│   ├── index.ts                        # 插槽管理入口
│   ├── types.ts                        # PromptSlots 接口（扩展）
│   └── defaults.ts                     # 默认插槽值
├── prompts.ts                          # 主入口（重构）
├── prompts.test.ts                     # 测试文件（扩展）
└── __fixtures__/                       # 测试用例
    ├── prompt-template.override.json
    └── providers/                      # Provider 模板测试用例
        ├── anthropic.test.ts
        ├── openai.test.ts
        └── ...
```

### 核心类型定义

```typescript
// types/provider.ts

export type AiPromptProvider = 
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'kimi'
  | 'gemini'
  | 'default';

export type AiPromptFormat = 'xml' | 'json' | 'markdown';

export interface ProviderConfig {
  name: AiPromptProvider;
  format: AiPromptFormat;
  templatePath: string;
  cacheStrategy: {
    staticSections: string[];      // 可缓存的 section 名称
    dynamicSections: string[];     // 不可缓存的 section 名称
  };
  specialConstraints?: string[];    // Provider 特定约束
}

// types/slots.ts

export interface PromptSlots {
  // 基础字段（保留向后兼容）
  role?: string;
  task?: string;
  corePrinciples?: string[];
  outputInstructions?: string[];
  constraints?: string[];
  examples?: string[];

  // 新增结构化字段
  codeContext?: Array<{
    path: string;
    content: string;
    language?: string;
  }>;
  security?: {
    fileSafety?: string[];
    commandSafety?: string[];
    credentialSafety?: string[];
  };
  toolUsageRules?: Array<{
    tool: string;
    category: 'general' | 'file' | 'shell' | 'skill' | 'mcp';
    rules: string[];
  }>;
  interactionPatterns?: Array<{
    name: string;
    description: string;
    example: string;
  }>;
  mcpIntegration?: {
    servers: Array<{
      name: string;
      type: 'stdio' | 'http' | 'sse';
      tools: string[];
    }>;
  };
  environment?: {
    os?: string;
    shell?: string;
    workingDirectory?: string;
    date?: string;
  };
}

// types/cache.ts

export interface CacheSection {
  name: string;
  content: string;
  cacheScope: 'global' | 'org' | null;  // null = 不缓存
}

export interface CacheBoundaryMarker {
  position: number;
  label: string;
}

// types/dynamic.ts

export interface DynamicInjection {
  type: 'env' | 'git_status' | 'file_context' | 'mcp_status' | 'runtime';
  placeholder: string;
  resolver: () => string | Promise<string>;
}

export interface ConditionalContent {
  condition: (context: RuntimeContext) => boolean;
  content: string | ((context: RuntimeContext) => string);
}

export interface RuntimeContext {
  taskType: AiPromptTaskType;
  modelType: string;
  isPlanMode: boolean;
  sessionState: 'idle' | 'working' | 'blocked';
  environment: Record<string, string>;
}
```

---

## 三、实施阶段

### 阶段 1：Provider 模板系统（第 1 周）

#### 任务 1.1：定义 Provider 配置（2 天）

**文件**：
- `providers/types.ts` - 类型定义
- `providers/index.ts` - Provider 选择逻辑
- `providers/defaults.ts` - 默认 Provider 配置

**实现要点**：

```typescript
// providers/index.ts

import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROVIDER_CONFIGS: Record<AiPromptProvider, ProviderConfig> = {
  anthropic: {
    name: 'anthropic',
    format: 'xml',
    templatePath: path.resolve(__dirname, 'anthropic.xml'),
    cacheStrategy: {
      staticSections: ['role', 'core_principles', 'security', 'tool_usage_rules'],
      dynamicSections: ['code_context', 'current_environment', 'examples'],
    },
  },
  openai: {
    name: 'openai',
    format: 'json',
    templatePath: path.resolve(__dirname, 'openai.json'),
    cacheStrategy: {
      staticSections: ['role', 'task', 'constraints'],
      dynamicSections: ['code_context', 'current_environment'],
    },
  },
  // ... 其他 Provider
};

export function selectProvider(modelId: string): ProviderConfig {
  if (modelId.includes('claude')) return PROVIDER_CONFIGS.anthropic;
  if (modelId.includes('gpt')) return PROVIDER_CONFIGS.openai;
  if (modelId.includes('deepseek')) return PROVIDER_CONFIGS.deepseek;
  if (modelId.includes('kimi')) return PROVIDER_CONFIGS.kimi;
  if (modelId.includes('gemini')) return PROVIDER_CONFIGS.gemini;
  return PROVIDER_CONFIGS.default;
}

export function loadProviderTemplate(provider: AiPromptProvider): string {
  const config = PROVIDER_CONFIGS[provider];
  return readFileSync(config.templatePath, 'utf8');
}

export function getProviderConfig(provider: AiPromptProvider): ProviderConfig {
  return PROVIDER_CONFIGS[provider];
}
```

#### 任务 1.2：创建 Provider 模板文件（3 天）

**文件**：
- `providers/anthropic.xml` - Anthropic 专用模板
- `providers/openai.json` - OpenAI 专用模板
- `providers/deepseek.xml` - DeepSeek 专用模板
- `providers/kimi.json` - Kimi 专用模板
- `providers/default.xml` - 默认模板（迁移自当前的 XML 格式）

**示例 - Anthropic 模板** (`providers/anthropic.xml`)：

```xml
<system_instructions>
  <role>{{role}}</role>

  <core_principles>
    {{#each corePrinciples}}
    <item>{{this}}</item>
    {{/each}}
  </core_principles>

  <task>{{task}}</task>

  <output_format>
    {{#each outputInstructions}}
    <item>{{this}}</item>
    {{/each}}
  </output_format>

  <constraints>
    {{#each constraints}}
    <item>{{this}}</item>
    {{/each}}
  </constraints>

  {{#if codeContext}}
  <code_context>
    {{#each codeContext}}
    <file path="{{path}}" language="{{language}}">
      {{content}}
    </file>
    {{/each}}
  </code_context>
  {{/if}}

  {{#if security}}
  <security>
    {{#if security.fileSafety}}
    <file_safety>
      {{#each security.fileSafety}}
      <item>{{this}}</item>
      {{/each}}
    </file_safety>
    {{/if}}
    {{#if security.commandSafety}}
    <command_safety>
      {{#each security.commandSafety}}
      <item>{{this}}</item>
      {{/each}}
    </command_safety>
    {{/if}}
    {{#if security.credentialSafety}}
    <credential_safety>
      {{#each security.credentialSafety}}
      <item>{{this}}</item>
      {{/each}}
    </credential_safety>
    {{/if}}
  </security>
  {{/if}}

  {{#if toolUsageRules}}
  <tool_usage_rules>
    {{#each toolUsageRules}}
    <tool name="{{tool}}" category="{{category}}">
      {{#each rules}}
      <item>{{this}}</item>
      {{/each}}
    </tool>
    {{/each}}
  </tool_usage_rules>
  {{/if}}

  {{#if examples}}
  <examples>
    {{#each examples}}
    <example>{{this}}</example>
    {{/each}}
  </examples>
  {{/if}}
</system_instructions>
```

**示例 - OpenAI 模板** (`providers/openai.json`)：

```json
{
  "role": "{{role}}",
  "task": "{{task}}",
  "corePrinciples": "{{#each corePrinciples}}{{this}}{{/each}}",
  "constraints": "{{#each constraints}}{{this}}{{/each}}",
  "outputFormat": {
    "type": "json",
    "schema": "{{outputInstructions}}"
  }
}
```

#### 任务 1.3：更新主入口（2 天）

**文件**：
- `prompts.ts` - 重构主入口
- `prompts.test.ts` - 扩展测试用例

**实现要点**：

```typescript
// prompts.ts

import { selectProvider, loadProviderTemplate, getProviderConfig } from './providers';
import { renderPrompt } from './renderers';
import { injectDynamicContent } from './dynamic';
import { buildPromptWithCacheControl } from './cache';

export function buildPrompt(
  taskType: AiPromptTaskType,
  slots: PromptSlots,
  modelId?: string
): string {
  // 1. 加载 Provider 配置
  const provider = modelId 
    ? selectProvider(modelId) 
    : getProviderConfig(process.env.AI_PROMPT_PROVIDER as AiPromptProvider ?? 'default');
  
  // 2. 加载模板
  const template = loadProviderTemplate(provider.name);
  
  // 3. 合并模板覆盖
  const templateFile = process.env.AI_PROMPT_TEMPLATE_FILE ?? null;
  const overrides = loadPromptTemplateOverrides(templateFile);
  const mergedSlots = normalizeSlots(mergeSlots(slots, overrides[taskType]));
  
  // 4. 渲染提示词
  const renderedPrompt = renderPrompt(mergedSlots, provider.format, template);
  
  // 5. 注入动态内容
  const dynamicInjections = getDynamicInjections(taskType);
  const finalPrompt = injectDynamicContent(renderedPrompt, dynamicInjections);
  
  return finalPrompt;
}

export function buildPromptWithCacheControl(
  taskType: AiPromptTaskType,
  slots: PromptSlots,
  modelId?: string
): CacheSection[] {
  const provider = modelId 
    ? selectProvider(modelId) 
    : getProviderConfig(process.env.AI_PROMPT_PROVIDER as AiPromptProvider ?? 'default');
  
  const template = loadProviderTemplate(provider.name);
  const templateFile = process.env.AI_PROMPT_TEMPLATE_FILE ?? null;
  const overrides = loadPromptTemplateOverrides(templateFile);
  const mergedSlots = normalizeSlots(mergeSlots(slots, overrides[taskType]));
  
  return buildCacheableSections(mergedSlots, provider);
}
```

---

### 阶段 2：缓存优化（第 2 周）

#### 任务 2.1：实现分层缓存（3 天）

**文件**：
- `cache/section-cache.ts` - Section 级别缓存
- `cache/boundary-marker.ts` - 静态/动态边界标记
- `cache/metrics.ts` - 缓存命中率监控

**实现要点**：

```typescript
// cache/section-cache.ts

import { LRUCache } from 'lru-cache';

interface SectionCacheEntry {
  content: string;
  hash: string;
  timestamp: number;
}

const sectionCache = new LRUCache<string, SectionCacheEntry>({
  max: 1000,
  ttl: 1000 * 60 * 60,  // 1 小时 TTL
});

export function getCachedSection(name: string, computeFn: () => string): string {
  const cacheKey = `section:${name}`;
  const cached = sectionCache.get(cacheKey);
  
  if (cached) {
    return cached.content;
  }
  
  const content = computeFn();
  const hash = computeHash(content);
  
  sectionCache.set(cacheKey, {
    content,
    hash,
    timestamp: Date.now(),
  });
  
  return content;
}

export function invalidateSection(name: string): void {
  sectionCache.delete(`section:${name}`);
}

export function clearAllSections(): void {
  sectionCache.clear();
}

// cache/boundary-marker.ts

export const CACHE_BOUNDARY_MARKER = '__CACHE_BOUNDARY__';

export function splitPromptByBoundary(promptSections: CacheSection[]): {
  staticPrefix: CacheSection[];
  dynamicSuffix: CacheSection[];
} {
  const boundaryIndex = promptSections.findIndex(
    section => section.content.includes(CACHE_BOUNDARY_MARKER)
  );
  
  if (boundaryIndex === -1) {
    return {
      staticPrefix: [],
      dynamicSuffix: promptSections,
    };
  }
  
  return {
    staticPrefix: promptSections.slice(0, boundaryIndex),
    dynamicSuffix: promptSections.slice(boundaryIndex + 1),
  };
}

// cache/metrics.ts

export interface CacheMetrics {
  hitRate: number;
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  breakReasons: {
    contentChanged: number;
    modelChanged: number;
    ttlExpired: number;
  };
}

let metrics: CacheMetrics = {
  hitRate: 0,
  totalRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  breakReasons: {
    contentChanged: 0,
    modelChanged: 0,
    ttlExpired: 0,
  },
};

export function trackCacheHit(sectionName: string): void {
  metrics.cacheHits++;
  metrics.totalRequests++;
  metrics.hitRate = metrics.cacheHits / metrics.totalRequests;
}

export function trackCacheMiss(sectionName: string, reason: string): void {
  metrics.cacheMisses++;
  metrics.totalRequests++;
  metrics.hitRate = metrics.cacheHits / metrics.totalRequests;
  
  if (reason === 'content_changed') metrics.breakReasons.contentChanged++;
  if (reason === 'model_changed') metrics.breakReasons.modelChanged++;
  if (reason === 'ttl_expired') metrics.breakReasons.ttlExpired++;
}

export function getCacheMetrics(): CacheMetrics {
  return { ...metrics };
}
```

#### 任务 2.2：集成 API 缓存控制（2 天）

**文件**：
- `cache/api-integration.ts` - API 缓存控制集成

**实现要点**：

```typescript
// cache/api-integration.ts

export interface CacheControlHeader {
  type: 'ephemeral';
  scope: 'global' | 'organization';
}

export function buildCacheControlForSection(
  section: CacheSection
): CacheControlHeader | null {
  if (section.cacheScope === null) {
    return null;
  }
  
  return {
    type: 'ephemeral',
    scope: section.cacheScope,
  };
}

export function buildSystemPromptBlocks(
  promptSections: CacheSection[]
): Array<{ content: string; cache_control?: CacheControlHeader }> {
  const { staticPrefix, dynamicSuffix } = splitPromptByBoundary(promptSections);
  
  const blocks: Array<{ content: string; cache_control?: CacheControlHeader }> = [];
  
  // 添加静态部分（带缓存控制）
  if (staticPrefix.length > 0) {
    const staticContent = staticPrefix.map(s => s.content).join('\n');
    blocks.push({
      content: staticContent,
      cache_control: {
        type: 'ephemeral',
        scope: 'global',
      },
    });
  }
  
  // 添加动态部分（无缓存控制）
  for (const section of dynamicSuffix) {
    blocks.push({
      content: section.content,
    });
  }
  
  return blocks;
}
```

---

### 阶段 3：运行时动态注入（第 3 周）

#### 任务 3.1：实现动态内容注入（2 天）

**文件**：
- `dynamic/injections.ts` - 内容注入器
- `dynamic/context-resolver.ts` - 运行时上下文解析

**实现要点**：

```typescript
// dynamic/injections.ts

export interface InjectionResult {
  injected: string;
  unresolvedPlaceholders: string[];
}

export function injectDynamicContent(
  template: string,
  injections: DynamicInjection[]
): InjectionResult {
  let result = template;
  const unresolvedPlaceholders: string[] = [];
  
  for (const injection of injections) {
    const value = injection.resolver();
    
    if (value !== undefined && value !== null) {
      result = result.replace(
        new RegExp(escapeRegExp(injection.placeholder), 'g'),
        value
      );
    } else {
      unresolvedPlaceholders.push(injection.placeholder);
    }
  }
  
  return {
    injected: result,
    unresolvedPlaceholders,
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// dynamic/context-resolver.ts

import { execSync } from 'node:child_process';

export function getDynamicInjections(taskType: AiPromptTaskType): DynamicInjection[] {
  return [
    {
      type: 'env',
      placeholder: '${WORKING_DIR}',
      resolver: () => process.cwd(),
    },
    {
      type: 'env',
      placeholder: '${DATE}',
      resolver: () => new Date().toISOString().split('T')[0],
    },
    {
      type: 'git_status',
      placeholder: '${GIT_STATUS}',
      resolver: () => getGitStatus(),
    },
    {
      type: 'mcp_status',
      placeholder: '${MCP_SERVERS}',
      resolver: () => getMcpServerStatus(),
    },
    {
      type: 'runtime',
      placeholder: '${SESSION_ID}',
      resolver: () => generateSessionId(),
    },
  ];
}

function getGitStatus(): string {
  try {
    return execSync('git status --short', { encoding: 'utf8' }).trim();
  } catch {
    return 'Not a git repository';
  }
}

function getMcpServerStatus(): string {
  // 从 MCP 服务器管理器获取状态
  return '[]';
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
```

#### 任务 3.2：条件内容注入（2 天）

**文件**：
- `dynamic/conditions.ts` - 条件内容注入

**实现要点**：

```typescript
// dynamic/conditions.ts

export interface ConditionalRule {
  name: string;
  condition: (context: RuntimeContext) => boolean;
  trueContent: string;
  falseContent?: string;
}

export function getConditionalContent(
  rules: ConditionalRule[],
  context: RuntimeContext
): string {
  const results: string[] = [];
  
  for (const rule of rules) {
    if (rule.condition(context)) {
      results.push(rule.trueContent);
    } else if (rule.falseContent) {
      results.push(rule.falseContent);
    }
  }
  
  return results.join('\n');
}

export function getDefaultConditionalRules(): ConditionalRule[] {
  return [
    {
      name: 'plan_mode',
      condition: (ctx) => ctx.isPlanMode,
      trueContent: `
# Plan Mode
You are in plan mode. Focus on planning and design, not implementation.
- Ask clarifying questions before proposing solutions
- Use the TodoWrite tool to break down tasks
- Do not write code or make changes until explicitly asked
`,
    },
    {
      name: 'deepseek_optimization',
      condition: (ctx) => ctx.modelType.includes('deepseek'),
      trueContent: `
# DeepSeek Optimization
- Keep responses concise and direct
- Use JSON format for structured output
- Avoid verbose explanations
`,
    },
    {
      name: 'boundary_extraction_task',
      condition: (ctx) => ctx.taskType === 'boundary-extraction',
      trueContent: `
# Boundary Extraction Focus
- Focus on extracting structured constraints
- Prioritize actionable information
- Return JSON with predefined schema
`,
    },
  ];
}
```

---

### 阶段 4：测试和文档（第 4 周）

#### 任务 4.1：扩展测试用例（3 天）

**文件**：
- `prompts.test.ts` - 扩展主入口测试
- `providers/__tests__/` - Provider 测试用例
- `renderers/__tests__/` - 渲染器测试用例
- `cache/__tests__/` - 缓存测试用例

**测试用例覆盖**：

```typescript
// prompts.test.ts

describe('buildPrompt', () => {
  it('should build prompt with default provider', () => {
    const prompt = buildPrompt('boundary-extraction', defaultSlots);
    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('<role>');
  });

  it('should build prompt with anthropic provider', () => {
    const prompt = buildPrompt('boundary-extraction', defaultSlots, 'claude-3-opus');
    expect(prompt).toContain('<system_instructions>');
    expect(prompt).toContain('<core_principles>');
  });

  it('should build prompt with openai provider', () => {
    const prompt = buildPrompt('boundary-extraction', defaultSlots, 'gpt-4');
    expect(prompt).toMatch(/^\{[\s\S]*\}$/);  // JSON 格式
  });

  it('should apply template overrides', () => {
    process.env.AI_PROMPT_TEMPLATE_FILE = 'override.json';
    const prompt = buildPrompt('boundary-extraction', defaultSlots);
    expect(prompt).toContain('custom role');
  });
});

describe('buildPromptWithCacheControl', () => {
  it('should return cache sections with correct scope', () => {
    const sections = buildPromptWithCacheControl(
      'boundary-extraction',
      defaultSlots,
      'claude-3-opus'
    );
    
    expect(sections[0].cacheScope).toBe('global');
    expect(sections[sections.length - 1].cacheScope).toBeNull();
  });

  it('should split at boundary marker', () => {
    const sections = buildPromptWithCacheControl(
      'boundary-extraction',
      defaultSlots
    );
    
    const { staticPrefix, dynamicSuffix } = splitPromptByBoundary(sections);
    expect(staticPrefix.length).toBeGreaterThan(0);
    expect(dynamicSuffix.length).toBeGreaterThan(0);
  });
});
```

#### 任务 4.2：编写文档（2 天）

**文件**：
- `docs/operations/PROMPT_PROVIDERS.md` - Provider 配置指南
- `docs/operations/PROMPT_CACHING.md` - 缓存优化指南
- `docs/reference/providers/` - 各 Provider 示例
- 更新 `.env.example` - 新增环境变量

**文档内容**：

```markdown
# Prompt Providers 配置指南

## 支持的 Provider

| Provider | 格式 | 推荐用途 | 性能特点 |
|----------|------|---------|---------|
| anthropic | XML | Claude 系列模型 | 缓存友好，+30% XML 效率 |
| openai | JSON | GPT 系列模型 | JSON 原生支持 |
| deepseek | XML | DeepSeek 系列模型 | 需明确格式指令 |
| kimi | JSON | Kimi 系列模型 | 避免 XML |
| gemini | XML | Gemini 系列模型 | +10% JSON 效率 |
| default | XML | 默认格式 | 通用兼容 |

## 环境变量配置

### 选择 Provider

```bash
# 全局 Provider 选择
AI_PROMPT_PROVIDER=anthropic  # 或 openai, deepseek, kimi, gemini, default

# 按任务类型选择 Provider
AI_PROMPT_PROVIDER_BOUNDARY_EXTRACTION=anthropic
AI_PROMPT_PROVIDER_KNOWLEDGE_REFINEMENT=openai
AI_PROMPT_PROVIDER_CLAIM_VERIFICATION=deepseek

# 自动选择（根据模型 ID）
AI_PROMPT_AUTO_SELECT_PROVIDER=true
```

### 模板覆盖

```bash
# 全局模板覆盖文件
AI_PROMPT_TEMPLATE_FILE=custom-template.json

# 按任务类型覆盖
AI_PROMPT_TEMPLATE_BOUNDARY_EXTRACTION=boundary-extraction.json
AI_PROMPT_TEMPLATE_KNOWLEDGE_REFINEMENT=refinement.json
AI_PROMPT_TEMPLATE_CLAIM_VERIFICATION=verification.json
```

### 缓存控制

```bash
# 启用缓存优化
AI_PROMPT_CACHE_ENABLED=true

# 缓存 TTL（秒）
AI_PROMPT_CACHE_TTL=3600

# 缓存最大条目数
AI_PROMPT_CACHE_MAX_ENTRIES=1000

# 监控缓存命中率
AI_PROMPT_CACHE_METRICS_ENABLED=true
```

### 动态注入

```bash
# 启用动态内容注入
AI_PROMPT_DYNAMIC_INJECTION_ENABLED=true

# 禁用特定注入类型
AI_PROMPT_INJECT_GIT_STATUS=false
AI_PROMPT_INJECT_MCP_STATUS=false
```

## 自定义 Provider

### 创建新的 Provider 模板

1. 在 `providers/` 目录创建新的模板文件
2. 在 `providers/index.ts` 注册 Provider 配置
3. 更新类型定义和文档

### 模板语法

支持 Handlebars 风格的模板语法：

```xml
<system_instructions>
  <role>{{role}}</role>

  {{#if corePrinciples}}
  <core_principles>
    {{#each corePrinciples}}
    <item>{{this}}</item>
    {{/each}}
  </core_principles>
  {{/if}}

  <task>{{task}}</task>
</system_instructions>
```

### 运行时动态注入

模板中可以使用占位符：

```xml
<current_environment>
  <working_directory>${WORKING_DIR}</working_directory>
  <date>${DATE}</date>
  <git_status>${GIT_STATUS}</git_status>
</current_environment>
```

这些占位符会在运行时被替换为实际值。
```

---

## 四、环境变量清单

### 新增环境变量

| 变量名 | 类型 | 默认值 | 描述 |
|--------|------|--------|------|
| `AI_PROMPT_PROVIDER` | string | `default` | 全局 Provider 选择 |
| `AI_PROMPT_PROVIDER_BOUNDARY_EXTRACTION` | string | 继承全局 | 边界提取任务的 Provider |
| `AI_PROMPT_PROVIDER_KNOWLEDGE_REFINEMENT` | string | 继承全局 | 知识精炼任务的 Provider |
| `AI_PROMPT_PROVIDER_CLAIM_VERIFICATION` | string | 继承全局 | 声明验证任务的 Provider |
| `AI_PROMPT_AUTO_SELECT_PROVIDER` | boolean | `true` | 根据模型 ID 自动选择 Provider |
| `AI_PROMPT_CACHE_ENABLED` | boolean | `true` | 启用缓存优化 |
| `AI_PROMPT_CACHE_TTL` | number | `3600` | 缓存 TTL（秒） |
| `AI_PROMPT_CACHE_MAX_ENTRIES` | number | `1000` | 缓存最大条目数 |
| `AI_PROMPT_CACHE_METRICS_ENABLED` | boolean | `false` | 启用缓存监控 |
| `AI_PROMPT_DYNAMIC_INJECTION_ENABLED` | boolean | `true` | 启用动态内容注入 |
| `AI_PROMPT_INJECT_GIT_STATUS` | boolean | `true` | 注入 Git 状态 |
| `AI_PROMPT_INJECT_MCP_STATUS` | boolean | `true` | 注入 MCP 服务器状态 |

### 保留环境变量（向后兼容）

| 变量名 | 类型 | 描述 |
|--------|------|------|
| `AI_PROMPT_TEMPLATE_FILE` | string | 模板覆盖文件路径 |
| `AI_PROMPT_FORMAT_BOUNDARY_EXTRACTION` | string | 边界提取任务的格式（已弃用，建议使用 Provider） |
| `AI_PROMPT_FORMAT_KNOWLEDGE_REFINEMENT` | string | 知识精炼任务的格式（已弃用，建议使用 Provider） |
| `AI_PROMPT_FORMAT_CLAIM_VERIFICATION` | string | 声明验证任务的格式（已弃用，建议使用 Provider） |

---

## 五、性能基准

### 优化前

| 指标 | 值 | 说明 |
|------|-----|------|
| Prompt 缓存命中率 | 0% | 无缓存机制 |
| API 延迟 | ~500ms | 每次请求完整 prompt |
| 成本 | 100% | 无优化 |
| Token 效率 | 100% | 无优化 |

### 优化后（预期）

| 指标 | 值 | 改进 | 说明 |
|------|-----|------|------|
| Prompt 缓存命中率 | 60-80% | +60-80% | 静态部分全局缓存 |
| API 延迟 | ~200ms | -60% | 缓存命中时跳过 prompt 传输 |
| 成本 | 40-60% | -40-60% | 缓存命中时节省 prompt token |
| Token 效率 | 115-125% | +15-25% | 更紧凑的格式 |

---

## 六、风险和缓解

### 高风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 多格式渲染器引入 bug | 中 | 高 | 充分测试 + 向后兼容 |
| 缓存失效检测误报 | 低 | 中 | 监控日志 + 人工验证 |
| Provider 模板维护成本 | 高 | 低 | 限制 Provider 数量 |

### 中风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| 动态注入导致性能下降 | 低 | 中 | 异步注入 + 超时控制 |
| 模板语法错误 | 中 | 低 | 严格的语法校验 |
| 向后兼容性问题 | 低 | 高 | 充分的集成测试 |

---

## 七、实施检查清单

### 阶段 1：Provider 模板系统

- [ ] 定义 Provider 类型接口
- [ ] 实现 Provider 选择逻辑
- [ ] 创建 Anthropic 模板
- [ ] 创建 OpenAI 模板
- [ ] 创建 DeepSeek 模板
- [ ] 创建 Kimi 模板
- [ ] 迁移默认模板
- [ ] 更新主入口 buildPrompt()
- [ ] 编写 Provider 选择单元测试
- [ ] 验证向后兼容性

### 阶段 2：缓存优化

- [ ] 实现 Section 级别缓存
- [ ] 实现静态/动态边界标记
- [ ] 实现缓存命中率监控
- [ ] 集成 API 缓存控制
- [ ] 编写缓存单元测试
- [ ] 验证缓存命中率

### 阶段 3：运行时动态注入

- [ ] 实现内容注入器
- [ ] 实现运行时上下文解析
- [ ] 实现条件内容注入
- [ ] 集成 Git 状态注入
- [ ] 集成 MCP 服务器状态注入
- [ ] 编写动态注入单元测试

### 阶段 4：测试和文档

- [ ] 扩展 prompts.test.ts
- [ ] 编写 Provider 单元测试
- [ ] 编写渲染器单元测试
- [ ] 编写缓存单元测试
- [ ] 编写 Provider 配置文档
- [ ] 编写缓存优化文档
- [ ] 更新 .env.example
- [ ] 运行完整测试套件
- [ ] 性能基准测试

---

## 八、下一步行动

1. **开始实现**：在新的会话中使用下面的提示词启动实现
2. **分阶段实施**：按照四个阶段逐步实施
3. **持续测试**：每个阶段完成后运行测试套件
4. **性能监控**：阶段 2 完成后开始监控缓存命中率
5. **文档更新**：每个阶段完成后更新文档

---

## 九、启动实现的提示词

在新的会话中使用以下提示词启动实现：

```
请根据 plan.md 中的重构计划，开始实施 Trap-Map 提示词系统的完全重构。

当前项目状态：
- 项目位于：/home/wunai/Disks/Data/my-project/Trap-Map
- 当前分支：main
- Git 状态：clean
- 最近提交：refactor(ai): unify prompt format to XML, simplify configuration

实施优先级：
1. 先完成阶段 1（Provider 模板系统）
2. 再完成阶段 2（缓存优化）
3. 然后完成阶段 3（运行时动态注入）
4. 最后完成阶段 4（测试和文档）

每个阶段的实施顺序：
1. 首先阅读 plan.md 了解架构设计
2. 查看参考项目（opencode, claude-code-src）了解最佳实践
3. 按照任务列表逐个实施
4. 完成每个任务后运行相关测试
5. 完成阶段后运行完整测试套件

实施约束：
- 保持向后兼容性
- 所有现有的环境变量继续有效
- 所有现有的测试必须通过
- 代码风格遵循项目约定
- 不要引入不必要的复杂性

开始实施阶段 1 的任务 1.1：定义 Provider 配置。
```
