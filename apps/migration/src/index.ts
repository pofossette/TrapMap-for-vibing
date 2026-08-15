// Thin assembly center — 进程入口只做两件事：
//   1. 调用 @trapmap/host-distributed 的迁移能力（runDistributedMigrations）
//   2. 把结果映射为进程退出码（0 成功 / 1 失败）
// 禁止在本包复制迁移逻辑、禁止直接 import 库包深路径（仅允许 exports 面内的
// @trapmap/host-distributed/migrate.js 子路径），所有迁移实现归库包所有。
import { runDistributedMigrations } from '@trapmap/host-distributed/migrate.js';

async function main(): Promise<void> {
  try {
    console.log('[app-migration] Starting distributed migrations...');
    await runDistributedMigrations();
    console.log('[app-migration] Distributed migrations completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[app-migration] Distributed migrations failed:', error);
    process.exit(1);
  }
}

void main();
