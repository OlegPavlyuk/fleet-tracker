import type { TelemetryMessage } from '@fleet-tracker/shared';

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface DroneState {
  droneId: string;
  lat: number;
  lng: number;
  altitude_m: number;
  heading_deg: number;
  speed_mps: number;
  battery_pct: number;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Normalise heading to [0, 360)
function normHeading(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

export function createDroneState(droneId: string, bbox: BBox): DroneState {
  return {
    droneId,
    lat: lerp(bbox.minLat, bbox.maxLat, Math.random()),
    lng: lerp(bbox.minLng, bbox.maxLng, Math.random()),
    altitude_m: lerp(50, 150, Math.random()),
    heading_deg: Math.random() * 360,
    speed_mps: lerp(8, 18, Math.random()),
    battery_pct: 100,
  };
}

/**
 * Advance drone state by deltaMs milliseconds.
 *
 * Flight model:
 * - heading drifts ±10° per tick
 * - speed drifts ±2 m/s per tick, clamped to [2, 30]
 * - altitude drifts ±5 m per tick, clamped to [20, 200]
 * - battery drains 0.1% per second
 * - if new position is outside bbox, heading is reflected
 */
export function tick(state: DroneState, bbox: BBox, deltaMs: number): DroneState {
  const deltaS = deltaMs / 1000;

  // ── Jitter heading ──────────────────────────────────────────────────────────
  const headingJitter = (Math.random() - 0.5) * 20; // ±10°
  const heading = normHeading(state.heading_deg + headingJitter);

  // ── Jitter speed ────────────────────────────────────────────────────────────
  const speedJitter = (Math.random() - 0.5) * 4; // ±2 m/s
  const speed = Math.max(2, Math.min(30, state.speed_mps + speedJitter));

  // ── Advance position ─────────────────────────────────────────────────────────
  const dist = speed * deltaS;

  // Convert to degree deltas
  // 1° lat ≈ 111 320 m; 1° lng ≈ 111 320 * cos(lat) m
  const headingRad = toRad(heading);
  const latDelta = (dist * Math.cos(headingRad)) / 111_320;
  const lngDelta = (dist * Math.sin(headingRad)) / (111_320 * Math.cos(toRad(state.lat)));

  let newLat = state.lat + latDelta;
  let newLng = state.lng + lngDelta;

  // ── Bounce off bbox walls ────────────────────────────────────────────────────
  let headingDeg = heading;

  if (newLat > bbox.maxLat || newLat < bbox.minLat) {
    newLat = Math.max(bbox.minLat, Math.min(bbox.maxLat, newLat));
    // Reflect north/south component: heading → 180° - heading
    headingDeg = normHeading(180 - headingDeg);
  }

  if (newLng > bbox.maxLng || newLng < bbox.minLng) {
    newLng = Math.max(bbox.minLng, Math.min(bbox.maxLng, newLng));
    // Reflect east/west component: heading → 360° - heading
    headingDeg = normHeading(360 - headingDeg);
  }

  // ── Jitter altitude ──────────────────────────────────────────────────────────
  const altJitter = (Math.random() - 0.5) * 10; // ±5 m
  const altitude = Math.max(20, Math.min(200, state.altitude_m + altJitter));

  // ── Drain battery ────────────────────────────────────────────────────────────
  const batteryDrain = 0.1 * deltaS;
  const battery = Math.max(0, state.battery_pct - batteryDrain);

  return {
    droneId: state.droneId,
    lat: newLat,
    lng: newLng,
    altitude_m: altitude,
    heading_deg: headingDeg,
    speed_mps: speed,
    battery_pct: battery,
  };
}

export function stateToTelemetry(state: DroneState): TelemetryMessage {
  return {
    droneId: state.droneId,
    ts: Date.now(),
    lat: state.lat,
    lng: state.lng,
    altitude_m: state.altitude_m,
    heading_deg: state.heading_deg,
    speed_mps: state.speed_mps,
    battery_pct: state.battery_pct,
  };
}
