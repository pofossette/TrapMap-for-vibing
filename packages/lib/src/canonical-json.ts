function canonicalizeScalar(value: unknown): unknown {
  switch (typeof value) {
    case 'boolean':
    case 'string':
      return value;
    case 'number':
      if (!Number.isFinite(value)) {
        throw new RangeError('Canonical JSON numbers must be finite');
      }
      return value;
    case 'bigint':
    case 'symbol':
    case 'function':
      throw new TypeError(`Canonical JSON cannot serialize ${typeof value}`);
    default:
      return value;
  }
}

function canonicalizeArray(value: unknown[]): unknown[] {
  return value.map((item) => {
    if (item === undefined) {
      throw new TypeError('Canonical JSON cannot contain undefined in an array');
    }
    return canonicalize(item);
  });
}

function canonicalizeObject(value: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]): [string, unknown] => [key, canonicalize(item)]),
  );
}

function canonicalize(value: unknown): unknown {
  if (value === undefined) {
    throw new TypeError('Canonical JSON cannot serialize undefined');
  }
  if (value === null || typeof value !== 'object') return canonicalizeScalar(value);

  if (Array.isArray(value)) {
    return canonicalizeArray(value);
  }

  return canonicalizeObject(value);
}

export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}
