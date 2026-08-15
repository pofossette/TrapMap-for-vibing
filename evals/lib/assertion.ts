export function failedExecutionAssertion(): {
  namedScores: Record<string, never>;
  pass: false;
  reason: 'execution failed';
  score: 0;
} {
  return { pass: false, score: 0, reason: 'execution failed', namedScores: {} };
}
