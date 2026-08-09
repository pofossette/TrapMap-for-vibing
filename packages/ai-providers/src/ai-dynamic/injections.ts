/**
 * Dynamic content injection system.
 *
 * Replaces template placeholders (e.g. ${WORKING_DIR}) at runtime
 * with resolved values, and tracks unresolved placeholders.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DynamicInjection {
  /** Category of the injection source (e.g. 'env', 'git_status', 'runtime'). */
  readonly type: string;
  /** Placeholder string to search for in the template (e.g. '${WORKING_DIR}'). */
  readonly placeholder: string;
  /** Resolver function that returns the replacement value, or null/undefined if unavailable. */
  readonly resolver: () => string | null | undefined;
}

export interface InjectionResult {
  /** The template content with all resolvable placeholders replaced. */
  readonly injected: string;
  /** Placeholders whose resolvers returned null/undefined. */
  readonly unresolvedPlaceholders: string[];
}

// ---------------------------------------------------------------------------
// Core injection
// ---------------------------------------------------------------------------

/**
 * Replace placeholders in a template string using the provided injections.
 *
 * Each injection's `resolver()` is called once. If it returns a non-null
 * value, all occurrences of `placeholder` in `template` are replaced.
 * Otherwise the placeholder is recorded as unresolved.
 */
export function injectDynamicContent(
  template: string,
  injections: DynamicInjection[],
): InjectionResult {
  let result = template;
  const unresolvedPlaceholders: string[] = [];

  for (const injection of injections) {
    const value = injection.resolver();

    if (value !== undefined && value !== null) {
      result = result.replaceAll(injection.placeholder, value);
    } else {
      unresolvedPlaceholders.push(injection.placeholder);
    }
  }

  return { injected: result, unresolvedPlaceholders };
}
