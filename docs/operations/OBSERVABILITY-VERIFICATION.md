# Observability Chain Verification

This document describes the four observability signals in TrapMap and provides step-by-step verification for confirming they work together on a single request.

---

## The Four Observability Signals

Every HTTP request through the TrapMap NestJS gateway produces four correlated signals:

| Signal | Key Fields | Storage / Export |
|--------|------------|-----------------|
| **Request ID** | `requestId` (UUID) | Response header (`x-request-id`), structured logs |
| **Trace ID** | `traceId` (from `traceparent`) | Response header (`traceparent`), structured logs, Tempo |
| **Metrics** | `trapmap_http_requests_total`, `trapmap_http_request_duration_seconds` | Prometheus `/metrics` endpoint |
| **Structured Logs** | method, url, status, duration, requestId, traceId | stdout (JSON), Loki (when configured) |

### How They Connect

```
Incoming Request
  |
  v
RequestContextMiddleware          (request-context.middleware.ts)
  - extracts requestId from x-request-id header (or generates UUID)
  - extracts traceId from traceparent header
  - stores both in AsyncLocalStorage
  - echoes both back as response headers
  |
  v
LoggingMiddleware                 (logging.middleware.ts)
  - on response finish, reads requestId + traceId from AsyncLocalStorage
  - logs: "GET /v1/traps 200 42ms [req-abc] [trace-xyz]"
  |
  v
LokiService                       (loki.service.ts)
  - receives log via NestJS Logger
  - builds LogEntry with requestId, traceId in body
  - builds Loki labels via buildLokiLabels() (low-cardinality only)
  - sends to Loki or falls back to stdout
  |
  v
PrometheusService                  (prometheus.service.ts)
  - records trapmap_http_requests_total{method, route, status}
  - records trapmap_http_request_duration_seconds{method, route}
  - exposed at GET /metrics
  |
  v
OtelService + TracingPortAdapter   (otel.service.ts, tracing-port.adapter.ts)
  - OTel SDK exports spans to OTLP endpoint (Tempo)
  - traceId links logs to traces
```

---

## Verification Steps

### Prerequisites

Start the TrapMap server (NestJS host-local):

```bash
pnpm --filter @trapmap/host-local start
```

Or with the full observability stack (Prometheus, Grafana, Loki, Tempo):

```bash
docker compose --profile dev-observability up -d
pnpm --filter @trapmap/host-local start
```

### 1. Metrics

Verify the Prometheus scrape endpoint serves request counters and histograms.

```bash
# Scrape metrics
curl -s http://localhost:3000/metrics | grep trapmap_http_requests_total
```

**Expected**: A line like `trapmap_http_requests_total{method="GET",route="/health",status="200"} 1`.

```bash
# Verify histogram metric exists
curl -s http://localhost:3000/metrics | grep trapmap_http_request_duration_seconds
```

**Expected**: Multiple `_bucket`, `_sum`, `_count` lines for `trapmap_http_request_duration_seconds`.

```bash
# Verify active connections gauge
curl -s http://localhost:3000/metrics | grep trapmap_active_connections
```

**Expected**: A `trapmap_active_connections` gauge line.

### 2. Tracing (Request ID + Trace ID)

Send a request with a `traceparent` header and verify both IDs are echoed back.

```bash
# Send request with traceparent
curl -s -D - \
  -H "x-request-id: test-req-001" \
  -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
  http://localhost:3000/health
```

**Expected**: Response headers contain:
- `x-request-id: test-req-001`
- `traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`

```bash
# Verify requestId is generated when header is missing
curl -s -D - http://localhost:3000/live
```

**Expected**: Response headers contain an `x-request-id` header with a UUID value.

### 3. Structured Logging

Send a request and check the stdout log output for all required fields.

```bash
# Send a request (server stdout shows the log)
curl -s http://localhost:3000/health > /dev/null
```

**Expected** log line (in server stdout):
```
[INFO] GET /health 200 <N>ms [<requestId>] [<traceId>]
```

Fields present:
- `method` (GET, POST, etc.)
- `url` (/health, /v1/traps, etc.)
- `statusCode` (200, 404, 500, etc.)
- `duration` (in ms)
- `[requestId]` (UUID or forwarded value)
- `[traceId]` (from traceparent header, or `-` if absent)

