import { beforeEach, describe, expect, it } from 'vitest';
import type { StateSnapshot } from '@fleet-tracker/shared';
import { useDroneStore } from '../lib/droneStore';

const s1: StateSnapshot = {
  droneId: 'd1',
  ts: 1000,
  lat: 50.4,
  lng: 30.5,
  altitude_m: 100,
  heading_deg: 45,
  speed_mps: 10,
  battery_pct: 80,
  status: 'active',
};
const s2: StateSnapshot = {
  droneId: 'd2',
  ts: 1001,
  lat: 50.5,
  lng: 30.6,
  altitude_m: 150,
  heading_deg: 90,
  speed_mps: 5,
  battery_pct: 20,
  status: 'idle',
};

describe('useDroneStore', () => {
  beforeEach(() => {
    useDroneStore.setState({ drones: new Map(), selectedId: null });
  });

  it('starts with empty drones and no selection', () => {
    const { drones, selectedId } = useDroneStore.getState();
    expect(drones.size).toBe(0);
    expect(selectedId).toBeNull();
  });

  it('setSnapshot populates drones keyed by droneId', () => {
    useDroneStore.getState().setSnapshot([s1, s2]);
    const { drones } = useDroneStore.getState();
    expect(drones.size).toBe(2);
    expect(drones.get('d1')).toEqual(s1);
    expect(drones.get('d2')).toEqual(s2);
  });

  it('setSnapshot fully replaces prior state (no residual entries)', () => {
    useDroneStore.getState().setSnapshot([s1, s2]);
    useDroneStore.getState().setSnapshot([s1]);
    const { drones } = useDroneStore.getState();
    expect(drones.size).toBe(1);
    expect(drones.has('d2')).toBe(false);
  });

  it('updateDrone updates exactly one entry', () => {
    useDroneStore.getState().setSnapshot([s1, s2]);
    const updated = { ...s1, battery_pct: 42 };
    useDroneStore.getState().updateDrone(updated);
    const { drones } = useDroneStore.getState();
    expect(drones.get('d1')?.battery_pct).toBe(42);
    expect(drones.get('d2')).toEqual(s2); // unchanged
    expect(drones.size).toBe(2);
  });

  it('updateDrone adds entry if droneId not in map', () => {
    useDroneStore.getState().setSnapshot([s1]);
    useDroneStore.getState().updateDrone(s2);
    expect(useDroneStore.getState().drones.size).toBe(2);
  });

  it('selectDrone sets selectedId', () => {
    useDroneStore.getState().selectDrone('d1');
    expect(useDroneStore.getState().selectedId).toBe('d1');
  });

  it('selectDrone(null) clears selection', () => {
    useDroneStore.getState().selectDrone('d1');
    useDroneStore.getState().selectDrone(null);
    expect(useDroneStore.getState().selectedId).toBeNull();
  });
});
