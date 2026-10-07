# Progress Log

Running log of day-to-day notes on the HyperGuard Sentinel project — what changed, what was investigated, what's next.

## 2026-10-06

- Started migrating the ingestion service: Maven build and wrapper, application entry point,
  `application.yml` (Kafka, actuator, Prometheus export) and the telemetry event / payload models.
- The slice compiles on its own (`./mvnw compile`); controllers, DTOs and the Kafka producer follow.

## 2026-10-03

- Exposed the DLQ replay actuator endpoint (`/actuator/dlq-replay`): operators can read the replay
  status and trigger a bounded replay without a shell on the pod.
- Added a shared test profile (`application-test.yml`) that excludes Kafka autoconfiguration and
  moves the management surface to its own random port, so context tests need no infrastructure.
- Closed the processor's remaining test gaps: endpoint unit + HTTP integration tests, liveness and
  readiness probes, JPA availability, context startup, entity mapping, event deserialization,
  dead letter replay redelivery and concurrent replay rejection.
- Processor suite at 143 tests, all passing (`./mvnw test`).
- The telemetry processor is now fully migrated into this repository.

## 2026-10-02

- Brought in the dead letter path: `DeadLetterEvent` and `DeadLetterPublisher` route a failed
  telemetry event to `telemetry.events.dlq` with its failure reason, instead of dropping it.
- Added the DLQ replay session (`DlqReplaySession`, `DlqReplayPartitionRange`, `ReplayHeaders`), so
  a replay drains the offset range captured when it started and stops at that boundary.
- Added `KafkaConsumerConfiguration` and `TelemetryEventConsumer`, which wires the pipeline the
  earlier slices built: normalize, detect, persist, publish, DLQ on failure.
- Processor suite at 71 tests, all passing.
- Completed the DLQ replay path: `ReplayEventPublisher` republishes a dead lettered event onto the
  raw topic with replay headers, `DlqReplayBoundarySnapshotter` reads the end offsets before a
  replay starts, and `DlqReplayService` opens the session and resumes the dead letter listener.
- `DeadLetterEventConsumer` drains the session and stops once every partition reaches its boundary,
  so a replay cannot loop on records it wrote itself.
- Processor suite at 118 tests, all passing.

## 2026-09-29

- Brought in processed telemetry persistence: `ProcessedTelemetryEntity`, its repository and the
  persistence service. Redelivered duplicates are a no-op; an explicit replay replaces the record.
- Added `TelemetryProcessingService` (normalize, persist, publish to the processed topic) and
  `AnomalyProcessingService` (build and publish the anomaly envelope).
- Processor suite at 58 tests, all passing — including an H2-backed repository test.

## 2026-09-27

- Brought in the processor's Kafka publishing layer: typed `pulsestream.kafka.*` properties,
  the producer factory / `KafkaTemplate` configuration and a dedicated publishing exception.
- Added the processed and anomaly telemetry publishers, which fail with a controlled
  `TelemetryPublishingException` when a send fails or times out.
- Added `.gitattributes` so `mvnw` keeps LF and `mvnw.cmd` keeps CRLF line endings.
- Processor suite at 44 tests, all passing.

## 2026-09-26

- Brought the anomaly detection rules into the telemetry processor: result model, configurable
  thresholds (`pulsestream.detection.*`) and the detection service the incident layer depends on.
- Added the processor's entry point, `pom.xml` and `application.yml`, so the slice now builds.
- Added tests for detection and incident correlation — 22 tests, all passing.
- Added the Maven wrapper and `.gitignore` to the processor; `./mvnw test` now runs from this repo.
- Brought in the Kafka event envelope (`TelemetryEvent`, `TelemetryAnomalyEvent`) and the
  normalization step in front of detection — processor suite at 27 tests, all passing.

## 2026-09-22

- Added incident correlation and device quarantine to the telemetry processor.

## 2026-09-21

- Wrote a roadmap from the README's known limitations (`docs/ROADMAP.md`).
- Documented branch, commit and pull request conventions (`CONTRIBUTING.md`).

## 2026-09-20

- Set up this devlog to track daily progress and decisions going forward.
