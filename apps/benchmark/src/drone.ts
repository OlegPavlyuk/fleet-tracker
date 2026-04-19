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

export function tick(state: DroneState, bbox: BBox, deltaMs: number): DroneState {
  const deltaS = deltaMs / 1000;
  const heading = normHeading(state.heading_deg + (Math.random() - 0.5) * 20);
  const speed = Math.max(2, Math.min(30, state.speed_mps + (Math.random() - 0.5) * 4));
  const dist = speed * deltaS;
  const headingRad = toRad(heading);
  const latDelta = (dist * Math.cos(headingRad)) / 111_320;
  const lngDelta = (dist * Math.sin(headingRad)) / (111_320 * Math.cos(toRad(state.lat)));

  let newLat = state.lat + latDelta;
  let newLng = state.lng + lngDelta;
  let headingDeg = heading;

  if (newLat > bbox.maxLat || newLat < bbox.minLat) {
    newLat = Math.max(bbox.minLat, Math.min(bbox.maxLat, newLat));
    headingDeg = normHeading(180 - headingDeg);
  }
  if (newLng > bbox.maxLng || newLng < bbox.minLng) {
    newLng = Math.max(bbox.minLng, Math.min(bbox.maxLng, newLng));
    headingDeg = normHeading(360 - headingDeg);
  }

  return {
    droneId: state.droneId,
    lat: newLat,
    lng: newLng,
    altitude_m: Math.max(20, Math.min(200, state.altitude_m + (Math.random() - 0.5) * 10)),
    heading_deg: headingDeg,
    speed_mps: speed,
    battery_pct: Math.max(0, state.battery_pct - 0.1 * deltaS),
  };
}

export function stateToPayload(state: DroneState, benchmarkId: string): Record<string, unknown> {
  return {
    droneId: state.droneId,
    ts: Date.now(),
    lat: state.lat,
    lng: state.lng,
    altitude_m: state.altitude_m,
    heading_deg: state.heading_deg,
    speed_mps: state.speed_mps,
    battery_pct: state.battery_pct,
    benchmark_id: benchmarkId,
  };
}
