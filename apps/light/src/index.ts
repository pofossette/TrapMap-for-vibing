/**
 * @trapmap/app-light — light 宿主（local-agent / team-monolith）组装中心（thin assembly）。
 *
 * 本包只做进程级装配：进程入口 / 启动编排、env 读取绑定、依赖装配、启动命令；
 * 不承载任何业务逻辑。Nest 应用装配、服务注入、路由、领域规则全部位于
 * 库包 @trapmap/host-local 中，本包只是其进程壳。
 *
 * 禁止：领域规则、port 实现、SQL、RouteDef、适配器。
 * 禁止：import @trapmap/host-local 的子路径内部文件——只 import 包主入口
 * `@trapmap/host-local`（与 lib 包路径映射保持一致，避免穿透包边界）。
 */

import { start } from '@trapmap/host-local';

const DEPLOYMENT_PROFILES = ['local-agent', 'team-monolith'] as const;
type DeploymentProfile = (typeof DEPLOYMENT_PROFILES)[number];

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4000;

function readDeploymentProfile(): DeploymentProfile {
  const raw = process.env.TRAPMAP_DEPLOYMENT_PROFILE?.trim();
  if (raw === undefined || raw.length === 0) {
    return 'local-agent';
  }
  const profile = DEPLOYMENT_PROFILES.find((candidate) => candidate === raw);
  if (profile === undefined) {
    console.error(
      `[app-light] 非法 TRAPMAP_DEPLOYMENT_PROFILE="${raw}"，只允许 ${DEPLOYMENT_PROFILES.join(' / ')}`,
    );
    process.exit(1);
  }
  return profile;
}

// fallow-ignore-next-line complexity -- thin assembly 入口端口校验（边界校验集中于此，拆分会降低可读性）
function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim().length === 0) {
    return DEFAULT_PORT;
  }
  const port = Number(raw.trim());
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error(`[app-light] 非法 PORT="${raw}"，必须为 0-65535 的整数`);
    process.exit(1);
  }
  return port;
}

async function main(): Promise<void> {
  const profile = readDeploymentProfile();
  const host = process.env.HOST?.trim() || DEFAULT_HOST;
  const port = parsePort(process.env.PORT);

  console.log(`[app-light] 启动 light 宿主 (profile=${profile}, host=${host}, port=${port})`);

  const handle = await start({ host, port });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[app-light] 收到 ${signal}，开始优雅关闭...`);
    try {
      await handle.close();
      console.log('[app-light] 已优雅关闭');
      process.exit(0);
    } catch (error) {
      console.error('[app-light] 关闭失败:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[app-light] 启动失败:', error);
  process.exit(1);
});
