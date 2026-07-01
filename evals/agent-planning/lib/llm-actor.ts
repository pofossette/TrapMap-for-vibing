const API_URL = process.env.AURSCAN_OPENAI_URL || 'https://api.openai.com/v1';
const API_KEY = process.env.AURSCAN_OPENAI_API_KEY || process.env.OPENAI_API_KEY || '';
const MODEL = process.env.AURSCAN_OPENAI_MODEL || 'gpt-4o-mini';

export interface LLMCallOptions {
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LLMCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: LLMCallOptions = {},
): Promise<LLMCallResult> {
  const { temperature = 0, maxTokens = 1024, timeoutMs = 60000 } = options;
  const start = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`LLM API error ${response.status}: ${errorBody}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    const usage = data.usage ?? {};

    return {
      content,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
    };
  } finally {
    clearTimeout(timeout);
  }
}
