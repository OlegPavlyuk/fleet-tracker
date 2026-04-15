import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../errors/index.js';

export interface HistoryPoint {
  ts: number; // Unix ms
  lat: number;
  lng: number;
  altitude_m: number;
  heading_deg: number;
  speed_mps: number;
  battery_pct: number;
}

export interface BoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface TelemetryDeps {
  findDroneOwner: (droneId: string) => Promise<{ ownerId: string } | null>;
  queryHistory: (params: {
    droneId: string;
    from: Date;
    to: Date;
    bbox?: BoundingBox;
    limit: number;
  }) => Promise<HistoryPoint[]>;
}

const HistoryQuerySchema = z
  .object({
    drone_id: z.string().uuid('drone_id must be a valid UUID'),
    from: z.coerce.number().int().positive(),
    to: z.coerce.number().int().positive(),
    bbox: z.string().optional(),
  })
  .refine((d) => d.from < d.to, { message: 'from must be less than to' });

const BboxSchema = z
  .string()
  .transform((s) => s.split(',').map(Number))
  .refine((parts) => parts.length === 4 && parts.every(isFinite), {
    message: 'bbox must be "minLng,minLat,maxLng,maxLat"',
  })
  .transform(([minLng, minLat, maxLng, maxLat]) => ({
    minLng: minLng!,
    minLat: minLat!,
    maxLng: maxLng!,
    maxLat: maxLat!,
  }));

export function createTelemetryRouter(deps: TelemetryDeps): Router {
  const router = Router();

  router.get('/history', requireAuth, async (req, res, next) => {
    try {
      const parsed = HistoryQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid query params');
      }

      const { drone_id, from, to, bbox: rawBbox } = parsed.data;
      const userId = (req as AuthenticatedRequest).user.sub;

      const drone = await deps.findDroneOwner(drone_id);
      if (!drone) throw new NotFoundError('Drone not found');
      if (drone.ownerId !== userId) throw new ForbiddenError('Access denied');

      let bbox: BoundingBox | undefined;
      if (rawBbox !== undefined) {
        const bboxParsed = BboxSchema.safeParse(rawBbox);
        if (!bboxParsed.success) {
          throw new ValidationError(bboxParsed.error.issues[0]?.message ?? 'Invalid bbox');
        }
        bbox = bboxParsed.data;
      }

      const points = await deps.queryHistory({
        droneId: drone_id,
        from: new Date(from),
        to: new Date(to),
        ...(bbox !== undefined ? { bbox } : {}),
        limit: 5000,
      });

      res.json({ droneId: drone_id, from, to, points });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
