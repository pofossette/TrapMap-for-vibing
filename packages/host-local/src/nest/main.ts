import 'reflect-metadata';

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createShutdownController } from '@trapmap/assembly';

import { resolveListenOptions } from './resolve-listen-options.js';
import { HTTP_SURFACE_SERVICE } from './runtime/assembly/nodes/nest-transport.js';
import { localAgentAssembly } from './runtime/assembly/profiles/local-agent.js';
import { teamMonolithAssembly } from './runtime/assembly/profiles/team-monolith.js';
import { createHostLocalRuntime } from './runtime/host-runtime.js';

export interface NestBootstrapOptions {
  host?: string;
  port?: number;
}

export interface NestBootstrapResult {
  app: NestFastifyApplication;
  close: () => Promise<void>;
}

const DEPLOYMENT_PROFILES = ['local-agent', 'team-monolith'] as const;
type DeploymentProfile = (typeof DEPLOYMENT_PROFILES)[number];

export interface AssemblyNestBootstrapOptions extends NestBootstrapOptions {
  /** Selects the pilot profile builder. Defaults to TRAPMAP_DEPLOYMENT_PROFILE or local-agent. */
  profile?: DeploymentProfile;
}

const VALID_PROFILES: ReadonlySet<string> = new Set(['local-agent', 'team-monolith']);

function readDeploymentProfile(options: AssemblyNestBootstrapOptions): DeploymentProfile {
  const explicit = options.profile;
  if (explicit !== undefined) return explicit;
  const raw = process.env.TRAPMAP_DEPLOYMENT_PROFILE?.trim();
  // Fall back to local-agent for any invalid/missing env (apps/light validates earlier).
  return VALID_PROFILES.has(raw ?? '') ? (raw as DeploymentProfile) : 'local-agent';
}

/**
 * Bootstrap the Nest host through the Phase 2 assembly pilot.
 *
 * The profile assembly (local-agent or team-monolith) boots first; the
 * nest-transport node builds the Nest Fastify application via
 * {@link AppModule.forRuntime}. `close` disposes the whole assembly, which
 * tears down services (store/pool) and the application in reverse order.
 */
export async function bootstrapNest(
  options: AssemblyNestBootstrapOptions = {},
): Promise<NestBootstrapResult> {
  const profile = readDeploymentProfile(options);
  const { host, port } = resolveListenOptions(options);

  // cordis 4.x does not dependably wake injecting fibers when a providing
  // node's apply is async, so the composed runtime (which internally builds
  // host services / the shared store pool) is created here, outside cordis,
  // and handed to the profile's synchronous host nodes.
  const runtime = await createHostLocalRuntime();

  const builder =
    profile === 'team-monolith'
      ? teamMonolithAssembly({ runtime, host, port })
      : localAgentAssembly({ runtime, host, port });

  const assembly = builder.build();
  const running = await assembly.boot();
  // The transport node's apply is async (NestFactory.create + listen), and
  // cordis does not await providing fibers, so httpSurface lands after boot()
  // resolves. Wait for it with a bound instead of racing ctx.get().
  let app = running.ctx.get(HTTP_SURFACE_SERVICE) as NestFastifyApplication | undefined;
  const deadline = Date.now() + 30_000;
  while (!app && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    app = running.ctx.get(HTTP_SURFACE_SERVICE) as NestFastifyApplication | undefined;
  }
  if (!app) {
    await running.dispose().catch(() => undefined);
    throw new Error(`Assembly boot did not produce an httpSurface (profile=${profile})`);
  }

  return {
    app,
    close: () => running.dispose(),
  };
}

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/nest/main.ts') || process.argv[1].endsWith('/nest/main.js'));

if (isDirectRun) {
  bootstrapNest()
    .then(({ close }) => {
      const shutdown = createShutdownController(close);
      const run = () => {
        void shutdown.shutdown();
      };
      process.on('SIGINT', run);
      process.on('SIGTERM', run);
    })
    .catch((error) => {
      console.error('Nest host failed to start:', error);
      process.exit(1);
    });
}
