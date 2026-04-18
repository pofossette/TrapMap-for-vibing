import path from 'node:path';

export interface ServerConfig {
  dataFile: string;
  host: string;
  port: number;
  systemAdminKey: string | null;
}

export function loadConfig(): ServerConfig {
  return {
    dataFile: path.resolve(
      process.cwd(),
      process.env.TRAPMAP_DATA_FILE ?? '.data/skill-shareer.json',
    ),
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 4000),
    systemAdminKey: process.env.TRAPMAP_SYSTEM_ADMIN_KEY ?? null,
  };
}
