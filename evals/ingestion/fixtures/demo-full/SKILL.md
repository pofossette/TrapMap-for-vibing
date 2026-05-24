---
name: api-validation
description: Automated REST API endpoint validation against OpenAPI specs with structured reporting
labels:
  - api
  - rest
  - testing
  - validation
---

# REST API Validation Pipeline

## Situation

When building or maintaining REST APIs, teams need a repeatable way to validate that endpoints conform to their OpenAPI specification, return expected status codes, and provide well-formed responses. Manual testing with Postman or curl is error-prone and doesn't integrate well with CI/CD pipelines.

## Problem

Without automated validation, API contract violations are discovered late — often in integration tests or worse, in production. Response schema drift accumulates over time, making it hard to trust error messages, response shapes, and pagination behavior. Manual regression testing does not scale across multiple API versions and environments.

## Goal

Implement an automated validation pipeline that checks REST API endpoints against their OpenAPI specification, verifies response shape with JSON Schema, and produces structured reports suitable for CI/CD integration. The pipeline should be fast enough to run on every PR and comprehensive enough to catch contract violations before they reach staging.

## Validation Workflow

The validation script reads an OpenAPI spec file and a target base URL, then iterates through all documented endpoints:

1. Send a request with documented parameters and body
2. Validate the HTTP status code matches the expected range
3. Validate the response body against the response JSON Schema from the spec
4. Check response headers for required fields (Content-Type, CORS)
5. Produce a structured JSON report with pass/fail per endpoint

## Integration

Integrate the validation script into CI by adding it to the test step:

```yaml
# .github/workflows/test.yml
- name: Validate Staging API
  run: |
    scripts/validate.sh \
      --endpoint https://staging-api.example.com \
      --spec openapi/spec.yaml \
      --output validation-report.json
```

## References

For detailed setup instructions and troubleshooting, see `references/api-guide.md`.
