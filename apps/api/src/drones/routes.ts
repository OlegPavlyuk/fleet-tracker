import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { requireAuth, type AuthenticatedRequest } from '../auth/middleware.js';
import { ValidationError, NotFoundError } from '../errors/index.js';

export interface DroneRecord {
  id: string;
  ownerId: string;
  name: string;
  model: string;
  status: 'active' | 'idle' | 'offline';
  deviceTokenHash: string;
  createdAt: Date;
}

export interface DroneDeps {
  listByOwner: (ownerId: string) => Promise<DroneRecord[]>;
  create: (data: DroneRecord) => Promise<DroneRecord>;
  findByIdAndOwner: (id: string, ownerId: string) => Promise<DroneRecord | null>;
  update: (
    id: string,
    ownerId: string,
    patch: Partial<Pick<DroneRecord, 'name' | 'model' | 'status'>>,
  ) => Promise<DroneRecord | null>;
  delete: (id: string, ownerId: string) => Promise<boolean>;
}

const CreateDroneSchema = z.object({
  name: z.string().min(1),
  model: z.string().min(1),
});

const UpdateDroneSchema = z
  .object({
    name: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    status: z.enum(['active', 'idle', 'offline']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'At least one field required' });

function toResponse(drone: DroneRecord): Omit<DroneRecord, 'deviceTokenHash'> {
  const { deviceTokenHash: _, ...rest } = drone;
  return rest;
}

export function createDroneRouter(deps: DroneDeps): Router {
  const router = Router();

  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      const drones = await deps.listByOwner(user.sub);
      res.json({ drones: drones.map(toResponse) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      const { user } = req as AuthenticatedRequest;
      const result = CreateDroneSchema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError(result.error.issues[0]?.message ?? 'Validation failed');
      }
      const { name, model } = result.data;

      const deviceToken = randomUUID();
      const deviceTokenHash = createHash('sha256').update(deviceToken).digest('hex');

      const drone = await deps.create({
        id: randomUUID(),
        ownerId: user.sub,
        name,
        model,
        status: 'idle',
        deviceTokenHash,
        createdAt: new Date(),
      });

      res.status(201).json({ drone: toResponse(drone), deviceToken });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const { id } = req.params;
      const result = UpdateDroneSchema.safeParse(req.body);
      if (!result.success) {
        throw new ValidationError(result.error.issues[0]?.message ?? 'Validation failed');
      }

      const patch: Partial<Pick<DroneRecord, 'name' | 'model' | 'status'>> = {};
      if (result.data.name !== undefined) patch.name = result.data.name;
      if (result.data.model !== undefined) patch.model = result.data.model;
      if (result.data.status !== undefined) patch.status = result.data.status;

      const updated = await deps.update(id, user.sub, patch);
      if (!updated) throw new NotFoundError('Drone not found');

      res.json({ drone: toResponse(updated) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    try {
      const { user } = req as unknown as AuthenticatedRequest;
      const { id } = req.params;

      const deleted = await deps.delete(id, user.sub);
      if (!deleted) throw new NotFoundError('Drone not found');

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
