# API Validation Setup Guide

## Prerequisites

- `curl` >= 7.80.0 (for HTTP/2 support)
- `jq` >= 1.6 (for JSON parsing and validation)
- Access to the target API endpoint (with auth credentials if needed)

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_BASE_URL` | Yes | - | Base URL of the API to validate |
| `API_TOKEN` | No | - | Bearer token for authenticated endpoints |
| `API_TIMEOUT` | No | `30` | Request timeout in seconds |
| `API_SPEC_PATH` | No | `openapi/spec.yaml` | Path to OpenAPI specification |

### Running Locally

```bash
# Basic usage
scripts/validate.sh --endpoint https://localhost:8080

# With custom spec and output
scripts/validate.sh \
  --endpoint https://api.example.com \
  --spec openapi/production.yaml \
  --output reports/validation-$(date +%Y%m%d).json
```

### Report Format

The validation script produces a JSON report:

```json
{
  "timestamp": "2025-01-15T10:30:00Z",
  "endpoint": "https://api.example.com",
  "specVersion": "3.0.3",
  "summary": {
    "total": 42,
    "passed": 40,
    "failed": 2,
    "skipped": 0
  },
  "failures": [
    {
      "path": "/users/{id}",
      "method": "GET",
      "statusCode": 500,
      "expectedStatus": 200,
      "error": "Response body does not match schema: missing field 'email'"
    }
  ]
}
```

## Troubleshooting

### Connection Refused

If curl returns "Connection refused", verify:
1. The API server is running and listening on the expected port
2. No firewall is blocking access
3. The base URL is correct (try `curl -v $API_BASE_URL/health`)

### HTTP 4xx Errors

- **401 Unauthorized**: Set `API_TOKEN` with a valid bearer token
- **403 Forbidden**: The endpoint requires higher privileges than provided
- **404 Not Found**: The endpoint path in the OpenAPI spec does not match the running server
