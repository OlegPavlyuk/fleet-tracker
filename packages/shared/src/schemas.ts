import { z } from 'zod';

// ── TelemetryMessage ──────────────────────────────────────────────────────────
// Wire format from emulator → /ws/ingest
// benchmark_id is optional: emulator omits it, benchmark harness includes it.

export const TelemetryMessageSchema = z.object({
  droneId: z.string().min(1),
  ts: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  altitude_m: z.number().min(0),
  heading_deg: z.number().min(0).max(360),
  speed_mps: z.number().min(0),
  battery_pct: z.number().min(0).max(100),
  benchmark_id: z.string().optional(),
});

export type TelemetryMessage = z.infer<typeof TelemetryMessageSchema>;

// ── StateSnapshot ─────────────────────────────────────────────────────────────
// Current drone state held in-memory and broadcast to /ws/stream subscribers.
// msg_id / server_recv_ts / benchmark_id are populated by ingest after v2 Phase 1.

export const DroneStatusSchema = z.enum(['active', 'idle', 'offline']);

export type DroneStatus = z.infer<typeof DroneStatusSchema>;

export const StateSnapshotSchema = z.object({
  droneId: z.string().min(1),
  ts: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  altitude_m: z.number().min(0),
  heading_deg: z.number().min(0).max(360),
  speed_mps: z.number().min(0),
  battery_pct: z.number().min(0).max(100),
  status: DroneStatusSchema,
  msg_id: z.string().optional(),
  server_recv_ts: z.number().optional(),
  benchmark_id: z.string().optional(),
});

export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;

// ── BroadcastSnapshot ─────────────────────────────────────────────────────────
// StateSnapshot enriched with server_send_ts at broadcast time.

export const BroadcastSnapshotSchema = StateSnapshotSchema.extend({
  server_send_ts: z.number().optional(),
});

export type BroadcastSnapshot = z.infer<typeof BroadcastSnapshotSchema>;

// ── ClientMessage ─────────────────────────────────────────────────────────────
// Messages from dashboard WS client → /ws/stream

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe') }),
  z.object({ type: z.literal('unsubscribe') }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ── ServerMessage ─────────────────────────────────────────────────────────────
// Messages from /ws/stream → dashboard WS client

export const ServerMessageSchema = z.discriminatedUnion('type', [
  // Full state dump on initial connect
  z.object({ type: z.literal('snapshot'), payload: z.array(StateSnapshotSchema) }),
  // Single drone update — BroadcastSnapshot adds server_send_ts
  z.object({ type: z.literal('update'), payload: BroadcastSnapshotSchema }),
  // Error notification
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
