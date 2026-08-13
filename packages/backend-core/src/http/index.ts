/**
 * Framework-neutral HTTP route contract + framework adapters.
 *
 * `route-contract` is framework-free (RouteDef/RouteContext/canonical error
 * envelope); the adapters translate RouteDefs to Fastify and Nest surfaces.
 */
export * from './route-contract.js';
export * from './adapters/fastify.js';
export * from './adapters/nest.js';
