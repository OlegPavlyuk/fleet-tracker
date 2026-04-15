import { describe, it, expect } from 'vitest';
import { createDroneState, tick, stateToTelemetry, type BBox } from './drone.js';

const KYIV_BBOX: BBox = {
  minLng: 30.3,
  minLat: 50.35,
  maxLng: 30.7,
  maxLat: 50.55,
};

describe('createDroneState', () => {
  it('initializes drone within the provided bbox', () => {
    for (let i = 0; i < 20; i++) {
      const state = createDroneState(`drone-${i}`, KYIV_BBOX);
      expect(state.lat).toBeGreaterThanOrEqual(KYIV_BBOX.minLat);
      expect(state.lat).toBeLessThanOrEqual(KYIV_BBOX.maxLat);
      expect(state.lng).toBeGreaterThanOrEqual(KYIV_BBOX.minLng);
      expect(state.lng).toBeLessThanOrEqual(KYIV_BBOX.maxLng);
    }
  });

  it('assigns the given droneId', () => {
    const state = createDroneState('test-id', KYIV_BBOX);
    expect(state.droneId).toBe('test-id');
  });

  it('initializes with valid heading (0–360)', () => {
    const state = createDroneState('d1', KYIV_BBOX);
    expect(state.heading_deg).toBeGreaterThanOrEqual(0);
    expect(state.heading_deg).toBeLessThan(360);
  });

  it('initializes with positive speed and altitude', () => {
    const state = createDroneState('d1', KYIV_BBOX);
    expect(state.speed_mps).toBeGreaterThan(0);
    expect(state.altitude_m).toBeGreaterThan(0);
  });

  it('initializes with battery at 100%', () => {
    const state = createDroneState('d1', KYIV_BBOX);
    expect(state.battery_pct).toBe(100);
  });
});

describe('tick', () => {
  it('moves drone in the heading direction', () => {
    const state = createDroneState('d1', KYIV_BBOX);
    // Force heading north (0 deg), position in middle of bbox
    const northDrone = {
      ...state,
      lat: 50.45,
      lng: 30.5,
      heading_deg: 0,
      speed_mps: 20,
    };
    const next = tick(northDrone, KYIV_BBOX, 1000);
    // Heading north → lat should increase
    expect(next.lat).toBeGreaterThan(northDrone.lat);
    // lng should stay roughly the same (cos(0)=1, sin(0)=0)
    expect(Math.abs(next.lng - northDrone.lng)).toBeLessThan(0.001);
  });

  it('moves drone east when heading is 90°', () => {
    const state = createDroneState('d1', KYIV_BBOX);
    const eastDrone = {
      ...state,
      lat: 50.45,
      lng: 30.4,
      heading_deg: 90,
      speed_mps: 20,
    };
    const next = tick(eastDrone, KYIV_BBOX, 1000);
    expect(next.lng).toBeGreaterThan(eastDrone.lng);
    expect(Math.abs(next.lat - eastDrone.lat)).toBeLessThan(0.001);
  });

  it('drains battery by ~0.1% per second', () => {
    const state = { ...createDroneState('d1', KYIV_BBOX), battery_pct: 50 };
    const next = tick(state, KYIV_BBOX, 1000);
    // Battery should decrease between 0.05 and 0.2 per 1000ms tick
    expect(next.battery_pct).toBeLessThan(state.battery_pct);
    expect(next.battery_pct).toBeGreaterThanOrEqual(state.battery_pct - 0.2);
  });

  it('never drains battery below 0', () => {
    const state = { ...createDroneState('d1', KYIV_BBOX), battery_pct: 0.05 };
    const next = tick(state, KYIV_BBOX, 1000);
    expect(next.battery_pct).toBeGreaterThanOrEqual(0);
  });

  it('reverses heading when drone would leave bbox', () => {
    const state = createDroneState('d1', KYIV_BBOX);
    // Place drone right at north edge heading north
    const edgeDrone = {
      ...state,
      lat: KYIV_BBOX.maxLat - 0.0001,
      lng: 30.5,
      heading_deg: 0,
      speed_mps: 50, // fast enough to overshoot in one tick
    };
    const next = tick(edgeDrone, KYIV_BBOX, 1000);
    // Should stay within bbox after bounce
    expect(next.lat).toBeLessThanOrEqual(KYIV_BBOX.maxLat);
    expect(next.lat).toBeGreaterThanOrEqual(KYIV_BBOX.minLat);
  });

  it('keeps speed within plausible range [2, 30] m/s', () => {
    let state = createDroneState('d1', KYIV_BBOX);
    for (let i = 0; i < 100; i++) {
      state = tick(state, KYIV_BBOX, 1000);
      expect(state.speed_mps).toBeGreaterThanOrEqual(2);
      expect(state.speed_mps).toBeLessThanOrEqual(30);
    }
  });

  it('keeps heading within [0, 360)', () => {
    let state = createDroneState('d1', KYIV_BBOX);
    for (let i = 0; i < 100; i++) {
      state = tick(state, KYIV_BBOX, 1000);
      expect(state.heading_deg).toBeGreaterThanOrEqual(0);
      expect(state.heading_deg).toBeLessThan(360);
    }
  });

  it('preserves droneId across ticks', () => {
    const state = createDroneState('my-drone', KYIV_BBOX);
    const next = tick(state, KYIV_BBOX, 1000);
    expect(next.droneId).toBe('my-drone');
  });
});

describe('stateToTelemetry', () => {
  it('produces a valid TelemetryMessage shape', () => {
    const state = createDroneState('d1', KYIV_BBOX);
    const msg = stateToTelemetry(state);
    expect(msg.droneId).toBe(state.droneId);
    expect(msg.lat).toBe(state.lat);
    expect(msg.lng).toBe(state.lng);
    expect(msg.altitude_m).toBe(state.altitude_m);
    expect(msg.heading_deg).toBe(state.heading_deg);
    expect(msg.speed_mps).toBe(state.speed_mps);
    expect(msg.battery_pct).toBe(state.battery_pct);
    expect(typeof msg.ts).toBe('number');
    expect(msg.ts).toBeGreaterThan(0);
  });
});
