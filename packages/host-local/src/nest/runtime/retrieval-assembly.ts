import {
  createKnowledgeReadChannelRegistry,
  createKnowledgeReadStrategyRegistry,
} from '@trapmap/service-knowledge-read';

export function createHostLocalChannelRegistry() {
  return createKnowledgeReadChannelRegistry();
}

export function createHostLocalStrategyRegistry() {
  return createKnowledgeReadStrategyRegistry();
}

export type HostLocalChannelRegistry = ReturnType<typeof createHostLocalChannelRegistry>;
export type HostLocalStrategyRegistry = ReturnType<typeof createHostLocalStrategyRegistry>;
