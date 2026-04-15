import { eq } from 'drizzle-orm';
import { db as globalDb } from '../db/index.js';
import type { AppDb } from '../db/client.js';
import { drones } from '../db/schema.js';
import type { IngestDeps } from './server.js';

export function makeDbIngestDeps(db: AppDb = globalDb): Pick<IngestDeps, 'findDroneByTokenHash'> {
  return {
    async findDroneByTokenHash(tokenHash) {
      const [row] = await db
        .select({ id: drones.id })
        .from(drones)
        .where(eq(drones.deviceTokenHash, tokenHash))
        .limit(1);
      return row ?? null;
    },
  };
}
