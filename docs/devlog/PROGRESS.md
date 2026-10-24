# Progress Log

Running log of day-to-day notes on the HyperGuard Sentinel project - what changed, what was investigated, what's next.

## 2026-10-24 (CI quality gates)

- Brought in `ci.yml`, CodeQL, dependency review, PR/issue alignment, Dependabot and the
  issue / PR templates, with the test runner and the release promotion tests that check the
  workflows, the main ruleset and the promotion gate stay consistent.
- Added the ingestion HPA structure test so the kind-backed cluster job has a test to run.
- Local results: `test-release-promotion.ps1` 147 checks passing; `run-all-tests.ps1 -Scope
  Offline` green on PowerShell 7.6.7 and Windows PowerShell 5.1 (14 files parsed, 3 tests).
  The cluster test was not run locally (no Kubernetes API); CI runs it on kind.
- `validate-container-images.ps1` caught a real problem: query-service answered 503 on
  `/actuator/health` without a database. Fixed by making the DB health indicator opt-in, as
  telemetry-processor already does. All three images now build and report UP on `/livez`,
  `/readyz` and `/actuator/health`; query-service suite still 43 tests passing.
- The services' POMs have no JaCoCo plugin yet, so the coverage summary step reports nothing
  until it is added.

## 2026-10-24 (release pipeline)

- Brought in the image publishing and release promotion workflows. Both used to hard-code
  `ghcr.io/<owner>/pulsestream/...`; they now derive the path from the repository, so images
  land under `ghcr.io/monssefbaakka/hyperguard/<service>`.
- Pointed the three platform Deployments, the release scripts' default registry prefix, the
  cosign identity in `docs/security.md` and CODEOWNERS at this repository.
- `test-security-publishing.ps1`: 27 checks passing. `validate-release-manifests.ps1` passes
  against the new prefix. `test-release-promotion.ps1` waits for `ci.yml` (it reads it).
- The Deployments still carry the old `sha-5f5e845` tag, which does not exist in this
  registry yet: the first `publish-images` run on `main` produces the real tag, and the
  manifests get pinned to that digest next.

## 2026-10-24

- Added the custom-metrics autoscaling layer: Prometheus Adapter values and an ingestion
  service HPA that scales on request rate instead of CPU alone.
- Added in-cluster Grafana (PVC, Prometheus datasource, dashboard provider, provisioned
  dashboards, deployment, service) with provisioning and deployment notes.
- Brought in the PowerShell YAML reader the validation scripts build on, with its unit test
  (`scripts/tests/test-yaml-parsing.ps1`, 32 checks passing on PowerShell 7.6.7).
- Added the autoscaling strategy / validation, custom-metrics autoscaling and observability
  validation guides, the security policy and the root `.gitattributes`.
- All 8 new manifests parse as valid YAML (7 Kubernetes objects plus the adapter Helm
  values). Not applied to a cluster. The validation scripts referenced by the guides come next.

## 2026-10-22

- Brought in the query service Kubernetes manifests (config map, deployment, service).
- Added network policies for the ingestion service, telemetry processor and query service; the
  query service policy admits only the in-cluster Prometheus server pods from `monitoring`.
- Added the tracing stack: observability namespace, OpenTelemetry collector (config map,
  deployment, service, service account) and Jaeger backend, plus the pipeline README.
- Added the monitoring namespace, Prometheus Helm values and install notes, and the service
  discovery / DNS conventions doc.
- All 16 manifests parse as valid YAML (15 Kubernetes objects plus the Helm values file). Not
  applied to a cluster (no local cluster running). Grafana and autoscaling manifests are next.

## 2026-10-21

- Added the root `.gitignore`, including the rule that keeps rendered
  `infrastructure/kubernetes/**/secret.yaml` files out of git (only `*.example.yaml` is tracked).
- Brought in the Kubernetes manifests for the streaming pipeline: Strimzi Kafka node pool,
  cluster and topics; ingestion service config map, deployment, ClusterIP/NodePort services and
  HPA; telemetry processor config map, secret template, deployment, service and HPA, with the
  READMEs and HPA verification notes for each.
- All 13 manifests parse as valid YAML with `apiVersion`/`kind` set. Not applied to a cluster
  yet (no local cluster running); query-service, monitoring, observability, network policies
  and autoscaling manifests are next.

