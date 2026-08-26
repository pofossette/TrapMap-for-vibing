export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      throw new Error('Vector values must be finite');
    }

    dotProduct += left * right;
    magnitudeA += left * left;
    magnitudeB += right * right;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  return magnitudeA === 0 || magnitudeB === 0 ? 0 : dotProduct / (magnitudeA * magnitudeB);
}

export function normalizeVector(vector: number[]): number[] {
  for (const value of vector) {
    if (!Number.isFinite(value)) {
      throw new Error('Vector values must be finite');
    }
  }

  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  return magnitude === 0 ? [...vector] : vector.map((value) => value / magnitude);
}

export function createDeterministicFallbackVector(text: string, dimension = 384): number[] {
  if (!Number.isInteger(dimension) || dimension <= 0) {
    throw new Error('Dimension must be a positive integer');
  }

  const vector: number[] = Array.from({ length: dimension }, () => 0);

  function addTokenContribution(token: string): void {
    let hash = 0;
    for (let index = 0; index < token.length; index += 1) {
      hash = (hash * 31 + token.charCodeAt(index)) | 0;
    }
    for (let contributionIndex = 0; contributionIndex < 6; contributionIndex += 1) {
      const vectorIndex = Math.abs(hash) % dimension;
      vector[vectorIndex]! += contributionIndex < 3 ? 1 : -0.5;
      hash = (hash * 1103515245 + 12345) | 0;
    }
  }

  function fillCharacterEmbedding(value: string): void {
    let seed = 0;
    for (let index = 0; index < value.length; index += 1) {
      seed = (seed * 31 + value.charCodeAt(index)) | 0;
    }
    for (let vectorIndex = 0; vectorIndex < dimension; vectorIndex += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      vector[vectorIndex]! = (seed % 10000) / 5000 - 1;
    }
  }

  const normalizedText = text.toLowerCase().trim();
  const tokens = normalizedText.split(/\s+/).filter((token) => token.length > 2);

  if (tokens.length > 0) {
    for (const token of tokens) addTokenContribution(token);
  } else {
    fillCharacterEmbedding(normalizedText);
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude > 0) {
    for (const index of vector.keys()) {
      vector[index]! /= magnitude;
    }
  }

  return vector;
}
