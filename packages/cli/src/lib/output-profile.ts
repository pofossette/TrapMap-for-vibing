import type { OutputProfile } from '@trapmap/cli/lib/config.js';
import { getDefaultOutputProfile as getConfigDefaultOutputProfile } from '@trapmap/cli/lib/config.js';

import { registry } from './output-profile/registry.js';
import type {
  RenderEnvelope,
  RenderEnvelopeContext,
  RenderKind,
  Renderer,
} from './output-profile/types.js';

export type {
  RenderEnvelope,
  RenderEnvelopeContext,
  RenderKind,
  RenderPayload,
  Renderer,
} from './output-profile/types.js';
export type { OutputProfile } from '@trapmap/cli/lib/config.js';

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
