// ── WebSocket paths ───────────────────────────────────────────────────────────

export const WS_INGEST_PATH = '/ws/ingest';
export const WS_STREAM_PATH = '/ws/stream';

// ── WebSocket close codes ─────────────────────────────────────────────────────

export const WS_CLOSE = {
  /** Normal closure */
  NORMAL: 1000,
  /** Unsupported data / malformed frame */
  UNSUPPORTED_DATA: 1003,
  /** Authentication failed (custom) */
  AUTH_FAILED: 4401,
  /** Validation error (custom) */
  VALIDATION_ERROR: 4422,
} as const;

// ── Internal event names ──────────────────────────────────────────────────────

export const EVENTS = {
  STATE_CHANGED: 'state-changed',
} as const;

// ── Limits ────────────────────────────────────────────────────────────────────

/** Maximum WS frame payload size in bytes */
export const MAX_PAYLOAD_BYTES = 4096;

/** Persist queue flush interval in ms */
export const PERSIST_FLUSH_INTERVAL_MS = 500;

/** Persist queue flush batch size */
export const PERSIST_FLUSH_BATCH_SIZE = 100;
