export interface NormalizedActorOutput {
  normalizedPlan: string[];
  parseFailed: boolean;
  emptyOutput: boolean;
}

const stepPrefixPattern = /^(\d+[\].)]|[-*])\s*/;

export function normalizeActorOutput(actorOutput: string): NormalizedActorOutput {
  const trimmed = actorOutput.trim();
  if (trimmed.length === 0) {
    return {
      normalizedPlan: [],
      parseFailed: true,
      emptyOutput: true,
    };
  }

  const normalizedPlan = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(stepPrefixPattern, ''))
    .filter((line) => !/^final answer:/i.test(line))
    .map((line) => line.toLowerCase());

  return {
    normalizedPlan,
    parseFailed: normalizedPlan.length === 0,
    emptyOutput: false,
  };
}
