/**
 * Parse boundary constraint JSON from a CLI flag string.
 *
 * Consolidates the try/catch + error message pattern that was duplicated
 * in knowledge, review, and trap commands.
 */
export function parseBoundaryJson(raw: string | undefined): unknown {
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Invalid boundary JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
