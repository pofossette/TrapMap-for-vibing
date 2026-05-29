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

function workingDirInjection(): DynamicInjection {
  return {
    type: 'env',
    placeholder: '${WORKING_DIR}',
    resolver: () => process.cwd(),
  };
}

function dateInjection(): DynamicInjection {
  return {
    type: 'env',
    placeholder: '${DATE}',
    resolver: () => new Date().toISOString().split('T')[0],
  };
}

function gitStatusInjection(): DynamicInjection {
  return {
    type: 'git_status',
    placeholder: '${GIT_STATUS}',
    resolver: () => getGitStatus(),
  };
}

function mcpStatusInjection(): DynamicInjection {
  return {
    type: 'mcp_status',
    placeholder: '${MCP_SERVERS}',
    resolver: () => getMcpServerStatus(),
  };
}

function sessionInjection(): DynamicInjection {
  return {
    type: 'runtime',
    placeholder: '${SESSION_ID}',
    resolver: () => generateSessionId(),
  };
}

/**
 * Return the list of dynamic injections applicable to the given task type.
 *
 * All task types share the same base injections (working dir, date, git status, session).
 * knowledge-refinement tasks additionally include MCP server status.
 */
export function getDynamicInjections(taskType: AiPromptTaskType): DynamicInjection[] {
  const base = [workingDirInjection(), dateInjection(), gitStatusInjection(), sessionInjection()];
  if (taskType === 'knowledge-refinement') {
    return [...base, mcpStatusInjection()];
  }
  return base;
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
  return JSON.stringify([
    {
      id: 'mcp-status',
      status: 'unavailable',
      message: 'MCP server integration pending — will be wired to the MCP server manager when available.',
    },
  ]);
}

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
