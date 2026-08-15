import type {
  GraphPlanSearchResponse,
  RetrievalResponse,
  RetrievalV2Response,
  SkillLookupResponse,
} from '@trapmap/contracts';

import type {
  OutputGraphPlanMode,
  OutputModelHint,
  OutputToolProfile,
  OutputVerbosity,
} from '@trapmap/cli/lib/config.js';

export type RenderKind =
  | 'retrieval-v1'
  | 'retrieval-v2'
  | 'graph-plan'
  | 'skill-lookup'
  | 'artifact-export'
  | 'command-result'
  | 'generic';

export interface RenderEnvelopeContext {
  commandName?: string;
  tool: OutputToolProfile;
  modelHint?: OutputModelHint;
  verbosity: OutputVerbosity;
  graphPlanMode: OutputGraphPlanMode;
  includeRawHints: boolean;
}

export interface RenderEnvelope<T = unknown> {
  kind: RenderKind;
  payload: T;
  context: RenderEnvelopeContext;
}

export interface Renderer<T = RenderPayload> {
  id: string;
  render: (envelope: RenderEnvelope<T>) => string;
}

export type RenderPayload =
  | RetrievalResponse
  | RetrievalV2Response
  | GraphPlanSearchResponse
  | SkillLookupResponse
  | Record<string, unknown>;

export type RendererRegistry = Record<
  OutputToolProfile,
  Partial<Record<RenderKind, Renderer<RenderPayload>>>
>;

export interface GraphPlanSummaryView {
  summary: string;
  mode: OutputGraphPlanMode;
  confidence: string | null;
  selectedPath: 'graph-plan' | 'capsule-fallback' | 'entry-fallback';
  fallbackNotice?: string;
  blockingTraps: Array<Record<string, unknown>>;
  recommendedSkills: Array<Record<string, unknown>>;
  executionOrder: string[];
  activationHints: Array<Record<string, unknown>>;
  planEdges: Array<Record<string, unknown>>;
}

export interface RetrievalV1View {
  type: 'retrieval-v1';
  querySummary: string;
  constraints: Array<Record<string, unknown>>;
  projectKnowledge: Array<Record<string, unknown>>;
  nextSteps: string[];
}

export interface RetrievalV2View {
  type: 'retrieval-v2';
  querySummary: string;
  capsules: Array<Record<string, unknown>>;
  profileHints: Array<Record<string, unknown>>;
  nextSteps: string[];
}

export interface SkillLookupView {
  type: 'skill-lookup';
  querySummary: string;
  matches: Array<Record<string, unknown>>;
  nextSteps: string[];
}

export interface CommandResultView {
  type: 'command-result';
  action: string;
  success: boolean;
  summary: string;
  artifacts: Array<Record<string, unknown>>;
  previousState?: string;
  transition?: { from: string; to: string };
  nextSteps: string[];
}
