export type { ConsulHttpAdapterOptions } from './consul-http-adapter.js';
export { ConsulHttpAdapter } from './consul-http-adapter.js';
export type { BootstrappedOtel, OtelSdkHandle } from './otel-bootstrap.js';
export {
  bootstrapOtelSdk,
  boundedOtelShutdown,
  OTEL_SHUTDOWN_TIMEOUT_MS,
} from './otel-bootstrap.js';
