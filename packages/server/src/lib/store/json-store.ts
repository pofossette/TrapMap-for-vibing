import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { StoreData } from './store-data.js';
import { createEmptyStoreData } from './store-data.js';

export { nowIso, hashSecret, createOpaqueToken, createSlug } from './store-utils.js';

export class JsonStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async snapshot(): Promise<StoreData> {
    return this.read();
  }

  async transact<T>(mutator: (data: StoreData) => Promise<T> | T): Promise<T> {
    let result!: T;

    this.writeChain = this.writeChain.then(async () => {
      const data = await this.read();
      result = await mutator(data);
      await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    });

    await this.writeChain;

    return result;
  }

  nextId(data: StoreData, prefix: string): string {
    const nextValue = (data.counters[prefix] ?? 0) + 1;
    data.counters[prefix] = nextValue;
    return `${prefix}_${nextValue}`;
  }

  private async read(): Promise<StoreData> {
    await this.ensureFile();
    const raw = await readFile(this.filePath, 'utf8');
    if (raw.trim().length === 0) {
      return createEmptyStoreData();
    }

    const parsed = JSON.parse(raw) as Partial<StoreData>;
    return {
      ...createEmptyStoreData(),
      ...parsed,
    };
  }

  private async ensureFile(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await readFile(this.filePath, 'utf8');
    } catch {
      await writeFile(
        this.filePath,
        `${JSON.stringify(createEmptyStoreData(), null, 2)}\n`,
        'utf8',
      );
    }
  }
}