When Loki is configured (`LOKI_HOST` env var), logs are also shipped as structured JSON with Loki labels `{service, environment, level}`.

### 4. Service Discovery (Consul)

When Consul is enabled (`CONSUL_ENABLED=true`, `CONSUL_HOST` / `CONSUL_PORT` set):

```bash
# List registered services
curl -s http://localhost:8500/v1/catalog/services | jq .

# Get TrapMap service details
curl -s http://localhost:8500/v1/catalog/service/trapmap | jq .
```

**Expected**: TrapMap appears in the Consul service catalog with a passing health check.

When Consul is not enabled (default `local-agent` profile), service discovery is skipped. This is normal for local development.

### 5. Full Chain Verification (Single Request)

This is the definitive test that all four signals work together:

```bash
# Step 1: Record current metrics state
curl -s http://localhost:3000/metrics | grep trapmap_http_requests_total > /tmp/metrics_before.txt

# Step 2: Send a request with all headers
curl -s -D /tmp/headers.txt \
  -H "x-request-id: chain-test-001" \
  -H "traceparent: 00-abcdef1234567890abcdef1234567890-1234567890abcdef-01" \
  http://localhost:3000/health > /tmp/body.json

# Step 3: Verify response headers
echo "=== Response Headers ==="
cat /tmp/headers.txt | grep -i 'x-request-id\|traceparent'

# Step 4: Verify metrics incremented
echo "=== Metrics After ==="
curl -s http://localhost:3000/metrics | grep trapmap_http_requests_total > /tmp/metrics_after.txt
diff /tmp/metrics_before.txt /tmp/metrics_after.txt

# Step 5: Verify structured log (check server stdout)
echo "=== Check server stdout for log line containing [chain-test-001] and [abcdef1234567890] ==="
```

**Expected outcome**:
1. Response headers echo back `x-request-id: chain-test-001` and the `traceparent` value
2. Metrics show incremented counter for `method="GET",route="/health",status="200"`
3. Server stdout contains a log line with `chain-test-001` and `abcdef1234567890`
4. All three are correlated through the same requestId and traceId

---

## Loki / Tempo Query Examples

### Loki: Search Logs by Trace ID

```
{service="trapmap"} | json | traceId="4bf92f3577b34da6a3ce929d0e0e4736"
```

### Loki: Search Logs by Request ID

```
{service="trapmap"} | json | requestId="test-req-001"
```

### Loki: Filter by Log Level

```
{service="trapmap", level="error"}
```

### Loki: All Logs for a Route

```
{service="trapmap"} | json | context="GET /v1/traps"
```

### Tempo: Find Trace by ID

In Grafana Explore, select the Tempo datasource and query:

```
4bf92f3577b34da6a3ce929d0e0e4736
```

This returns the full trace with spans, which can be correlated to Loki logs via the traceId.

---

## Grafana Dashboard

The pre-provisioned dashboard is at:

```
config/grafana/provisioning/dashboards/trapmap-overview.json
```

It is auto-loaded by Grafana when the `dev-observability` profile is running. The dashboard panels include:

- Request rate (from `trapmap_http_requests_total`)
- Request latency percentiles (from `trapmap_http_request_duration_seconds`)
- Active connections (from `trapmap_active_connections`)
- Error rate breakdown by status code

---

## Test Coverage

The observability chain is verified by unit tests at multiple levels:

| Test File | What It Covers |
|-----------|---------------|
| `packages/contracts/src/domain/log-schema.test.ts` | `logEntrySchema` validation, `buildLokiLabels()` low-cardinality enforcement, `formatLogForStdout()` JSON output |
| `packages/host-local/src/nest/runtime/request-context.test.ts` | `extractRequestContext()` header parsing, `RequestContextService` AsyncLocalStorage propagation |
| `packages/host-local/src/nest/observability/prometheus.service.test.ts` | `PrometheusService` metric registration, counter/histogram/gauge operations |
| `packages/host-local/src/nest/observability/metrics-port.adapter.test.ts` | `MetricsPortAdapter` bridge to prom-client |
| `packages/host-local/src/nest/observability/observability-chain.test.ts` | End-to-end signal chain: request context extraction, ALS propagation, structured logging format, Loki label correctness, correlation of all four signals through a single request lifecycle |
