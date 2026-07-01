/**
 * Shared system prompt builders for server and evaluation flows.
 *
 * Provider-based template system: loads format-specific templates (XML/JSON),
 * applies slot-level overrides, and renders via format-specific renderers.
 *
 * Template files live in providers/templates/ (anthropic.xml, openai.json, etc.).
 * Slot overrides are loaded from AI_PROMPT_TEMPLATE_FILE env var (JSON).
 *
 * 四层架构中的内容标记层（XML 语义标记）：
 * - JSON  = 传输协议（API 层）：消息结构、tool_use/tool_result
 * - XML   = 语义标记（内容层）：系统指令、环境信息、技能列表
 * - YAML  = 配置文件（Skill 文件头）：Frontmatter 元数据
 * - MD    = 内容载体（Skill 正文）
 *
 * This file is a barrel re-export. Implementation lives in:
 * - prompt-builder.ts   — core buildPrompt, buildPromptWithCacheControl, slot merging
 * - prompts-boundary.ts — boundary extraction prompts
 * - prompts-knowledge.ts — knowledge refinement & claim verification prompts
 * - prompts-graph.ts    — graph extraction prompts
 * - prompts-label.ts    — label alignment prompts
 */

// Re-export types for consumers importing from './prompts.js'
export type { AiPromptTaskType, PromptSlots, CacheSection } from './providers/types.js';

// Core prompt builder
export { buildPrompt, buildPromptWithCacheControl } from './prompt-builder.js';

// Boundary extraction
export {
  buildBoundaryExtractionSystemPrompt,
  buildBoundaryExtractionSystemPromptBlocks,
} from './prompts-boundary.js';

// Knowledge refinement & claim verification
export {
  buildKnowledgeRefinementSystemPrompt,
  buildKnowledgeRefinementSystemPromptBlocks,
  buildClaimVerificationSystemPrompt,
} from './prompts-knowledge.js';

// Graph extraction
export {
  buildGraphExtractionPlannerSlots_default,
  buildGraphExtractionSlots_default,
  buildGraphExtractionPlannerSystemPromptBlocks,
  buildGraphExtractionSystemPromptBlocks,
} from './prompts-graph.js';

// Label alignment
export {
  buildLabelAlignmentSlots_default,
  buildLabelAlignmentSystemPromptBlocks,
} from './prompts-label.js';
