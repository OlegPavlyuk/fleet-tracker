/**
 * Drone Fleet Emulator CLI
 *
 * Environment variables:
 *   EMULATOR_API_URL    Base URL of the Fleet Tracker API  (default: http://localhost:3000)
 *   EMULATOR_EMAIL      User email to authenticate with    (required)
 *   EMULATOR_PASSWORD   User password                      (required)
 *   DRONE_COUNT         Number of drones to simulate       (default: 5)
 *   TICK_MS             Telemetry interval in ms           (default: 1000)
 *   BBOX                minLng,minLat,maxLng,maxLat        (default: Kyiv)
 *
 * Usage:
 *   node dist/index.js
 *   DRONE_COUNT=50 node dist/index.js
 */

import { login, registerDrone, type ApiClient } from './api.js';
import { DroneClient } from './client.js';
import { createDroneState, type BBox } from './drone.js';

// ── Config ──────────────────────────────────────────────────────────────────

const API_URL = process.env['EMULATOR_API_URL'] ?? 'http://localhost:3000';
const EMAIL = process.env['EMULATOR_EMAIL'];
const PASSWORD = process.env['EMULATOR_PASSWORD'];
const DRONE_COUNT = parseInt(process.env['DRONE_COUNT'] ?? '5', 10);
const TICK_MS = parseInt(process.env['TICK_MS'] ?? '1000', 10);

// Default bounding box: Kyiv
const BBOX_ENV = process.env['BBOX'] ?? '30.3,50.35,30.7,50.55';

function parseBbox(raw: string): BBox {
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) {
    throw new Error(`Invalid BBOX "${raw}" — expected minLng,minLat,maxLng,maxLat`);
  }
  const [minLng, minLat, maxLng, maxLat] = parts as [number, number, number, number];
  return { minLng, minLat, maxLng, maxLat };
}

function wsUrl(apiUrl: string): string {
  return apiUrl.replace(/^http/, 'ws') + '/ws/ingest';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    console.error('Error: EMULATOR_EMAIL and EMULATOR_PASSWORD must be set.');
    process.exit(1);
  }

  const bbox = parseBbox(BBOX_ENV);
  const ingestUrl = wsUrl(API_URL);

  console.log(`Fleet Emulator starting`);
  console.log(`  API:       ${API_URL}`);
  console.log(`  Ingest WS: ${ingestUrl}`);
  console.log(`  Drones:    ${DRONE_COUNT}`);
  console.log(`  Tick:      ${TICK_MS}ms`);
  console.log(`  BBox:      ${BBOX_ENV}`);
  console.log();

  // ── Authenticate ───────────────────────────────────────────────────────────
  console.log(`Logging in as ${EMAIL}…`);
  const jwt = await login(API_URL, EMAIL, PASSWORD);
  console.log('Login OK');

  const apiClient: ApiClient = { apiUrl: API_URL, jwt };

  // ── Provision drones ───────────────────────────────────────────────────────
  console.log(`Registering ${DRONE_COUNT} drones…`);
  const clients: DroneClient[] = [];

  for (let i = 0; i < DRONE_COUNT; i++) {
    const name = `emulator-drone-${String(i + 1).padStart(3, '0')}`;
    const provisioned = await registerDrone(apiClient, name);
    const initialState = createDroneState(provisioned.id, bbox);

    clients.push(
      new DroneClient({
        ingestUrl,
        deviceToken: provisioned.deviceToken,
        initialState,
        bbox,
        tickMs: TICK_MS,
      }),
    );

    process.stdout.write(`  [${i + 1}/${DRONE_COUNT}] ${provisioned.id} OK\r`);
  }
  console.log(`\nAll ${DRONE_COUNT} drones registered.`);

  // ── Start all clients ──────────────────────────────────────────────────────
  console.log('Starting telemetry…  (Ctrl+C to stop)\n');
  for (const client of clients) {
    client.start();
  }

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  function shutdown(signal: string): void {
    console.log(`\nReceived ${signal}, stopping all drones…`);
    for (const client of clients) {
      client.stop();
    }
    console.log('Done.');
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error('Fatal:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
