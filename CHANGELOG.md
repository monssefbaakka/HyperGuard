# Changelog

All notable changes to this project are documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Devlog and changelog tracking (`docs/devlog/PROGRESS.md`, this file).
- Roadmap of open work (`docs/ROADMAP.md`).
- Contribution guidelines (`CONTRIBUTING.md`).
- Incident correlation and device quarantine in the telemetry processor.
- Configurable anomaly detection rules (temperature band, per-metric ranges, spike ratio).
- Telemetry processor build (`pom.xml`) and runtime configuration (`application.yml`).
- Tests for anomaly detection and incident correlation.
- Maven wrapper for the telemetry processor.
- Kafka telemetry event envelope and event normalization ahead of anomaly detection.
- Kafka producer configuration and typed Kafka properties for the telemetry processor.
- Processed and anomaly telemetry publishers with tests.
- Processed telemetry persistence (`ProcessedTelemetryEntity`, repository, persistence service).
- Telemetry and anomaly processing services with tests.
- Dead letter publishing for telemetry events that fail processing (`telemetry.events.dlq`).
- DLQ replay session with per-partition offset boundaries and replay headers.
- Kafka consumer configuration and the telemetry event consumer driving the processing pipeline.
- Dead letter replay: boundary snapshotting, replay publishing and the bounded replay consumer.
- DLQ replay actuator endpoint (`/actuator/dlq-replay`) for reading replay status and starting a replay.
- Shared test profile (`application-test.yml`) for context tests without Kafka or a database.
- Actuator, probe, deserialization, entity and replay integration tests completing the telemetry
  processor migration (143 tests).
- Ingestion service build, Maven wrapper, entry point, configuration and telemetry event models.
- Ingestion service Kafka producer: typed properties, producer configuration and `KafkaProducerService` with dead letter routing.
