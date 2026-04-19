import { Counter, Gauge, Histogram } from 'prom-client';
import { registry } from './registry.js';

const durationBuckets = [0.1, 0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000];
const batchBuckets = [1, 10, 25, 50, 100, 200, 500];
const fanoutBuckets = [1, 10, 50, 100, 500, 1000, 5000];

// ── Ingest WS ─────────────────────────────────────────────────────────────────

export const wsIngestConnections = new Gauge({
  name: 'ws_ingest_connections',
  help: 'Current number of open ingest WebSocket connections',
  registers: [registry],
});

export const wsConnectionsTotal = new Counter({
  name: 'ws_connections_total',
  help: 'Total WebSocket connection lifecycle events',
  labelNames: ['endpoint', 'event'] as const,
  registers: [registry],
});

export const validateDurationMs = new Histogram({
  name: 'validate_duration_ms',
  help: 'Time to JSON-parse and zod-validate a single telemetry frame (ms)',
  buckets: durationBuckets,
  registers: [registry],
});

export const ingestMessagesTotal = new Counter({
  name: 'ingest_messages_total',
  help: 'Total ingest frames processed',
  labelNames: ['result'] as const,
  registers: [registry],
});

// ── State ─────────────────────────────────────────────────────────────────────

export const stateUpdateDurationMs = new Histogram({
  name: 'state_update_duration_ms',
  help: 'Time to run StateManager.update() (ms)',
  buckets: durationBuckets,
  registers: [registry],
});

// ── Persist queue ─────────────────────────────────────────────────────────────

export const persistEnqueueDurationMs = new Histogram({
  name: 'persist_enqueue_duration_ms',
  help: 'Time to execute PersistQueue.push() (ms)',
  buckets: durationBuckets,
  registers: [registry],
});

export const persistQueueSize = new Gauge({
  name: 'persist_queue_size',
  help: 'Current number of entries waiting in the persist queue',
  registers: [registry],
});

export const persistFlushDurationMs = new Histogram({
  name: 'persist_flush_duration_ms',
  help: 'Time to complete a persist flush (batchInsert) (ms)',
  buckets: durationBuckets,
  registers: [registry],
});

export const persistBatchSize = new Histogram({
  name: 'persist_batch_size',
  help: 'Number of rows in each persist flush batch',
  buckets: batchBuckets,
  registers: [registry],
});

export const persistFlushTotal = new Counter({
  name: 'persist_flush_total',
  help: 'Total persist flush operations',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const queueWaitMs = new Histogram({
  name: 'queue_wait_ms',
  help: 'Per-entry time between enqueue and flush start (ms)',
  buckets: durationBuckets,
  registers: [registry],
});

export const persistDroppedTotal = new Counter({
  name: 'persist_dropped_total',
  help: 'Total telemetry writes dropped (ring-buffer eviction + flush errors)',
  registers: [registry],
});

// ── Realtime WS ───────────────────────────────────────────────────────────────

export const wsStreamConnections = new Gauge({
  name: 'ws_stream_connections',
  help: 'Current number of open stream WebSocket connections',
  registers: [registry],
});

export const broadcastSendDurationMs = new Histogram({
  name: 'broadcast_send_duration_ms',
  help: 'Time to serialise and send one update to all connected stream clients (ms)',
  buckets: durationBuckets,
  registers: [registry],
});

export const broadcastFanoutSize = new Histogram({
  name: 'broadcast_fanout_size',
  help: 'Number of stream clients receiving each broadcast update',
  buckets: fanoutBuckets,
  registers: [registry],
});

export const broadcastSendFailuresTotal = new Counter({
  name: 'broadcast_send_failures_total',
  help: 'Total broadcast sends that threw an error',
  registers: [registry],
});

export const serverIngressToBroadcastMs = new Histogram({
  name: 'server_ingress_to_broadcast_ms',
  help: 'Server-owned e2e latency: server_recv_ts to server_send_ts (ms)',
  buckets: durationBuckets,
  registers: [registry],
});
