// @ts-nocheck
import { hybridRecall } from './hybrid-channel.js';
import { semanticRecall } from './semantic-channel.js';
import { graphRecall } from './graph-channel.js';

export const ChannelRegistry = {
  hybrid: hybridRecall,
  semantic: semanticRecall,
  graph: graphRecall,
};

export function getChannel(name: string) {
  return (ChannelRegistry as Record<string, unknown>)[name];
}
