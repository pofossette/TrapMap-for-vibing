export type { ConsulHttpAdapterOptions } from './consul-http-adapter.js';
export {
  ConsulHttpAdapter,
  DEFAULT_CONSUL_ADDRESS,
  DEFAULT_CONSUL_TIMEOUT_MS,
} from './consul-http-adapter.js';
export type {
  BootstrappedOtel,
  OtelBootstrapOptions,
  OtelSdkHandle,
} from './otel-bootstrap.js';
export {
  bootstrapOtelSdk,
  boundedOtelShutdown,
  OTEL_METRIC_EXPORT_INTERVAL_MS,
  OTEL_SHUTDOWN_TIMEOUT_MS,
} from './otel-bootstrap.js';
