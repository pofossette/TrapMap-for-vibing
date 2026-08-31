import { describe, expect, it } from 'vitest';

import type { ChatProvider } from '@trapmap/ai-providers';
import type { ExperienceGeneSourceSnapshot } from '@trapmap/contracts';
import { experienceGeneSchema } from '@trapmap/contracts';
import { GenerateStructuredExperienceGeneExtractor } from '../src/experience-gene-llm.js';

const snapshot: ExperienceGeneSourceSnapshot = {
  kind: 'skill-artifact',
  sourceId: 'artifact-1:unit',
  revision: 4,
  sourceHash: 'a'.repeat(64),
  artifactId: 'artifact-1',
  artifactRevision: 4,
  derivationUnitId: 'unit',
  title: 'Queue ownership',
  labels: ['queue'],
  scope: 'project',
  teamId: null,
  requiredLevel: 1,
  text: 'Queues sometimes fail when retries fan out.',
  truncated: false,
};

function chat(
  response = '{"signalsMatch":["retries"],"summary":"one owner","strategy":["claim lease"],"avoid":[],"constraints":[],"validation":[]}',
): ChatProvider {
  const invokes: Array<{ system: string; prompt: string; temperature?: number }> = [];
  const provider: ChatProvider = {
    provider: 'fixture',
    isConfigured: true,
    model: 'gene-model-1',
    async invoke() {
      return response;
    },
    async invokeWithTemperature(system, prompt, temperature) {
      invokes.push({ system, prompt, temperature });
      return response;
    },
  };
  return Object.assign(provider, { invokes: () => invokes });
}

describe('GenerateStructuredExperienceGeneExtractor', () => {
  it('uses bounded structured generation and returns a full Gene candidate', async () => {
    const provider = chat();
    const extractor = new GenerateStructuredExperienceGeneExtractor({
      chat: provider,
      temperature: 0,
      maxRetries: 1,
      retryBaseDelayMs: 0,
    });

    const gene = await extractor.extract(snapshot);

    expect(experienceGeneSchema.parse(gene)).toEqual(gene);
    expect(gene.generator).toEqual({
      kind: 'llm',
      model: 'gene-model-1',
      promptVersion: 'experience-gene-llm-v1',
    });
    expect(gene.signalsMatch).toEqual(['retries']);
    const invocation = provider.invokes()[0];
    expect(invocation?.temperature).toBe(0);
    expect(invocation?.prompt).toContain(snapshot.text);
  });

  it('rejects sampling configuration outside the supported range', () => {
    expect(
      () =>
        new GenerateStructuredExperienceGeneExtractor({
          chat: chat(),
          temperature: 3,
          maxRetries: 1,
          retryBaseDelayMs: 0,
        }),
    ).toThrow('temperature must be between 0 and 2');
  });
});
