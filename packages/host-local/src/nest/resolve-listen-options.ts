export interface NestBootstrapOptions {
  host?: string;
  port?: number;
}

interface ListenEnv {
  PORT?: string;
  HOST?: string;
}

export function resolveListenOptions(
  options: NestBootstrapOptions = {},
  env: ListenEnv = process.env,
): { host: string; port: number } {
  const envPort = Number(env.PORT);
  const port = options.port ?? (Number.isFinite(envPort) && envPort > 0 ? envPort : 4000);
  const host = options.host ?? env.HOST ?? '0.0.0.0';

  return { host, port };
}
