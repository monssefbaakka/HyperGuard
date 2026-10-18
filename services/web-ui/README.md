# PulseStream Web Console

React + TypeScript console for the PulseStream platform. It reads persisted telemetry through
`query-service` and writes new events through `ingestion-service`.

## Authentication and profile

The console opens with a sign-in screen. On first use, create an operator account from the
registration link. The query service issues a revocable bearer session; the browser keeps it across
reloads and validates it with the service before reopening the console. The profile page supports
updating the display name and email, changing the password, and adding or removing a profile photo.
Signing out revokes the server-side session.

| Section | What it does | Backend |
| :--- | :--- | :--- |
| **Overview** | Plain-language status ("Everything looks normal" / "3 alerts need attention"), headline counts, a 24-hour activity chart, per-device rows with trend sparklines, and the latest readings. | `GET /api/v1/summary`, `/activity`, `/devices`, `/telemetry/series`, `/telemetry` |
| **Readings** | Sortable, paged table of every measurement, filtered by device, measurement and period. | `GET /api/v1/telemetry` |
| **Alerts** | Readings that fell outside their expected range, with severity and reason filters. | `GET /api/v1/anomalies` |
| **Trends** | Chart of one measurement over time for one device, with latest/average/lowest/highest. | `GET /api/v1/telemetry/series` |
| **Send a reading** | Guided form that puts a measurement into the pipeline, then waits and confirms when it comes out the other end. | `POST /api/v1/events` (ingestion) |

The organisation selector (shown only when more than one tenant has data) applies across every
section; the filter options come from `GET /api/v1/facets`.

### Written for non-technical readers

The default view avoids anything that only means something to whoever operates the pipeline:

* Times read as "4 minutes ago", with the exact timestamp on hover.
* Periods are chosen from presets — last hour, last 24 hours, last 7 days, last 30 days, all time —
  and relative presets are resolved per request, so "last hour" stays the last hour on reload.
* Values carry their unit (`21.5°C`), and metric and severity names are title-cased.
* Event ids, event types, source services, tenants and stored-at timestamps are hidden.
* Failures say what it means and what to do; the raw status and message sit under "Technical
  details".
* Empty screens offer the next step rather than just stating the absence.

**Show technical details** in the footer puts the raw columns, the event-type filter and the service
endpoints back on screen. The preference is remembered per browser (`localStorage`).

### Appearance and refresh

* **Theme** — a deep-navy dark palette with an indigo accent, plus a light variant. The footer switch
  offers Light / Auto / Dark; `Auto` follows the operating system, and an explicit choice stamps
  `data-theme` on the root element so it wins over the media query in both directions. Remembered per
  browser.
* **Live updates** — the console refreshes every 30 seconds on its own. The pill in the header shows
  `Live` or `Paused` and toggles it; polling stops while the tab is hidden and catches up when it is
  looked at again, so a background tab does not poll all day or come back showing a stale
  "last checked" time.

The one place the console volunteers bad news is the Alerts tab: anomaly persistence is not
implemented yet, so an empty list there is explained rather than left to read as "all clear".

---

## Running it locally

The console needs the read side up, and the write side too if you want the Send a reading form to work.

### 1. Infrastructure

```bash
cd infrastructure/docker
docker compose up -d
```

Postgres is the one the console depends on directly; Kafka is what Send a reading needs in order
for a submitted event to reach the processor.

### 2. Backend services

Each runs on the host, from its own module:

```bash
cd services/query-service    && ./mvnw spring-boot:run   # :8083, the read API
cd services/ingestion-service && ./mvnw spring-boot:run  # :8081, needed by Send a reading
cd services/telemetry-processor && ./mvnw spring-boot:run # :8082, turns raw events into rows
```

### 3. The console

```bash
cd services/web-ui
npm ci
npm run dev
```

Then open <http://localhost:5173>.

---

## How it reaches the backends

The client only ever calls two same-origin prefixes, so no CORS preflight is involved and the same
bundle works in both dev and container mode:

| Prefix | Target |
| :--- | :--- |
| `/api` | `query-service` on `:8083` |
| `/ingest` | `ingestion-service` on `:8081` |

In development the Vite dev server proxies them (`vite.config.ts`); override the targets with
`PULSESTREAM_QUERY_URL` and `PULSESTREAM_INGESTION_URL`. In the container nginx proxies the same two
prefixes (`nginx.conf`), configured through `PULSESTREAM_QUERY_HOST`/`PULSESTREAM_QUERY_PORT` and
`PULSESTREAM_INGESTION_HOST`/`PULSESTREAM_INGESTION_PORT`.

`query-service` additionally allows `http://localhost:5173` and `http://localhost:8090` as CORS
origins (`pulsestream.query.cors-allowed-origins`), which covers reaching the API directly rather
than through a proxy.

---

## Container

The console has its own Compose service behind the `ui` profile, so the normal infrastructure
bring-up is unaffected:

```bash
cd infrastructure/docker
docker compose --profile ui up -d --build web-ui
```

It listens on <http://localhost:8090> (`WEB_UI_PORT`) and proxies to the Spring services on the host
via `host.docker.internal`, the same way the Prometheus scrape config reaches them.

---

## Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Vite dev server with backend proxying, on `:5173`. |
| `npm run build` | Type-checks with `tsc --noEmit`, then produces `dist/`. |
| `npm run preview` | Serves the built bundle. Note: no backend proxy, so use the container or the dev server for a working console. |
| `npm run typecheck` | Type-check only. |

---

## Notes

* Anomalies are persisted by `telemetry-processor` and exposed through `query-service`; the
  forensics view groups recorded anomalies by device and time window rather than implying a
  probabilistic root-cause model.
* Ingestion answers `202` as soon as the event reaches Kafka, not when it has been stored. Rather
  than leave that gap unexplained, the Send a reading form polls the read API until the reading comes
  back out (up to 45s) and then confirms it; if the pipeline is working through a backlog it says the
  reading is still on its way instead of claiming success.
* Custom periods are entered in local time and sent as UTC instants.
