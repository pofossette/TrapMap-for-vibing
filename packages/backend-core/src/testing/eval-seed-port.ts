/**
 * EvalSeedPort (Task A9): the minimal surface eval scenario seeders may use.
 *
 * Structural contract — `HostLocalServices` satisfies it, but eval adapters
 * only ever see these capabilities, decoupling the eval face from the full
 * product runtime port bundle.
 */

export interface EvalSeedStorePort {
  getPool(): unknown;
}

/** User repo slice used by seeders (id/handle bookkeeping). */
export interface EvalSeedUserRepo {
  getById(userId: string): Promise<{ id: string } | null>;
  insert(input: {
    id: string;
    handle: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<unknown>;
}

export interface EvalSeedIdentityPort {
  userRepo: EvalSeedUserRepo;
  sessionRepo: unknown; // consumed via createSession helper (opaque handle)
  teamRepo: unknown;
  membershipRepo: unknown;
}

export interface EvalSeedGraphIndexPort {
  upsert(doc: unknown): Promise<unknown>;
}

export interface EvalSeedGraphQueryBackendPort {
  isEnabled(): boolean;
  rebuildProjection(docs: readonly unknown[]): Promise<unknown>;
}

export interface EvalSeedPort {
  store: EvalSeedStorePort;
  identity: EvalSeedIdentityPort;
  graphIndex: EvalSeedGraphIndexPort;
  graphQueryBackend: EvalSeedGraphQueryBackendPort;
}
