import type {
  GraphPlanSearchResponse,
  RetrievalResponse,
  RetrievalV2Response,
  SkillLookupResponse,
} from '@trapmap/contracts';

import type {
  CommandResultView,
  RenderEnvelope,
  RetrievalV1View,
  RetrievalV2View,
  SkillLookupView,
} from './types.js';
import {
  buildGraphPlanSummaryView,
  buildExecutionOrder,
  summarizeRetrievalV1,
  summarizeRetrievalV2,
  summarizeSkillLookup,
  summarizeGraphPlan,
} from './summarizers.js';

export { buildGraphPlanSummaryView, buildExecutionOrder } from './summarizers.js';

export function buildRetrievalV1View(payload: RetrievalResponse): RetrievalV1View {
  return {
    type: 'retrieval-v1',
    querySummary: summarizeRetrievalV1(payload),
    constraints: payload.globalConstraints
      .filter((match) => match != null)
      .map((match) => ({
        entryId: match.entryId,
        shortcut: match.shortcut,
        score: match.score,
        reason: match.reason,
        labels: match.labels,
      })),
    projectKnowledge: payload.projectKnowledge
      .filter((match) => match != null)
      .map((match) => ({
        entryId: match.entryId,
        shortcut: match.shortcut,
        score: match.score,
        reason: match.reason,
        labels: match.labels,
      })),
    nextSteps:
      payload.globalConstraints.length + payload.projectKnowledge.length > 0
        ? ['Read the highest-scoring entries first.']
        : [],
  };
}

export function buildRetrievalV2View(payload: RetrievalV2Response): RetrievalV2View {
  return {
    type: 'retrieval-v2',
    querySummary: summarizeRetrievalV2(payload),
    capsules: payload.capsules.map((capsule) => ({
      artifactId: capsule.artifactId,
      capsuleId: capsule.capsuleId,
      situation: capsule.situation,
      goal: capsule.goal,
      score: capsule.score,
      labels: capsule.labels,
      reason: capsule.reason,
    })),
    profileHints: payload.profileHints.map((hint) => ({
      artifactId: hint.artifactId,
      title: hint.title,
      slug: hint.slug,
      labels: hint.labels,
    })),
    nextSteps: payload.capsules.length > 0 ? ['Open the top matching skill artifact first.'] : [],
  };
}

export function buildSkillLookupView(payload: SkillLookupResponse): SkillLookupView {
  return {
    type: 'skill-lookup',
    querySummary: summarizeSkillLookup(payload),
    matches: payload.matches.map((match) => ({
      artifactId: match.artifactId,
      title: match.title,
      slug: match.slug,
      labels: match.labels,
      score: match.score,
      reason: match.reason,
      sourceKind: match.sourceKind,
    })),
    nextSteps: payload.matches.length > 0 ? ['Inspect the highest-scoring skill first.'] : [],
  };
}

export function buildCommandResultView(payload: Record<string, unknown>): CommandResultView {
  const action = String(payload.action ?? 'unknown');
  const success = Boolean(payload.success);
  const summary = String(payload.summary ?? '');
  const artifacts = Array.isArray(payload.artifacts)
    ? payload.artifacts.map((a: Record<string, unknown>) => ({
        id: a.id,
        title: a.title,
        newState: a.newState,
        revision: a.revision,
      }))
    : [];
  const transition = payload.transition as { from: string; to: string } | undefined;
  const nextSteps = Array.isArray(payload.nextSteps) ? (payload.nextSteps as string[]) : [];

  return {
    type: 'command-result',
    action,
    success,
    summary,
    artifacts,
    ...(payload.previousState != null ? { previousState: String(payload.previousState) } : {}),
    ...(transition != null &&
    typeof transition.from === 'string' &&
    typeof transition.to === 'string'
      ? { transition }
      : {}),
    nextSteps,
  };
}
