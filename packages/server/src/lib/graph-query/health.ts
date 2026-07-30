import type {
  GraphQueryBackend,
  GraphQueryBackendHealth,
  GraphQueryRuntimeState,
  GraphIndexDocumentRecord,
} from '@trapmap/contracts';

interface GraphQueryLogger {
  warn?(payload: Record<string, unknown>, message: string): void;
}

export function createFailOpenGraphQueryBackend(args: {
  primary: GraphQueryBackend;
  fallback: GraphQueryBackend;
  failOpen: boolean;
  logger?: GraphQueryLogger;
}): GraphQueryBackend {
  return new FailOpenGraphQueryBackend(args);
}

class FailOpenGraphQueryBackend implements GraphQueryBackend {
  readonly kind;
  private state: GraphQueryRuntimeState;

  constructor(
    private readonly args: {
      primary: GraphQueryBackend;
      fallback: GraphQueryBackend;
      failOpen: boolean;
      logger?: GraphQueryLogger;
    },
  ) {
    this.kind = args.primary.kind;
    this.state = {
      mode: 'enabled-primary',
      backendKind: this.kind,
      failOpen: args.failOpen,
    };
  }

  isEnabled(): boolean {
    return this.args.primary.isEnabled();
  }

  getRuntimeState(): GraphQueryRuntimeState {
    return this.state;
  }

  async healthcheck(): Promise<GraphQueryBackendHealth> {
    try {
      const primaryHealth = await this.args.primary.healthcheck();
      if (primaryHealth.ok) {
        this.setPrimaryState();
        return primaryHealth;
      }
      if (!this.args.failOpen) {
        this.setPrimaryState(primaryHealth.detail);
        return primaryHealth;
      }
      this.setFallbackState(primaryHealth.detail);
      return {
        ok: true,
        mode: 'enabled-fallback',
        ...(primaryHealth.detail !== undefined ? { detail: primaryHealth.detail } : {}),
      };
    } catch (error) {
      if (!this.args.failOpen) {
        this.setPrimaryState(describeError(error));
        throw error;
      }
      const detail = describeError(error);
      this.setFallbackState(detail);
      return {
        ok: true,
        mode: 'enabled-fallback',
        detail,
      };
    }
  }

  async upsertDocument(document: GraphIndexDocumentRecord): Promise<void> {
    await this.args.fallback.upsertDocument(document);
    await this.tryPrimaryWrite('upsertDocument', () => this.args.primary.upsertDocument(document));
  }

  async removeSource(sourceType: 'trap' | 'skill', sourceId: string): Promise<void> {
    await this.args.fallback.removeSource(sourceType, sourceId);
    await this.tryPrimaryWrite('removeSource', () =>
      this.args.primary.removeSource(sourceType, sourceId),
    );
  }

  async rebuildProjection(documents: GraphIndexDocumentRecord[]): Promise<void> {
    await this.args.fallback.rebuildProjection(documents);
    await this.tryPrimaryWrite('rebuildProjection', () =>
      this.args.primary.rebuildProjection(documents),
    );
  }

  async expandSourcesOneHop(params: {
    queryLabels: Set<string>;
    eligibleSourceIds?: Set<string>;
  }): Promise<Set<string>> {
    return this.tryPrimaryRead(
      'expandSourcesOneHop',
      () => this.args.primary.expandSourcesOneHop(params),
      () => this.args.fallback.expandSourcesOneHop(params),
    );
  }

  async calculateSourceRelationStrength(params: {
    sourceId: string;
    queryLabels: Set<string>;
  }): Promise<number> {
    return this.tryPrimaryRead(
      'calculateSourceRelationStrength',
      () => this.args.primary.calculateSourceRelationStrength(params),
      () => this.args.fallback.calculateSourceRelationStrength(params),
    );
  }

  async getSourceNodeIds(sourceIds: string[]): Promise<Map<string, Set<string>>> {
    return this.tryPrimaryRead(
      'getSourceNodeIds',
      () => this.args.primary.getSourceNodeIds(sourceIds),
      () => this.args.fallback.getSourceNodeIds(sourceIds),
    );
  }

  async buildLocalExpansionView(params: {
    seedNodeIds: string[];
    maxDepth: number;
    auth: { teamId: string | null; securityLevel: number };
  }) {
    return this.tryPrimaryRead(
      'buildLocalExpansionView',
      () => this.args.primary.buildLocalExpansionView(params),
      () => this.args.fallback.buildLocalExpansionView(params),
    );
  }

  async findMitigatingSkills(trapNodeIds: string[]): Promise<string[]> {
    return this.tryPrimaryRead(
      'findMitigatingSkills',
      () => this.args.primary.findMitigatingSkills(trapNodeIds),
      () => this.args.fallback.findMitigatingSkills(trapNodeIds),
    );
  }

  private async tryPrimaryRead<T>(
    operation: string,
    runPrimary: () => Promise<T>,
    runFallback: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await runPrimary();
      this.setPrimaryState();
      return result;
    } catch (error) {
      if (!this.args.failOpen) {
        this.setPrimaryState(describeError(error));
        throw error;
      }
      this.logFallback(operation, error);
      this.setFallbackState(describeError(error));
      return runFallback();
    }
  }

  private async tryPrimaryWrite(operation: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
      this.setPrimaryState();
    } catch (error) {
      if (!this.args.failOpen) {
        this.setPrimaryState(describeError(error));
        throw error;
      }
      this.logFallback(operation, error);
      this.setFallbackState(describeError(error));
    }
  }

  private setPrimaryState(detail?: string): void {
    this.state = {
      mode: 'enabled-primary',
      backendKind: this.kind,
      failOpen: this.args.failOpen,
      ...(detail ? { detail } : {}),
    };
  }

  private setFallbackState(detail?: string): void {
    this.state = {
      mode: 'enabled-fallback',
      backendKind: this.kind,
      failOpen: this.args.failOpen,
      ...(detail ? { detail } : {}),
    };
  }

  private logFallback(operation: string, error: unknown): void {
    this.args.logger?.warn?.(
      {
        graphQueryOperation: operation,
        backendKind: this.kind,
        detail: describeError(error),
      },
      'Graph query backend fell back to memory mode',
    );
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
