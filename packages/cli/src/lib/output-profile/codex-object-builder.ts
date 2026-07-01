import type {
  GraphPlanSearchResponse,
  RetrievalResponse,
  RetrievalV2Response,
  SkillLookupResponse,
} from '@trapmap/contracts';

import type { RenderEnvelope, RenderPayload } from './types.js';
import {
  buildGraphPlanSummaryView,
  buildRetrievalV1View,
  buildRetrievalV2View,
  buildSkillLookupView,
  buildCommandResultView,
} from './view-builders.js';

export function buildCodexObject(envelope: RenderEnvelope<RenderPayload>): Record<string, unknown> {
  if ((envelope.payload as { failRender?: boolean }).failRender) {
    throw new Error('forced render failure');
  }
  if (
    envelope.kind === 'skill-lookup' &&
    (envelope.payload as SkillLookupResponse).matches.some(
      (match) => 'failRender' in (match as Record<string, unknown>),
    )
  ) {
    throw new Error('forced render failure');
  }

  switch (envelope.kind) {
    case 'retrieval-v1': {
      const view = buildRetrievalV1View(envelope.payload as RetrievalResponse);
      return {
        type: view.type,
        query_summary: view.querySummary,
        constraints: view.constraints,
        project_knowledge: view.projectKnowledge,
        next_steps: view.nextSteps,
      };
    }
    case 'retrieval-v2': {
      const view = buildRetrievalV2View(envelope.payload as RetrievalV2Response);
      return {
        type: view.type,
        query_summary: view.querySummary,
        capsules: view.capsules,
        profile_hints: view.profileHints,
        next_steps: view.nextSteps,
      };
    }
    case 'graph-plan': {
      const view = buildGraphPlanSummaryView(envelope as RenderEnvelope<GraphPlanSearchResponse>);
      const graphPlanPayload = envelope.payload as GraphPlanSearchResponse;
      if (envelope.context.graphPlanMode === 'skill-list') {
        return {
          type: envelope.kind,
          mode: view.mode,
          summary: view.summary,
          selected_path: view.selectedPath,
          skills: view.recommendedSkills,
          traps: [],
          next_steps: [],
          confidence: view.confidence,
          ...(view.fallbackNotice ? { fallback_notice: view.fallbackNotice } : {}),
        };
      }
      return {
        type: envelope.kind,
        mode: view.mode,
        summary: view.summary,
        selected_path: view.selectedPath,
        skills: view.recommendedSkills,
        traps: view.blockingTraps,
        activation_hints: view.activationHints,
        next_steps: view.executionOrder,
        executionPlan: graphPlanPayload.plan?.executionPlan ?? [],
        confidence: view.confidence,
        ...(view.fallbackNotice ? { fallback_notice: view.fallbackNotice } : {}),
        ...(view.planEdges.length > 0 ? { plan_edges: view.planEdges } : {}),
      };
    }
    case 'skill-lookup': {
      const view = buildSkillLookupView(envelope.payload as SkillLookupResponse);
      return {
        type: view.type,
        query_summary: view.querySummary,
        matches: view.matches,
        next_steps: view.nextSteps,
      };
    }
    case 'command-result': {
      const view = buildCommandResultView(envelope.payload as Record<string, unknown>);
      return {
        type: view.type,
        action: view.action,
        success: view.success,
        summary: view.summary,
        artifacts: view.artifacts,
        ...(view.previousState != null ? { previous_state: view.previousState } : {}),
        ...(view.transition ? { transition: view.transition } : {}),
        next_steps: view.nextSteps,
      };
    }
    default:
      return {
        type: envelope.kind,
        summary: 'Generic TrapMap output',
      };
  }
}
