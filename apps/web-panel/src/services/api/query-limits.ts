/**
 * Centralized default page sizes for web-panel mock query helpers.
 *
 * UI constants only — intentionally NOT env-driven, so pagination behavior
 * stays explicit at the call site.
 */

/** Default page size for activity feed queries. */
export const DEFAULT_ACTIVITY_FEED_LIMIT = 20;
/** Default page size for review queue queries. */
export const DEFAULT_REVIEW_QUEUE_LIMIT = 25;
