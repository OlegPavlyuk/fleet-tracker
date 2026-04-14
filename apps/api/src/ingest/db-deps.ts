import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { drones } from '../db/schema.js';
import type { IngestDeps } from './server.js';

export function makeDbIngestDeps(): Pick<IngestDeps, 'findDroneByTokenHash'> {
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
