import type { OutputProfile } from '@trapmap/cli/lib/config.js';
import { getDefaultOutputProfile as getConfigDefaultOutputProfile } from '@trapmap/cli/lib/config.js';

import type {
  RenderKind,
  RenderEnvelope,
  RenderEnvelopeContext,
  Renderer,
  RenderPayload,
} from './types.js';
import { registry } from './registry.js';

export type {
  RenderKind,
  RenderEnvelope,
  RenderEnvelopeContext,
  Renderer,
  RenderPayload,
  GraphPlanSummaryView,
  RetrievalV1View,
  RetrievalV2View,
  SkillLookupView,
  CommandResultView,
  RendererRegistry,
} from './types.js';

export type { OutputProfile } from '@trapmap/cli/lib/config.js';

export {
  buildGraphPlanSummaryView,
  buildExecutionOrder,
  summarizeRetrievalV1,
  summarizeRetrievalV2,
  summarizeSkillLookup,
  summarizeGraphPlan,
  xmlEscape,
} from './summarizers.js';

export {
  buildRetrievalV1View,
  buildRetrievalV2View,
  buildSkillLookupView,
  buildCommandResultView,
} from './view-builders.js';

export { buildCodexObject } from './codex-object-builder.js';

export { renderClaude, renderCodex, renderOpenCode, renderGeneric } from './renderers.js';

export { registry } from './registry.js';

export function getDefaultOutputProfile(): OutputProfile {
  return getConfigDefaultOutputProfile();
}

export function resolveRenderKind(kind: RenderKind): RenderKind {
  return kind;
}

export function createRenderEnvelope<T>(
  kind: RenderKind,
  payload: T,
  profile: OutputProfile,
  extra: Partial<Pick<RenderEnvelopeContext, 'commandName'>> = {},
): RenderEnvelope<T> {
  const context: RenderEnvelopeContext = {
    tool: profile.tool,
    verbosity: profile.verbosity,
    graphPlanMode: profile.graphPlanMode,
    includeRawHints: profile.includeRawHints,
  };

  if (extra.commandName) {
    context.commandName = extra.commandName;
  }

  if (profile.modelHint) {
    context.modelHint = profile.modelHint;
  }

  return {
    kind,
    payload,
    context,
  };
}

export function resolveRenderer(profile: OutputProfile, kind: RenderKind): Renderer {
  const toolRegistry = registry[profile.tool] ?? registry.generic;
  return (toolRegistry[kind] ?? registry.generic[kind] ?? registry.generic.generic) as Renderer;
}
