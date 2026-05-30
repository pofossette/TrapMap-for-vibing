import type {
  CapsuleRecallChannelName,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { DerivedSkillCapsuleRecord } from '@trapmap/server/lib/store.js';

const CHANNEL_LABELS: Record<CapsuleRecallChannelName, string> = {
  'capsule-heuristic': 'heuristic',
  'capsule-keyword': 'keyword',
  'capsule-semantic': 'semantic',
  'capsule-graph': 'graph',
};

export function buildMultiChannelReason(
  channels: CapsuleRecallChannelName[],
  featureScores: {
    problemScore: number;
    situationScore: number;
    goalScore: number;
    keywordScore: number;
    contextScore: number;
    stackPathBoost: number;
    channelConsensusBoost?: number;
    semanticBoost?: number;
    graphBoost?: number;
    preRerankScore?: number;
  },
  capsule: DerivedSkillCapsuleRecord,
  _intent: ParsedIntent,
): string {
  const parts: string[] = [];

  const channelList = channels.map((ch) => CHANNEL_LABELS[ch] ?? ch).join(' + ');

  if (featureScores.problemScore > 0.3) {
    parts.push(`problem match (${(featureScores.problemScore * 100).toFixed(0)}%)`);
  }

  if (featureScores.situationScore > 0.3) {
    parts.push(`situation match (${(featureScores.situationScore * 100).toFixed(0)}%)`);
  }

  if (featureScores.goalScore > 0.3) {
    parts.push(`goal match (${(featureScores.goalScore * 100).toFixed(0)}%)`);
  }

  if (featureScores.keywordScore > 0.3) {
    parts.push(`keyword match (${(featureScores.keywordScore * 100).toFixed(0)}%)`);
  }

  if (featureScores.contextScore > 0.3) {
    parts.push(`context match (${(featureScores.contextScore * 100).toFixed(0)}%)`);
  }

  if (featureScores.stackPathBoost > 1.1) {
    parts.push('stack/path boost');
  }

  if ((featureScores.channelConsensusBoost ?? 0) > 0) {
    parts.push(`${channels.length}-channel consensus`);
  }

  if ((featureScores.semanticBoost ?? 0) > 0.05) {
    parts.push('semantic evidence');
  }

  if ((featureScores.graphBoost ?? 0) > 0.02) {
    parts.push('graph evidence');
  }

  if (parts.length === 0) {
    return `Matched via ${channelList}; Capsule from ${capsule.sourcePaths[0] ?? 'unknown'}`;
  }

  return `Matched via ${channelList}; ${parts.join(', ')}`;
}
