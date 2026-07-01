# Log Analysis Patterns

## Situation

Production systems generate massive volumes of structured and unstructured logs. Engineers need systematic approaches to correlate log events across services, identify error cascades, and extract actionable signals from noisy log streams.

## Problem

Ad-hoc log searching (grep, tail) misses cross-service correlation and temporal patterns. When investigating incidents, engineers waste time manually correlating timestamps across services, often missing the root cause buried in upstream error propagation.

## Goal

Establish reusable log analysis patterns that enable rapid incident triage: structured query templates for common failure modes, cross-service correlation rules, and automated anomaly detection on log volume and error rate baselines.

## Analysis Patterns

1. Error cascade detection: trace error propagation across service boundaries
2. Latency spike correlation: link slow requests to downstream resource contention
3. Volume anomaly detection: alert on log volume deviations exceeding 2σ from baseline
4. Structured field extraction: parse semi-structured logs into queryable fields
