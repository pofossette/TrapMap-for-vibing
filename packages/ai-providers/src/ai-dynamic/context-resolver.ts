/**
 * Runtime context resolvers for dynamic prompt injection.
 *
 * Provides pre-defined DynamicInjection entries that resolve
 * environment variables, git status, MCP server info, and session IDs
 * at prompt construction time.
 */

import { execSync } from 'node:child_process';

import { prefixedId } from '@trapmap/lib';
import type { AiPromptTaskType } from '../ai-providers/types.js';
import type { DynamicInjection } from './injections.js';

// ---------------------------------------------------------------------------
// Default injection list
// ---------------------------------------------------------------------------

function workingDirInjection(): DynamicInjection {
  return {
    type: 'env',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: placeholder is substituted downstream by the dynamic-injection resolver
    placeholder: '${WORKING_DIR}',
    resolver: () => process.cwd(),
  };
}

function dateInjection(): DynamicInjection {
  return {
    type: 'env',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: placeholder is substituted downstream by the dynamic-injection resolver
    placeholder: '${DATE}',
    resolver: () => new Date().toISOString().split('T')[0],
  };
}

function gitStatusInjection(): DynamicInjection {
  return {
    type: 'git_status',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: placeholder is substituted downstream by the dynamic-injection resolver
    placeholder: '${GIT_STATUS}',
    resolver: () => getGitStatus(),
  };
}

function mcpStatusInjection(): DynamicInjection {
  return {
    type: 'mcp_status',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: placeholder is substituted downstream by the dynamic-injection resolver
    placeholder: '${MCP_SERVERS}',
    resolver: () => getMcpServerStatus(),
  };
}

function sessionInjection(): DynamicInjection {
  return {
    type: 'runtime',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: placeholder is substituted downstream by the dynamic-injection resolver
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
      message:
        'MCP server integration pending — will be wired to the MCP server manager when available.',
    },
  ]);
}

function generateSessionId(): string {
  return prefixedId('session');
}
