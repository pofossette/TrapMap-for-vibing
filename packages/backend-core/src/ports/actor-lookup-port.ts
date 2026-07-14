/**
 * Batch identity lookup contract for compatibility projections.
 *
 * Identity owners implement this port; consumers must not fan out through
 * concrete user or membership repositories.
 */
export interface ActorBatchLookupPort {
  getUsersByIds(userIds: string[]): Promise<Array<{ id: string; handle: string }>>;
  getMembershipLevels(
    pairs: Array<{ userId: string; teamId: string }>,
  ): Promise<Map<string, number>>;
}
