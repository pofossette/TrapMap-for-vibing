/**
 * Runtime context resolvers for dynamic prompt injection.
 *
 * Provides pre-defined DynamicInjection entries that resolve
 * environment variables, git status, MCP server info, and session IDs
 * at prompt construction time.
 */

import { execSync } from 'node:child_process';

import type { AiPromptTaskType } from '@trapmap/server/lib/ai/providers/types.js';
import type { DynamicInjection } from './injections.js';

// ---------------------------------------------------------------------------
// Default injection list
// ---------------------------------------------------------------------------

/**
 * Return the list of dynamic injections applicable to the given task type.
 *
 * All task types share the same base injections. Task-specific injections
 * can be added here in the future by switching on `taskType`.
 */
export function getDynamicInjections(_taskType: AiPromptTaskType): DynamicInjection[] {
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

// ---------------------------------------------------------------------------
// Resolver helpers
// ---------------------------------------------------------------------------

function getGitStatus(): string {
  try {
    return execSync('git status --short', { encoding: 'utf8' }).trim();
  } catch {
    return 'Not a git repository';
  }
}

function getMcpServerStatus(): string {
  // Placeholder — will be wired to the MCP server manager when available.
  return '[]';
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
