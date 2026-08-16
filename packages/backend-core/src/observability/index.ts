export {
  OTEL_SHUTDOWN_TIMEOUT_MS,
  boundedOtelShutdown,
  bootstrapOtelSdk,
} from './otel-bootstrap.js';
export type { BootstrappedOtel, OtelSdkHandle } from './otel-bootstrap.js';

export { ConsulHttpAdapter } from './consul-http-adapter.js';
export type { ConsulHttpAdapterOptions } from './consul-http-adapter.js';
