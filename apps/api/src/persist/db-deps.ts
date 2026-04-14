import { sql } from 'drizzle-orm';
import type { TelemetryMessage } from '@fleet-tracker/shared';
import { db } from '../db/index.js';
import { telemetry } from '../db/schema.js';
import type { PersistDeps } from './queue.js';

export function makePersistDeps(): PersistDeps {
  return {
    async batchInsert(rows: TelemetryMessage[]): Promise<void> {
      if (rows.length === 0) return;
      await db.insert(telemetry).values(
        rows.map((r) => ({
          droneId: r.droneId,
          ts: new Date(r.ts),
          // Must use sql template — customType toDriver path does not set SRID (see schema.ts)
          position: sql`ST_SetSRID(ST_MakePoint(${r.lng}, ${r.lat}), 4326)`,
          altitudeM: r.altitude_m,
          headingDeg: r.heading_deg,
          speedMps: r.speed_mps,
          batteryPct: r.battery_pct,
        })),
      );
    },
  };
}
