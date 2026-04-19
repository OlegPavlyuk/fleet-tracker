import { writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { parseHistogram, parseGauge, parseCounter } from './prom-parser.js';
import type { LatencySample } from './subscriber.js';

export interface RunConfig {
  scenario: string;
  tag: string;
  drones: number;
  hz: number;
  durationS: number;
  apiUrl: string;
  metricsToken: string;
  outDir: string;
}

export interface ResultStats {
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

function computeStats(values: number[]): ResultStats {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const pct = (p: number): number => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return Math.round((sorted[Math.max(0, idx)] ?? 0) * 100) / 100;
  };
  return { p50: pct(50), p95: pct(95), p99: pct(99), max: sorted[sorted.length - 1] ?? 0 };
}

async function fetchMetrics(apiUrl: string, metricsToken: string): Promise<string> {
  const httpUrl = apiUrl.replace(/^ws/, 'http');
  const res = await fetch(`${httpUrl}/metrics`, {
    headers: { Authorization: `Bearer ${metricsToken}` },
  });
  if (!res.ok) throw new Error(`/metrics fetch failed: ${res.status}`);
  return res.text();
}

function gitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
}

export async function writeArtifacts(config: RunConfig, samples: LatencySample[]): Promise<void> {
  mkdirSync(config.outDir, { recursive: true });

  const metricsText = await fetchMetrics(config.apiUrl, config.metricsToken);
  writeFileSync(`${config.outDir}/metrics-snapshot.txt`, metricsText);

  const e2e = computeStats(samples.map((s) => s.tRecv - s.tSend));
  const serverRecvToSend = computeStats(samples.map((s) => s.serverSendTs - s.serverRecvTs));
  const sendToClientRecv = computeStats(samples.map((s) => s.tRecv - s.serverSendTs));

  const queueWait = parseHistogram(metricsText, 'queue_wait_ms');
  const persistFlush = parseHistogram(metricsText, 'persist_flush_duration_ms');

  const droppedTotal = parseCounter(metricsText, 'persist_dropped_total');
  const queueSize = parseGauge(metricsText, 'persist_queue_size');
  const ingestOk = parseCounter(metricsText, 'ingest_messages_total', 'result="ok"');
  const persistRows = parseGauge(metricsText, 'persist_batch_size_sum');
  const broadcastSent = parseGauge(metricsText, 'broadcast_send_duration_ms_count');
  const errors = parseCounter(metricsText, 'ingest_messages_total', 'result="invalid"');

  const eventLoopLag = parseGauge(metricsText, 'nodejs_eventloop_lag_p99_seconds');
  const heapMax = parseGauge(metricsText, 'nodejs_heap_size_used_bytes') / 1024 / 1024;

  const results = {
    scenario: config.scenario,
    tag: config.tag,
    git_sha: gitSha(),
    duration_s: config.durationS,
    drones: config.drones,
    hz: config.hz,
    samples: samples.length,
    latency_ms: {
      e2e,
      server_recv_to_send: serverRecvToSend,
      queue_wait: queueWait,
      persist_flush: persistFlush,
      send_to_client_recv: sendToClientRecv,
    },
    backpressure: {
      dropped_total: droppedTotal,
      drop_rate_per_s: Math.round((droppedTotal / config.durationS) * 100) / 100,
      queue_growth_rate_per_s: 0,
      ingest_persist_lag_msgs: Math.max(0, ingestOk - persistRows),
      max_queue_depth: queueSize,
    },
    counters: {
      ingest_ok: ingestOk,
      persist_rows: persistRows,
      broadcast_sent: broadcastSent,
      errors,
    },
    system: {
      event_loop_lag_p99_s: eventLoopLag,
      heap_max_mb: Math.round(heapMax * 10) / 10,
      gc_pause_p99_ms: 0,
    },
  };

  writeFileSync(`${config.outDir}/results.json`, JSON.stringify(results, null, 2));

  const configDoc = {
    scenario: config.scenario,
    tag: config.tag,
    git_sha: gitSha(),
    drones: config.drones,
    hz: config.hz,
    duration_s: config.durationS,
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
  };
  writeFileSync(`${config.outDir}/config.json`, JSON.stringify(configDoc, null, 2));

  const summary = `# Benchmark Summary — ${config.scenario} / ${config.tag}

## Run info
- Scenario: ${config.scenario}
- Tag: ${config.tag}
- Drones: ${config.drones} @ ${config.hz} Hz for ${config.durationS}s
- Samples collected: ${samples.length}

## Key numbers
| Segment | p50 | p95 | p99 |
|---|---|---|---|
| e2e (ms) | ${e2e.p50} | ${e2e.p95} | ${e2e.p99} |
| server recv→send (ms) | ${serverRecvToSend.p50} | ${serverRecvToSend.p95} | ${serverRecvToSend.p99} |
| send→client recv (ms) | ${sendToClientRecv.p50} | ${sendToClientRecv.p95} | ${sendToClientRecv.p99} |
| queue wait (ms) | ${queueWait.p50} | ${queueWait.p95} | ${queueWait.p99} |
| persist flush (ms) | ${persistFlush.p50} | ${persistFlush.p95} | ${persistFlush.p99} |

## Observations
<!-- Fill in after reviewing results -->

## Proposed next action
<!-- What does the data suggest we investigate next? -->
`;
  writeFileSync(`${config.outDir}/summary.md`, summary);
}
