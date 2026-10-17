## Grafana Dashboards

Version-controlled `Grafana` dashboard definitions for the `PulseStream` platform.
These JSON files are the single source of truth for the platform's dashboards and
are committed to the repository so dashboard changes are reviewed and reproducible.

### Files

| Dashboard | UID | Description |
| :-------- | :-- | :---------- |
| `service-health.json` | `pulsestream-service-health` | Is the platform up, is it serving traffic cleanly, is the JVM under it healthy |
| `ingestion-metrics.json` | `pulsestream-ingestion-metrics` | What `POST /api/v1/events` accepted, what it rejected, and how long it took |

Each dashboard references the provisioned `Prometheus` datasource by its stable
`uid` (`prometheus`), so the JSON is portable across environments without
hard-coded datasource identifiers.

### How they are laid out

Both dashboards follow the same shape: a single row of stat tiles answering
"what is happening right now", then charts underneath that explain the tiles.
Nothing needs scrolling to know whether something is wrong — scrolling is for
finding out why.

`Service Health`, scoped by the `Service` variable (`job`):

| Row | Panels |
| :-- | :----- |
| Right now | Services up · Throughput · Error rate (5xx share) · Avg latency · Heap used · Uptime |
| Traffic | Request rate by service · Outcomes (stacked `SUCCESS`/`CLIENT_ERROR`/`SERVER_ERROR`) · Latency average vs slowest · Slowest endpoints (top 5 by `uri`) |
| Runtime | Heap used against its limit · Process vs system CPU · GC pause seconds per second · WARN and ERROR log events |

`Ingestion Metrics`, fixed to `job="ingestion-service"`, `uri="/api/v1/events"`:

| Row | Panels |
| :-- | :----- |
| Right now | Accepted/s · Accept ratio · Rejected (4xx, counted over the range) · Failed (5xx, counted over the range) · Avg latency · Peak latency |
| Flow | Ingest rate by outcome · Latency average vs peak · Responses in range by status · Why requests failed (top 5 by `exception`) · Endpoint mix |

Two conventions worth knowing when adding a panel here:

- **Colour carries meaning, not decoration.** Green `#1F9254` is a healthy or
  accepted result, amber `#D9822B` is the caller's fault or a warning threshold,
  red `#C0392B` is the platform failing, slate `#5B6B7F` is context with no
  verdict attached. The palette is chosen for the light theme these dashboards
  declare (`"style": "light"`).
- **No panel is a percentile.** These services export no
  `http_server_requests_seconds_bucket` — Micrometer histograms are not enabled
  in `application.yml` — so latency is either the mean (`_sum` / `_count`) or
  Micrometer's `_max`, the slowest single request in a scrape window. A
  `histogram_quantile` panel added here would draw an empty graph. Enable
  `management.metrics.distribution.percentiles-histogram` on the services first.

Every panel carries a `description`, which `Grafana` shows as the ⓘ tooltip in
its corner. That is where a panel explains how to read it; keep new panels to
the same standard rather than putting the explanation only here.

### How dashboards are loaded

The local `Docker Compose` platform provisions these dashboards automatically.
`infrastructure/docker/docker-compose.yml` mounts this directory into the
`Grafana` container at `/etc/grafana/dashboards`, and the file provider in
`infrastructure/docker/grafana/provisioning/dashboards/dashboards.yml` loads every
JSON file from that path into the `PulseStream` folder.

Start the platform and the dashboards appear under
`Dashboards > PulseStream` at `http://localhost:3000`:

```bash
cd infrastructure/docker
docker compose up -d
```

### In Kubernetes

These files are the `Docker Compose` set. The cluster loads its own copies from
`infrastructure/kubernetes/monitoring/grafana/dashboards-configmap.yaml`, because
`Grafana` in the cluster reads its dashboards from a `ConfigMap` and cannot mount
this directory off the host.

The selector is the same in both. Compose scrapes one static target per service
and the cluster (`infrastructure/kubernetes/monitoring/prometheus-values.yaml`)
defines one `role: pod` scrape job per service, so a workload is `job="ingestion-service"`
either way. What the cluster adds is `namespace`, `pod` and `node` on every series,
and the cluster copy of `service-health.json` uses `pod` to break the per-pod panels
out by replica — a `Compose` service has one container, so those panels stay summed
here.

**The two sets have diverged.** The layout above is the `Compose` set only; the
cluster `ConfigMap` still carries the previous four-panel `Service Health` and
three-panel `Ingestion Metrics`. UIDs and titles are still shared, so a link
resolves to the same dashboard either way, but the panels behind it differ until
the cluster set is brought across.

That divergence is pinned, not ignored:
`scripts/tests/test-grafana-dashboard-provisioning.ps1` records the panel IDs
each side currently has and fails when either side changes again. Bringing the
cluster copy across therefore means porting the panels into
`dashboards-configmap.yaml` (keeping any `pod` breakdown the cluster wants) and
deleting that dashboard's entry from `$pendingPanelDivergence` in the test, which
restores the strict panel-for-panel comparison for it.

### Re-importing a dashboard manually

Any dashboard here can be re-imported into a running `Grafana` without the
provisioning mount:

1. Open `Grafana` and go to `Dashboards > New > Import`.
2. Upload the JSON file (or paste its contents).
3. When prompted, select the `Prometheus` datasource (`uid: prometheus`).
4. Click `Import`.

### Exporting changes back to version control

After editing a dashboard in the `Grafana` UI, export the updated definition and
commit it here so the file stays the source of truth:

1. Open the dashboard and go to `Share > Export > Save to file`.
   Leave `Export for sharing externally` **disabled** — that option rewrites the
   datasource into a `${DS_...}` input variable, which breaks the stable
   `prometheus` UID these provisioned files rely on.
2. Replace the matching JSON file in this directory with the exported file.
3. Confirm the datasource still references `"uid": "prometheus"` (not a
   `${DS_...}` variable), then commit the change.
