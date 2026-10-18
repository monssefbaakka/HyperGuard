#!/usr/bin/env node
/**
 * Virtual device fleet for HyperGuard.
 *
 * Simulates a set of construction-site devices (technical rooms, pumps, tanks, cranes...) that
 * publish real telemetry events to ingestion-service, so the whole pipeline — Kafka, processor,
 * PostgreSQL, query-service and the console — runs on live, realistic traffic.
 *
 * Every event is an actual HTTP POST to /api/v1/events. Nothing is written to the database directly.
 *
 * Usage:
 *   node scripts/simulator/virtual-fleet.mjs                      # 12 devices, one reading every 2 s
 *   node scripts/simulator/virtual-fleet.mjs --devices 30 --interval 1000
 *   node scripts/simulator/virtual-fleet.mjs --duration 120 --fault-rate 0.05
 *   node scripts/simulator/virtual-fleet.mjs --scenario overheat  # force one fault right away
 *
 * Options:
 *   --url <base>         ingestion base URL            (default http://localhost:8081)
 *   --tenant <id>        tenant id                      (default tenant-a)
 *   --devices <n>        number of virtual devices      (default 12)
 *   --interval <ms>      delay between two ticks        (default 2000)
 *   --duration <s>       stop after s seconds, 0 = run until Ctrl+C (default 0)
 *   --fault-rate <p>     chance per device per tick to start a fault (default 0.01)
 *   --scenario <name>    start one fault immediately: overheat | spike | offline
 *   --seed <n>           deterministic random sequence
 *   --quiet              only print the summary lines
 */

import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    url: process.env.INGESTION_URL ?? 'http://localhost:8081',
    tenant: 'tenant-a',
    devices: 12,
    interval: 2000,
    duration: 0,
    faultRate: 0.01,
    scenario: null,
    seed: null,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`Missing value after ${flag}`);
      i += 1;
      return value;
    };
    switch (flag) {
      case '--url': options.url = next(); break;
      case '--tenant': options.tenant = next(); break;
      case '--devices': options.devices = positiveInt(next(), flag); break;
      case '--interval': options.interval = positiveInt(next(), flag); break;
      case '--duration': options.duration = Number(next()); break;
      case '--fault-rate': options.faultRate = Number(next()); break;
      case '--scenario': options.scenario = next(); break;
      case '--seed': options.seed = Number(next()); break;
      case '--quiet': options.quiet = true; break;
      case '-h':
      case '--help':
        console.log('See the header of scripts/simulator/virtual-fleet.mjs for usage.');
        process.exit(0);
      default:
        throw new Error(`Unknown option ${flag}`);
    }
  }
  if (options.scenario && !SCENARIOS.includes(options.scenario)) {
    throw new Error(`--scenario must be one of ${SCENARIOS.join(', ')}`);
  }
  return options;
}

function positiveInt(raw, flag) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${flag} expects a positive integer`);
  return value;
}

// ---------------------------------------------------------------------------------------------
// Random source (seedable so a demo can be replayed identically)
// ---------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let random = Math.random;
const gaussian = () => {
  const u = 1 - random();
  const v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// ---------------------------------------------------------------------------------------------
// Device catalogue
// ---------------------------------------------------------------------------------------------

/**
 * Baselines stay well away from zero on purpose: the processor flags any change above 50 % from
 * the previous reading, so a small nominal value with ordinary noise would raise false alerts.
 *
 * `max` is the physical ceiling a fault ramps towards. Only temperature has an absolute threshold
 * in the processor today (80 °C); the other metrics are caught by the spike rule.
 */
const PROFILES = [
  { type: 'temperature-sensor', metric: 'temperature', unit: 'C', base: 24, swing: 3, noise: 0.35, max: 96, prefix: 'TMP', place: 'local-technique' },
  { type: 'vibration-sensor', metric: 'vibration', unit: 'mm/s', base: 4.2, swing: 0.6, noise: 0.15, max: 14, prefix: 'VIB', place: 'pompe' },
  { type: 'level-sensor', metric: 'level', unit: '%', base: 68, swing: 6, noise: 0.6, max: 99, prefix: 'LVL', place: 'reservoir' },
  { type: 'humidity-sensor', metric: 'humidity', unit: '%', base: 52, swing: 5, noise: 0.8, max: 97, prefix: 'HUM', place: 'entrepot' },
  { type: 'pressure-sensor', metric: 'pressure', unit: 'hPa', base: 1013, swing: 4, noise: 0.7, max: 1080, prefix: 'PRS', place: 'compresseur' },
  { type: 'air-quality-sensor', metric: 'co2', unit: 'ppm', base: 620, swing: 80, noise: 12, max: 2400, prefix: 'CO2', place: 'base-vie' },
];

const SITES = ['casablanca-anfa', 'rabat-tour', 'tanger-port', 'marrakech-stade'];
const SCENARIOS = ['overheat', 'spike', 'offline'];

function buildFleet(count) {
  return Array.from({ length: count }, (_, index) => {
    const profile = PROFILES[index % PROFILES.length];
    const site = SITES[Math.floor(index / PROFILES.length) % SITES.length];
    return {
      id: `${profile.prefix}-${String(index + 1).padStart(2, '0')}`,
      profile,
      location: `${site}/${profile.place}`,
      phase: random() * Math.PI * 2,
      drift: 0,
      fault: null,
      sent: 0,
      failed: 0,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Signal model
// ---------------------------------------------------------------------------------------------

function startFault(device, kind) {
  const effectiveKind = kind === 'overheat' && device.profile.metric !== 'temperature' ? 'spike' : kind;
  const lengths = { overheat: 8, spike: 1, offline: 6 };
  device.fault = { kind: effectiveKind, step: 0, length: lengths[effectiveKind] };
}

/** Returns the next value, or null when the device is offline and sends nothing this tick. */
function nextReading(device, tick) {
  const { profile } = device;
  device.drift = device.drift * 0.92 + gaussian() * profile.noise * 0.4;
  const cycle = Math.sin(tick / 30 + device.phase) * profile.swing;
  let value = profile.base + cycle + device.drift + gaussian() * profile.noise;

  if (device.fault) {
    const fault = device.fault;
    fault.step += 1;
    if (fault.kind === 'overheat') {
      // Ramps past the 80 °C threshold, holds, then cools back down.
      const progress = Math.min(1, fault.step / (fault.length / 2));
      value += (profile.max - profile.base) * progress;
    } else if (fault.kind === 'spike') {
      value = Math.min(profile.max, value * 2.1);
    } else if (fault.kind === 'offline') {
      if (fault.step >= fault.length) device.fault = null;
      return null;
    }
    if (fault.step >= fault.length) device.fault = null;
  }

  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------------------------

async function publish(options, device, value) {
  const body = {
    eventId: randomUUID(),
    tenantId: options.tenant,
    eventType: 'telemetry.reading',
    timestamp: new Date().toISOString(),
    source: 'virtual-fleet',
    version: '1.0',
    payload: {
      deviceId: device.id,
      deviceType: device.profile.type,
      metric: device.profile.metric,
      value,
      unit: device.profile.unit,
      location: device.location,
    },
  };
  const started = performance.now();
  try {
    const response = await fetch(`${options.url}/api/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const latency = Math.round(performance.now() - started);
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 160);
      return { ok: false, latency, error: `HTTP ${response.status} ${detail}` };
    }
    return { ok: true, latency };
  } catch (cause) {
    return { ok: false, latency: Math.round(performance.now() - started), error: cause.cause?.code ?? cause.message };
  }
}

