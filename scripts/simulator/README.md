# Virtual device fleet

`virtual-fleet.mjs` simulates a fleet of construction-site devices that publish real telemetry to
`ingestion-service`. Every reading is an actual `POST /api/v1/events`, so the whole chain runs on live
traffic: Kafka, `telemetry-processor`, PostgreSQL, `query-service` and the web console.

It needs Node.js 18+ and no dependencies.

## Run it

Start the platform first (see the root README), then:

```bash
node scripts/simulator/virtual-fleet.mjs
```

| Option | Default | Meaning |
| :--- | :--- | :--- |
| `--url` | `http://localhost:8081` | Ingestion base URL (or `INGESTION_URL`) |
| `--tenant` | `tenant-a` | Tenant the readings belong to |
| `--devices` | `12` | Number of virtual devices |
| `--interval` | `2000` | Milliseconds between two ticks |
| `--duration` | `0` | Stop after N seconds; `0` runs until Ctrl+C |
| `--fault-rate` | `0.01` | Chance, per device per tick, that a fault starts |
| `--scenario` | — | Start one fault immediately: `overheat`, `spike`, `offline` |
| `--seed` | — | Replay the same random sequence |
| `--quiet` | — | Print only the final summary |

## The fleet

Devices cycle through six profiles and four sites (`casablanca-anfa`, `rabat-tour`, `tanger-port`,
`marrakech-stade`):

| Id prefix | Metric | Unit | Nominal | Location |
| :--- | :--- | :--- | :--- | :--- |
| `TMP` | `temperature` | °C | ~24 | technical room |
| `VIB` | `vibration` | mm/s | ~4.2 | pump |
| `LVL` | `level` | % | ~68 | tank |
| `HUM` | `humidity` | % | ~52 | warehouse |
| `PRS` | `pressure` | hPa | ~1013 | compressor |
| `CO2` | `co2` | ppm | ~620 | site base |

Each value is a slow cycle plus a correlated drift plus noise. Baselines stay far from zero, because
the processor flags any change above 50 % from the previous reading.

## Faults

| Scenario | What the device does | What the processor raises |
| :--- | :--- | :--- |
| `overheat` | Temperature ramps to ~96 °C, holds, cools down | `temperature is above maximum threshold`, plus a spike on the first jump |
| `spike` | One reading at about twice the nominal value | `value spike detected` |
| `offline` | Sends nothing for six ticks | No event: the gap shows in the stored series |

Detected anomalies appear in the processor log and on `telemetry.events.anomalies`, are stored in
`platform.anomalies`, and open (or extend) an incident for the device — visible on the console's
Forensics page and through `GET /api/v1/incidents`.
