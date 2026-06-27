import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.js';
import { AllExceptionFilter } from './runtime/exception.filter.js';
import { RequestContextService } from './runtime/request-context.service.js';

export interface NestBootstrapResult {
  app: NestFastifyApplication;
  close: () => Promise<void>;
}

/**
 * Bootstrap the Nest host with FastifyAdapter.
 *
 * Frozen facts (Phase 2 boundary freeze):
 * - FastifyAdapter is the fixed HTTP底座
 * - Nest host is the frozen default light mainline (`src/nest/**`)
 * - Current `package.json` default scripts still point to Fastify rollback
 *   path (`src/index.ts`); `dev:nest` / `start:nest` are required to run
 *   the Nest entry — this is a known script drift until Phase 4 cutover
 * - AppModule registers all six bounded-context modules; default provider
 *   wiring currently uses stubs (see app.module.ts)
 */
export async function bootstrapNest(): Promise<NestBootstrapResult> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: ['error', 'warn', 'log'],
  });

  const requestContext = app.get(RequestContextService);

  app.useGlobalFilters(new AllExceptionFilter(requestContext));

  await app.listen(Number(process.env.PORT) || 4000, process.env.HOST || '0.0.0.0');

  return {
    app,
    close: async () => {
      await app.close();
    },
  };
}

const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith('/nest/main.ts') || process.argv[1].endsWith('/nest/main.js'));

if (isDirectRun) {
  bootstrapNest()
    .then(({ close }) => {
      const shutdown = async () => {
        await close();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    })
    .catch((error) => {
      console.error('Nest host failed to start:', error);
      process.exit(1);
    });
}
