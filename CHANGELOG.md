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
- Ingestion service REST API: validated telemetry request DTOs, event mapper, error handling, controller and Dockerfile.
- Query service scaffold: Maven build, application entry point, README and Maven wrapper.
- Query service persistence model: anomaly, processed telemetry, incident, device quarantine,
  operator, operator session and operator avatar entities.
- Query service API error response shape and resource/auth exception types.
- Query service repositories and search specifications for anomalies, incidents, device
  quarantine, processed telemetry, operators, operator sessions and operator avatars.
- Query service typed configuration (auth, query limits, Kafka topology, platform metadata),
  Kafka admin client configuration, global exception handler, platform-config/anomaly/telemetry
  record DTOs and `application.yml`.
- Query service dashboard summary, time-series, paged-response, Kafka topology, auth and
  incident/quarantine read DTOs.
- Query service services (anomaly/telemetry query, incident, quarantine, platform metadata,
  Kafka topology, auth) and the session interceptor wired into the servlet pipeline.
- Query service controllers (anomaly/telemetry query, auth, platform, metadata, topology,
  incident, quarantine), shared `SortDirections` constants and the Dockerfile.
- Query service application smoke test, auth interceptor and controller tests, auth service
  test, shared test profile and `.dockerignore`.
- Local Docker Compose stack for development environment: Zookeeper, Kafka, PostgreSQL, Redis, Prometheus, Grafana, and Jaeger (infrastructure/docker/docker-compose.yml, .env.example, README.md).
- PostgreSQL initialization schema creating platform schema, processed_telemetry, and anomaly tables (infrastructure/docker/postgres/init.sql).
- Kafka broker health check and topic initialization helper scripts (infrastructure/docker/kafka/check-health.sh, init-topics.sh, wait-and-run.sh).
- Prometheus scraping configuration targeting local microservices (infrastructure/docker/prometheus/prometheus.yml).
- Grafana Prometheus datasource and dashboard provider configurations (infrastructure/docker/grafana/provisioning/).
- Curated Grafana dashboards for ingestion service metrics and platform service health (observability/grafana/dashboards/ingestion-metrics.json, service-health.json, README.md).
- Topic provisioning automation scripts for PowerShell and Bash (scripts/create-topics.ps1, scripts/create-topics.sh).
- Core Architecture Decision Records covering Kafka, Spring Boot, PostgreSQL MVP, and Docker Compose (docs/decisions/0001-0004, README.md).
- Layered container image build for the telemetry processor (services/telemetry-processor/Dockerfile, .dockerignore).
- Architecture documentation: system overview, services, C4 model, event schema, topics, replay strategy, cache strategy, container build and image validation standards (docs/architecture/).
- Architecture diagrams for system, event flow, Kafka topology and Kubernetes deployment (docs/diagrams/).
- ADR 0005 on running Kafka on Kubernetes with Strimzi (docs/decisions/0005-kafka-on-kubernetes-with-strimzi.md).
- Platform overview and project state snapshot (docs/platform-overview.md, PROJECT_STATE.md).
- Root `.gitignore` covering build output, IDE files, local env files and rendered Kubernetes secrets.
- Strimzi Kafka node pool, cluster and topic manifests (infrastructure/kubernetes/kafka/).
- Ingestion service Kubernetes manifests: config map, deployment, ClusterIP/NodePort services and HPA (infrastructure/kubernetes/ingestion-service/).
- Telemetry processor Kubernetes manifests: config map, secret template, deployment, service and HPA (infrastructure/kubernetes/telemetry-processor/).
- Query service Kubernetes manifests: config map, deployment and service (infrastructure/kubernetes/query-service/).
- Network policies isolating the ingestion service, telemetry processor and query service (infrastructure/kubernetes/network-policies/).
- OpenTelemetry collector and Jaeger tracing backend manifests (infrastructure/kubernetes/observability/).
- Monitoring namespace and Helm values for in-cluster Prometheus (infrastructure/kubernetes/monitoring/).
- Service discovery and cluster DNS conventions (infrastructure/kubernetes/service-discovery.md).
- Prometheus Adapter values and a custom-metrics HPA for the ingestion service (infrastructure/kubernetes/autoscaling/).
- In-cluster Grafana: storage, Prometheus datasource, dashboard provisioning, deployment and service (infrastructure/kubernetes/monitoring/grafana/).
- Dependency-free PowerShell YAML reader with unit tests (scripts/lib/PulseStreamYaml.psm1).
- Autoscaling strategy, custom-metrics autoscaling, autoscaling validation and observability validation guides (docs/architecture/).
- Security policy (SECURITY.md) and root .gitattributes.
- GHCR image publishing workflow: Trivy scan, SBOM, cosign signature and digest index, with the image path derived from the repository (`ghcr.io/<owner>/<repo>/<service>`).
- Digest-based release promotion workflow, release manifest validator and promotion script (scripts/).
- CODEOWNERS and the main branch protection ruleset (.github/).
- Image registry, release promotion and supply chain verification guides (docs/).
- CI quality gates (`ci.yml`): Maven verify per service, image build and probe, published-image validation, Compose config, kubeconform, PowerShell offline (PowerShell 7 and 5.1) and kind-backed cluster tests.
- CodeQL analysis, dependency review, PR/issue alignment check and Dependabot.
- Issue and pull request templates.
- PowerShell test runner, release promotion tests and ingestion HPA structure test (scripts/tests/).

### Changed

- Platform Deployments now reference `ghcr.io/monssefbaakka/hyperguard/<service>` instead of the upstream PulseStream registry.

### Fixed

- query-service `/actuator/health` no longer reports 503 when PostgreSQL is unreachable; the DB indicator is opt-in via `PULSESTREAM_DB_HEALTH_ENABLED`, as in telemetry-processor.
