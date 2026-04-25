import { jsonb, pgTable, text } from 'drizzle-orm/pg-core';

import type { StoreData } from '../store.js';

export const storeSnapshots = pgTable('store_snapshots', {
  key: text('key').primaryKey(),
  state: jsonb('state').$type<StoreData>().notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
