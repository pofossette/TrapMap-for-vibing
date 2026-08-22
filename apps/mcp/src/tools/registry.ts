import type { ToolDefinition } from './shared.js';

/**
 * Registry of all TrapMap MCP tools. Populated by the tool-group tasks
 * (B3 read tools, B4 draft write tools, B5 governance tools).
 */
export const allTools: ToolDefinition[] = [];
