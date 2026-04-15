import { eq, and } from 'drizzle-orm';
import type { DroneDeps, DroneRecord } from './routes.js';
import { db as globalDb } from '../db/index.js';
import type { AppDb } from '../db/client.js';
import { drones } from '../db/schema.js';

function toRecord(row: typeof drones.$inferSelect): DroneRecord {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    model: row.model,
    status: row.status,
    deviceTokenHash: row.deviceTokenHash,
    createdAt: row.createdAt,
  };
}

export function makeDbDroneDeps(db: AppDb = globalDb): DroneDeps {
  return {
    async listByOwner(ownerId) {
      const rows = await db.select().from(drones).where(eq(drones.ownerId, ownerId));
      return rows.map(toRecord);
    },

    async create(data) {
      const [row] = await db
        .insert(drones)
        .values({
          id: data.id,
          ownerId: data.ownerId,
          name: data.name,
          model: data.model,
          status: data.status,
          deviceTokenHash: data.deviceTokenHash,
        })
        .returning();
      return toRecord(row!);
    },

    async findByIdAndOwner(id, ownerId) {
      const [row] = await db
        .select()
        .from(drones)
        .where(and(eq(drones.id, id), eq(drones.ownerId, ownerId)))
        .limit(1);
      return row ? toRecord(row) : null;
    },

    async update(id, ownerId, patch) {
      const [row] = await db
        .update(drones)
        .set(patch)
        .where(and(eq(drones.id, id), eq(drones.ownerId, ownerId)))
        .returning();
      return row ? toRecord(row) : null;
    },

    async delete(id, ownerId) {
      const result = await db
        .delete(drones)
        .where(and(eq(drones.id, id), eq(drones.ownerId, ownerId)))
        .returning({ id: drones.id });
      return result.length > 0;
    },
  };
}
