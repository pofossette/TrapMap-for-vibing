import type { RendererRegistry } from './types.js';
import { renderClaude, renderCodex, renderOpenCode, renderGeneric } from './renderers.js';

export const registry: RendererRegistry = {
  generic: {
    'retrieval-v1': { id: 'generic:retrieval-v1', render: renderGeneric },
    'retrieval-v2': { id: 'generic:retrieval-v2', render: renderGeneric },
    'graph-plan': { id: 'generic:graph-plan', render: renderGeneric },
    'skill-lookup': { id: 'generic:skill-lookup', render: renderGeneric },
    'artifact-export': { id: 'generic:artifact-export', render: renderGeneric },
    'command-result': { id: 'generic:command-result', render: renderGeneric },
    generic: { id: 'generic:generic', render: renderGeneric },
  },
  'claude-code': {
    'retrieval-v1': { id: 'claude-code:retrieval-v1', render: renderClaude },
    'retrieval-v2': { id: 'claude-code:retrieval-v2', render: renderClaude },
    'graph-plan': { id: 'claude-code:graph-plan', render: renderClaude },
    'skill-lookup': { id: 'claude-code:skill-lookup', render: renderClaude },
    'command-result': { id: 'claude-code:command-result', render: renderClaude },
  },
  codex: {
    'retrieval-v1': { id: 'codex:retrieval-v1', render: renderCodex },
    'retrieval-v2': { id: 'codex:retrieval-v2', render: renderCodex },
    'graph-plan': { id: 'codex:graph-plan', render: renderCodex },
    'skill-lookup': { id: 'codex:skill-lookup', render: renderCodex },
    'command-result': { id: 'codex:command-result', render: renderCodex },
  },
  opencode: {
    'retrieval-v1': { id: 'opencode:retrieval-v1', render: renderOpenCode },
    'retrieval-v2': { id: 'opencode:retrieval-v2', render: renderOpenCode },
    'graph-plan': { id: 'opencode:graph-plan', render: renderOpenCode },
    'skill-lookup': { id: 'opencode:skill-lookup', render: renderOpenCode },
    'command-result': { id: 'opencode:command-result', render: renderOpenCode },
  },
};
