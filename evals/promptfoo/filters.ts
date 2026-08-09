/**
 * Case filters shared by suite bridges, mirroring the native CLI semantics
 * (tier / endpoint / metadata / allow-empty).
 */

export interface FilterableCase {
  endpoint?: string;
  tier?: string;
  metadata?: Record<string, unknown>;
}

/** Filter cases by endpoint, preserving the native `--endpoint` semantics. */
export function filterByEndpoint<TCase extends FilterableCase>(
  cases: TCase[],
  endpoint: string | undefined,
): TCase[] {
  if (!endpoint) return cases;
  return cases.filter((c) => c.endpoint === endpoint);
}

/** Filter cases by a metadata key/value pair. */
export function filterByMetadata<TCase extends FilterableCase>(
  cases: TCase[],
  key: string,
  value: unknown,
): TCase[] {
  return cases.filter((c) => c.metadata?.[key] === value);
}
