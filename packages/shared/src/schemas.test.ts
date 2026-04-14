import { describe, expect, it } from 'vitest';
import {
  ClientMessageSchema,
  ServerMessageSchema,
  StateSnapshotSchema,
  TelemetryMessageSchema,
} from './schemas.js';

// ── TelemetryMessage ─────────────────────────────────────────────────────────

describe('TelemetryMessageSchema', () => {
  const valid = {
    droneId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    ts: 1_700_000_000_000,
    lat: 50.45,
    lng: 30.52,
    altitude_m: 120,
    heading_deg: 270,
    speed_mps: 15.5,
    battery_pct: 82,
  };

  it('accepts a valid telemetry frame', () => {
    expect(TelemetryMessageSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects lat below -90', () => {
    expect(TelemetryMessageSchema.safeParse({ ...valid, lat: -91 }).success).toBe(false);
  });

  it('rejects lat above 90', () => {
    expect(TelemetryMessageSchema.safeParse({ ...valid, lat: 91 }).success).toBe(false);
  });

  it('rejects lng below -180', () => {
    expect(TelemetryMessageSchema.safeParse({ ...valid, lng: -181 }).success).toBe(false);
  });

  it('rejects lng above 180', () => {
    expect(TelemetryMessageSchema.safeParse({ ...valid, lng: 181 }).success).toBe(false);
  });

  it('rejects battery_pct above 100', () => {
    expect(TelemetryMessageSchema.safeParse({ ...valid, battery_pct: 101 }).success).toBe(false);
  });

  it('rejects battery_pct below 0', () => {
    expect(TelemetryMessageSchema.safeParse({ ...valid, battery_pct: -1 }).success).toBe(false);
  });

  it('rejects negative speed', () => {
    expect(TelemetryMessageSchema.safeParse({ ...valid, speed_mps: -1 }).success).toBe(false);
  });

  it('rejects missing droneId', () => {
    const { droneId: _, ...rest } = valid;
    expect(TelemetryMessageSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects non-number ts', () => {
    expect(TelemetryMessageSchema.safeParse({ ...valid, ts: '2024-01-01' }).success).toBe(false);
  });
});

// ── StateSnapshot ─────────────────────────────────────────────────────────────

describe('StateSnapshotSchema', () => {
  const valid = {
    droneId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    ts: 1_700_000_000_000,
    lat: 50.45,
    lng: 30.52,
    altitude_m: 120,
    heading_deg: 270,
    speed_mps: 15.5,
    battery_pct: 82,
    status: 'active',
  };

  it('accepts a valid snapshot with status active', () => {
    expect(StateSnapshotSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts status idle', () => {
    expect(StateSnapshotSchema.safeParse({ ...valid, status: 'idle' }).success).toBe(true);
  });

  it('accepts status offline', () => {
    expect(StateSnapshotSchema.safeParse({ ...valid, status: 'offline' }).success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(StateSnapshotSchema.safeParse({ ...valid, status: 'flying' }).success).toBe(false);
  });
});

// ── ClientMessage ─────────────────────────────────────────────────────────────

describe('ClientMessageSchema', () => {
  it('accepts subscribe', () => {
    expect(ClientMessageSchema.safeParse({ type: 'subscribe' }).success).toBe(true);
  });

  it('accepts unsubscribe', () => {
    expect(ClientMessageSchema.safeParse({ type: 'unsubscribe' }).success).toBe(true);
  });

  it('rejects unknown type', () => {
    expect(ClientMessageSchema.safeParse({ type: 'listen' }).success).toBe(false);
  });

  it('rejects missing type', () => {
    expect(ClientMessageSchema.safeParse({}).success).toBe(false);
  });
});

// ── ServerMessage ─────────────────────────────────────────────────────────────

describe('ServerMessageSchema', () => {
  const snapshot = {
    droneId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    ts: 1_700_000_000_000,
    lat: 50.45,
    lng: 30.52,
    altitude_m: 120,
    heading_deg: 270,
    speed_mps: 15.5,
    battery_pct: 82,
    status: 'active',
  };

  it('accepts a state update message', () => {
    const msg = { type: 'update', payload: snapshot };
    expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('accepts a full snapshot message (array of snapshots)', () => {
    const msg = { type: 'snapshot', payload: [snapshot] };
    expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('accepts an error message', () => {
    const msg = { type: 'error', message: 'unauthorized' };
    expect(ServerMessageSchema.safeParse(msg).success).toBe(true);
  });

  it('rejects update with invalid payload', () => {
    const msg = { type: 'update', payload: { droneId: 'bad', ts: 'not-a-number' } };
    expect(ServerMessageSchema.safeParse(msg).success).toBe(false);
  });
});
