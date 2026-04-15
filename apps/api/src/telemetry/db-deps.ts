import { eq, and, gte, lte, asc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db as globalDb } from '../db/index.js';
import type { AppDb } from '../db/client.js';
import { drones, telemetry } from '../db/schema.js';
import type { TelemetryDeps, HistoryPoint, BoundingBox } from './routes.js';

export function makeDbTelemetryDeps(db: AppDb = globalDb): TelemetryDeps {
  return {
    findDroneOwner: async (droneId: string) => {
      const rows = await db
        .select({ ownerId: drones.ownerId })
        .from(drones)
        .where(eq(drones.id, droneId))
        .limit(1);
      return rows[0] ?? null;
    },

    queryHistory: async ({
      droneId,
      from,
      to,
      bbox,
      limit,
    }: {
      droneId: string;
      from: Date;
      to: Date;
      bbox?: BoundingBox;
      limit: number;
    }): Promise<HistoryPoint[]> => {
      const conditions = [
        eq(telemetry.droneId, droneId),
        gte(telemetry.ts, from),
        lte(telemetry.ts, to),
        ...(bbox !== undefined
          ? [
              sql`ST_Within(${telemetry.position}, ST_MakeEnvelope(${bbox.minLng}, ${bbox.minLat}, ${bbox.maxLng}, ${bbox.maxLat}, 4326))`,
            ]
          : []),
      ];

      const rows = await db
        .select({
          ts: sql<number>`EXTRACT(EPOCH FROM ${telemetry.ts}) * 1000`,
          lat: sql<number>`ST_Y(${telemetry.position}::geometry)`,
          lng: sql<number>`ST_X(${telemetry.position}::geometry)`,
          altitudeM: telemetry.altitudeM,
          headingDeg: telemetry.headingDeg,
          speedMps: telemetry.speedMps,
          batteryPct: telemetry.batteryPct,
        })
        .from(telemetry)
        .where(and(...conditions))
        .orderBy(asc(telemetry.ts))
        .limit(limit);

      return rows.map((r) => ({
        ts: r.ts,
        lat: r.lat,
        lng: r.lng,
        altitude_m: r.altitudeM,
        heading_deg: r.headingDeg,
        speed_mps: r.speedMps,
        battery_pct: r.batteryPct,
      }));
    },
  };
}
