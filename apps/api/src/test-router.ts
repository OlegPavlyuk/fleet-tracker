// apps/api/src/test-router.ts
import { Router } from 'express';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AppDb } from './db/client.js';
import { telemetry } from './db/schema.js';
import { ValidationError } from './errors/index.js';

const SeedTelemetrySchema = z.object({
  droneId: z.string().uuid(),
  points: z
    .array(
      z.object({
        ts: z.number().int().positive(),
        lat: z.number(),
        lng: z.number(),
        altitude_m: z.number(),
        heading_deg: z.number(),
        speed_mps: z.number(),
        battery_pct: z.number(),
      }),
    )
    .min(1),
});

export function createTestRouter(db: AppDb): Router {
  const router = Router();

  router.post('/seed-telemetry', async (req, res, next) => {
    try {
      const parsed = SeedTelemetrySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid body');
      }
      const { droneId, points } = parsed.data;
      await db.insert(telemetry).values(
        points.map((p) => ({
          droneId,
          ts: new Date(p.ts),
          position: sql`ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)`,
          altitudeM: p.altitude_m,
          headingDeg: p.heading_deg,
          speedMps: p.speed_mps,
          batteryPct: p.battery_pct,
        })),
      );
      res.status(201).json({ inserted: points.length });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
