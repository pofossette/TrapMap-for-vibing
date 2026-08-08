/**
 * Sensitive-data redaction utilities.
 *
 * Extracted from duplicated implementations in host-local and
 * host-distributed Sentry observability modules.
 *
 * These functions are pure JavaScript — they have no Node.js, framework,
 * or Sentry SDK dependencies.
 */

/** Pattern matching sensitive key names (headers, cookies, auth tokens, secrets, etc.) */
export const SENSITIVE_KEY_PATTERN =
  /authorization|cookie|set-cookie|x-api-key|x-auth-token|access[-_]?token|session[-_]?token|password|secret|credential|prompt|knowledge[-_]?body|request[-_]?body|content[-_]?body|raw[-_]?content|token|api[-_]?key|auth/i;

/**
 * Recursively redact values for keys matching {@link SENSITIVE_KEY_PATTERN}.
 * Returns a new object; does not mutate the input.
 */
export function redactSensitiveKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitiveKeys(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item && typeof item === 'object'
          ? redactSensitiveKeys(item as Record<string, unknown>)
          : item,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Redact sensitive query parameter values from a URL or query string.
 * Preserves non-sensitive parameters and parameter ordering.
 */
export function redactQueryString(queryString: string): string {
  try {
    const pairs = queryString.split('&');
    const redacted = pairs.map((pair) => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) {
        return pair;
      }
      const key = pair.slice(0, eqIndex);
      if (SENSITIVE_KEY_PATTERN.test(decodeURIComponent(key))) {
        return `${key}=[REDACTED]`;
      }
      return pair;
    });
    return redacted.join('&');
  } catch {
    return '[REDACTED]';
  }
}

/**
 * Redact sensitive query parameters from a URL string.
 */
export function redactUrl(url: string): string {
  try {
    const questionIdx = url.indexOf('?');
    if (questionIdx === -1) {
      return url;
    }
    const base = url.slice(0, questionIdx);
    const query = url.slice(questionIdx + 1);
    return `${base}?${redactQueryString(query)}`;
  } catch {
    return url;
  }
}
