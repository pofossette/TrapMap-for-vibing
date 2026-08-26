import { type ChatProvider, generateStructured } from '@trapmap/ai-providers';
import { createExperienceGeneCandidate } from '@trapmap/backend-core';
import {
  type ExperienceGene,
  type ExperienceGeneSourceSnapshot,
  experienceGeneLlmOutputSchema,
} from '@trapmap/contracts';

const PROMPT_VERSION = 'experience-gene-llm-v1';

export class GenerateStructuredExperienceGeneExtractor {
  private readonly chat: ChatProvider;
  private readonly temperature: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(config: {
    chat: ChatProvider;
    temperature: number;
    maxRetries: number;
    retryBaseDelayMs: number;
  }) {
    if (config.temperature < 0 || config.temperature > 2) {
      throw new Error('temperature must be between 0 and 2');
    }
    if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0 || config.maxRetries > 5) {
      throw new Error('maxRetries must be between 0 and 5');
    }
    this.chat = config.chat;
    this.temperature = config.temperature;
    this.maxRetries = config.maxRetries;
    this.retryBaseDelayMs = config.retryBaseDelayMs;
  }

  async extract(snapshot: ExperienceGeneSourceSnapshot): Promise<ExperienceGene> {
    const generation = await generateStructured({
      chat: this.chat,
      system: [
        'Extract one compact control Gene from the supplied source snapshot.',
        'Return JSON only. Use only facts implied by the snapshot.',
        'Do not include secrets, raw paths, scripts, transcripts, or tenant identifiers.',
      ].join(' '),
      prompt: `SOURCE SNAPSHOT\n${JSON.stringify(snapshot)}`,
      schema: experienceGeneLlmOutputSchema,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      temperature: this.temperature,
    });

    return createExperienceGeneCandidate({
      snapshot,
      ...generation.value,
      generator: {
        kind: 'llm',
        model: generation.model,
        promptVersion: PROMPT_VERSION,
      },
      nowIso: new Date().toISOString(),
    });
  }
}