## 2026-10-20

- Added a layered container image build for the telemetry processor (`Dockerfile`,
  `.dockerignore`): Maven build stage, Spring Boot layer extraction, non-root JRE runtime.
- Brought in the architecture docs: system overview, service catalog, C4 model, event schema,
  Kafka topics, event replay strategy, cache strategy and container build/validation standards.
- Added the architecture diagrams (system, event flow, Kafka topology, Kubernetes deployment).
- Added ADR 0005 on running Kafka on Kubernetes with Strimzi.
- Added the platform overview and `PROJECT_STATE.md` snapshot.

## 2026-10-17

- Added the local Docker Compose development infrastructure: Zookeeper, Kafka, PostgreSQL,
  Redis, Prometheus, Grafana, and Jaeger with complete configuration and documentation.
- Added database schema initialization (init.sql) for processed telemetry and anomaly persistence.
- Added Prometheus scraping rules and Grafana datasource/dashboard provisioning.
- Added Grafana dashboards for ingestion metrics and platform service health.
- Added automated Kafka topic creation scripts (create-topics.ps1, create-topics.sh).
- Documented foundational Architecture Decision Records (ADRs 0001-0004) covering message broker,
  service framework, relational persistence, and local orchestration choices.
## 2026-10-16

- Added the query service's application smoke test, auth interceptor and auth controller tests,
  anomaly/telemetry/metadata/platform controller tests, and an auth service test, plus the
  shared test profile and `.dockerignore`. Suite: 43 tests, all passing
  (`./mvnw test`). Remaining in query-service: anomaly/incident/platform-metadata/quarantine/
  telemetry-query service tests and their shared fixture helper.

## 2026-10-15

- Added the query service's controllers: anomaly/telemetry query, auth, platform, metadata,
  topology, incident and quarantine, plus the shared `SortDirections` constants and the
  Dockerfile. The slice compiles (`./mvnw compile`); only tests remain for query-service.

## 2026-10-13

- Added the query service's service layer: anomaly/telemetry query, incident/quarantine,
  platform metadata and Kafka topology services, the auth service, and the session
  interceptor (`ApiAuthenticationInterceptor`) wired into `WebConfiguration`. The slice
  compiles (`./mvnw compile`); only controllers remain for query-service.
- Added the query service's remaining read DTOs: dashboard summary (`ActivityBucketDto`,
  `DeviceSummaryDto`, `SummaryDto`, `FacetsDto`), time-series (`MetricSeriesDto`,
  `SeriesPointDto`), the generic `PageResponseDto`, `KafkaTopologyDto`, and the auth
  (`AuthDtos`) and incident/quarantine (`IncidentDtos`) request/response shapes. The slice
  compiles (`./mvnw compile`); services, security and controllers are next.
- Added the query service's typed configuration: `pulsestream.auth/.query/.topology/.platform` property classes, the Kafka `AdminClient` configuration, the global exception handler mapping resource/auth exceptions to `ErrorResponse`, the platform-config/anomaly/telemetry record DTOs, and `application.yml`. The slice compiles (`./mvnw compile`); services, security and controllers are next.

## 2026-10-12

- Finished the ingestion service: request DTOs with validation messages, event mapper, structured error handling, the `/api/v1/events` controller, trace-context tests and the Dockerfile.
- Ingestion suite at 23 tests, all passing (`./mvnw test`).
- Started the query service: Maven build (JPA, Kafka admin client, Prometheus), application entry point, README and Maven wrapper. The slice compiles (`./mvnw compile`); controllers, services and persistence follow.
- Brought in the query service's persistence model: JPA entities for anomalies, processed telemetry, incidents, device quarantine, operators, operator sessions and operator avatars, plus the API error response shape and the not-found/conflict/auth exceptions the handler will map to it. The slice compiles (`./mvnw compile`).
- Added the Spring Data repositories and `Specification` builders for anomalies, incidents, device quarantine, processed telemetry and operators/sessions/avatars. The slice compiles (`./mvnw compile`); services and controllers are next.

## 2026-10-07

- Added the ingestion service's Kafka producer path: typed properties, producer configuration, `KafkaProducerService` with dead letter routing and `TelemetryPublishingException`.
- Added tests for the producer configuration and service — 11 tests, all passing.

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
