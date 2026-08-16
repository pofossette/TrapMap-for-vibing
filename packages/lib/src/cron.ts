import { Cron } from 'croner';

/**
 * Validate a five-part cron expression.
 *
 * croner parses the pattern eagerly in its constructor and throws on any
 * invalid configuration, so validity is checked by construction.
 */
export function cronValidate(expression: string): boolean {
  try {
    new Cron(expression);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute the next run instant strictly after `from` for a cron expression
 * interpreted in `timezone`. Throws on an invalid expression or timezone.
 */
export function cronNextRun(expression: string, from: Date, timezone: string): Date {
  const job = new Cron(expression, { timezone });
  const next = job.nextRun(from);
  if (next === null) {
    throw new Error(`Cron expression has no future run: ${expression}`);
  }
  return next;
}