// ---------------------------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------------------------

const color = process.stdout.isTTY
  ? { dim: (s) => `\x1b[2m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, amber: (s) => `\x1b[33m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m` }
  : { dim: (s) => s, red: (s) => s, amber: (s) => s, cyan: (s) => s, green: (s) => s };

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.seed !== null) random = mulberry32(options.seed);

  const fleet = buildFleet(options.devices);
  const totals = { sent: 0, failed: 0, faults: 0 };
  const startedAt = Date.now();
  let tick = 0;
  let stopping = false;

  console.log(color.cyan(`HyperGuard virtual fleet → ${options.url}/api/v1/events`));
  console.log(color.dim(`${fleet.length} devices · tenant ${options.tenant} · every ${options.interval} ms · fault rate ${options.faultRate}`));
  for (const device of fleet) {
    console.log(color.dim(`  ${device.id.padEnd(7)} ${device.profile.metric.padEnd(12)} ${device.location}`));
  }

  if (options.scenario) {
    const target = options.scenario === 'overheat'
      ? fleet.find((device) => device.profile.metric === 'temperature') ?? fleet[0]
      : fleet[0];
    startFault(target, options.scenario);
    totals.faults += 1;
    console.log(color.amber(`Scenario "${options.scenario}" started on ${target.id}`));
  }

  process.on('SIGINT', () => { stopping = true; });

  while (!stopping) {
    tick += 1;
    const results = await Promise.all(fleet.map(async (device) => {
      if (!device.fault && random() < options.faultRate) {
        startFault(device, SCENARIOS[Math.floor(random() * SCENARIOS.length)]);
        totals.faults += 1;
        if (!options.quiet) console.log(color.amber(`  ⚠ fault "${device.fault.kind}" started on ${device.id}`));
      }
      // Read before nextReading(): a one-tick fault is already cleared by the time the line prints.
      const faultKind = device.fault?.kind ?? null;
      const value = nextReading(device, tick);
      if (value === null) return { device, skipped: true };
      const result = await publish(options, device, value);
      if (result.ok) { device.sent += 1; totals.sent += 1; } else { device.failed += 1; totals.failed += 1; }
      return { device, value, faultKind, ...result };
    }));

    const published = results.filter((r) => !r.skipped);
    const offline = results.filter((r) => r.skipped).map((r) => r.device.id);
    const errors = published.filter((r) => !r.ok);
    const latencies = published.filter((r) => r.ok).map((r) => r.latency);
    const avg = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;

    if (!options.quiet) {
      const hot = published
        .filter((r) => r.ok && r.faultKind)
        .map((r) => `${r.device.id}=${r.value}${r.device.profile.unit}`);
      const parts = [
        color.dim(`#${String(tick).padStart(4, '0')}`),
        color.green(`${published.length - errors.length} ok`),
        errors.length ? color.red(`${errors.length} failed`) : null,
        offline.length ? color.amber(`offline: ${offline.join(',')}`) : null,
        hot.length ? color.amber(`fault: ${hot.join(' ')}`) : null,
        color.dim(`${avg} ms`),
      ].filter(Boolean);
      console.log(parts.join('  '));
      if (errors.length) console.log(color.red(`  ${errors[0].device.id}: ${errors[0].error}`));
    }

    if (options.duration > 0 && (Date.now() - startedAt) / 1000 >= options.duration) break;
    if (!stopping) await new Promise((resolve) => setTimeout(resolve, options.interval));
  }

  const seconds = Math.round((Date.now() - startedAt) / 1000);
  console.log(color.cyan(`\nStopped after ${seconds}s · ${totals.sent} readings accepted · ${totals.failed} failed · ${totals.faults} faults injected`));
  process.exit(totals.failed > 0 && totals.sent === 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(color.red(error.message));
  process.exit(2);
});
