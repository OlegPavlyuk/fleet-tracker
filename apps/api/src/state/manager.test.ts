import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager } from './manager.js';
import type { TelemetryMessage } from '@fleet-tracker/shared';

const baseTelemetry: TelemetryMessage = {
  droneId: 'drone-1',
  ts: 1_000_000,
  lat: 50.45,
  lng: 30.52,
  altitude_m: 120,
  heading_deg: 90,
  speed_mps: 10,
  battery_pct: 80,
};

describe('StateManager', () => {
  let manager: StateManager;

  beforeEach(() => {
    manager = new StateManager();
  });

  it('returns undefined for unknown droneId', () => {
    expect(manager.get('unknown')).toBeUndefined();
  });

  it('stores snapshot after update', () => {
    manager.update('drone-1', baseTelemetry);
    const snap = manager.get('drone-1');
    expect(snap).toBeDefined();
    expect(snap?.droneId).toBe('drone-1');
    expect(snap?.lat).toBe(50.45);
    expect(snap?.lng).toBe(30.52);
    expect(snap?.ts).toBe(1_000_000);
  });

  it('overwrites existing snapshot for the same droneId', () => {
    manager.update('drone-1', baseTelemetry);
    manager.update('drone-1', { ...baseTelemetry, lat: 50.99, ts: 2_000_000 });
    const snap = manager.get('drone-1');
    expect(snap?.lat).toBe(50.99);
    expect(snap?.ts).toBe(2_000_000);
  });

  it('getAll returns all stored snapshots', () => {
    manager.update('drone-1', baseTelemetry);
    manager.update('drone-2', { ...baseTelemetry, droneId: 'drone-2' });
    const all = manager.getAll();
    expect(all).toHaveLength(2);
    const ids = all.map((s) => s.droneId);
    expect(ids).toContain('drone-1');
    expect(ids).toContain('drone-2');
  });

  it('getAll returns empty array when no drones', () => {
    expect(manager.getAll()).toEqual([]);
  });

  it('sets status to active when battery > 20%', () => {
    manager.update('drone-1', { ...baseTelemetry, battery_pct: 21 });
    expect(manager.get('drone-1')?.status).toBe('active');
  });

  it('sets status to idle when battery is exactly 20%', () => {
    manager.update('drone-1', { ...baseTelemetry, battery_pct: 20 });
    expect(manager.get('drone-1')?.status).toBe('idle');
  });

  it('sets status to idle when battery < 20%', () => {
    manager.update('drone-1', { ...baseTelemetry, battery_pct: 5 });
    expect(manager.get('drone-1')?.status).toBe('idle');
  });

  it('emits state-changed event with the updated snapshot', () => {
    const received: unknown[] = [];
    manager.on('state-changed', (snap) => received.push(snap));

    manager.update('drone-1', baseTelemetry);

    expect(received).toHaveLength(1);
    expect((received[0] as { droneId: string }).droneId).toBe('drone-1');
  });

  it('emits state-changed on every update', () => {
    const count = { value: 0 };
    manager.on('state-changed', () => count.value++);

    manager.update('drone-1', baseTelemetry);
    manager.update('drone-1', { ...baseTelemetry, ts: 2_000_000 });

    expect(count.value).toBe(2);
  });

  it('returns the snapshot from update()', () => {
    const snap = manager.update('drone-1', baseTelemetry);
    expect(snap.droneId).toBe('drone-1');
    expect(snap.status).toBe('active');
  });

  it('size reflects the number of tracked drones', () => {
    expect(manager.size).toBe(0);
    manager.update('drone-1', baseTelemetry);
    expect(manager.size).toBe(1);
    manager.update('drone-2', { ...baseTelemetry, droneId: 'drone-2' });
    expect(manager.size).toBe(2);
    manager.update('drone-1', baseTelemetry); // overwrite, no size change
    expect(manager.size).toBe(2);
  });
});
