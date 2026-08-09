/** Shared helpers for the template renderers (json-renderer, xml-renderer). */

export function isTruthy(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
