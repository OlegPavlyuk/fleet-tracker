import { z } from 'zod';

// ── TelemetryMessage ──────────────────────────────────────────────────────────
// Wire format from emulator → /ws/ingest

export const TelemetryMessageSchema = z.object({
  droneId: z.string().min(1),
  ts: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  altitude_m: z.number().min(0),
  heading_deg: z.number().min(0).max(360),
  speed_mps: z.number().min(0),
  battery_pct: z.number().min(0).max(100),
});

export type TelemetryMessage = z.infer<typeof TelemetryMessageSchema>;

// ── StateSnapshot ─────────────────────────────────────────────────────────────
// Current drone state held in-memory and broadcast to /ws/stream subscribers

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
});

export type StateSnapshot = z.infer<typeof StateSnapshotSchema>;

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
  // Single drone update
  z.object({ type: z.literal('update'), payload: StateSnapshotSchema }),
  // Error notification
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
