declare module 'pg' {
  export interface QueryResult<Row = unknown> {
    rowCount: number | null;
    rows: Row[];
  }

  export interface PoolClient {
    query<Row = unknown>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
    release(): void;
  }

  export interface Pool {
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query<Row = unknown>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
  }

  export class Pool {
    constructor(options?: { connectionString?: string });
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
    query<Row = unknown>(text: string, values?: unknown[]): Promise<QueryResult<Row>>;
  }
}
