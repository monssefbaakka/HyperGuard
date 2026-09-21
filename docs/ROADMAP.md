# Roadmap

Open work on HyperGuard, taken from the limitations stated in the [README](../README.md#known-limitations).
Each item says what is missing today and what "done" would look like.

## Tracing across Kafka

- **Today:** W3C trace context propagates over HTTP between services, but the trace breaks between
  `ingestion-service` and `telemetry-processor` at the Kafka boundary.
- **Done when:** one trace in Jaeger spans the HTTP ingest, the Kafka hop and the processor's
  detection step for the same reading.

## Redis read cache

- **Today:** Redis is provisioned in Compose and Kubernetes but is not in the data path.
- **Done when:** `query-service` serves hot reads (summary, recent activity) from Redis with an explicit
  TTL and an eviction rule, and the cache hit ratio is exported to Prometheus.

## Scraping `telemetry-processor` in Compose

- **Today:** its management port is bound to loopback by design, so the Prometheus container cannot
  reach it; metrics are only reachable from the host.
- **Done when:** the processor's metrics are scraped in Compose without widening the management port
  to every network.

## Calibrated detection thresholds

- **Today:** thresholds (maximum temperature, spike ratio) are conventions; the autoscaling run proves
  they behave as configured, not that they are right.
- **Done when:** thresholds are derived from recorded sensor data per metric and device type, with the
  method documented next to the values.
