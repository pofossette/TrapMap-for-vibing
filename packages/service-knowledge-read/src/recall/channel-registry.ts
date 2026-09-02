import { graphRecall } from './graph-channel.js';
import { hybridRecall } from './hybrid-channel.js';
import { semanticRecall } from './semantic-channel.js';

export const ChannelRegistry = {
  hybrid: hybridRecall,
  semantic: semanticRecall,
  graph: graphRecall,
} as const;

export function getChannel(name: string) {
  return (ChannelRegistry as Record<string, unknown>)[name];
}

export function allChannels() {
  return Object.values(ChannelRegistry);
}
